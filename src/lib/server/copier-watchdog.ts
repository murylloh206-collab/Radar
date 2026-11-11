import 'server-only';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { acceptCopierEvent, runDurableCopierCycle } from './copier-runtime';
import { extractUrlsFromText, extractWhatsAppMessageText } from './copier-service';

export interface WatchdogReport {
  ok: boolean;
  timestamp: string;
  gatewayPing: {
    status: number;
    url: string;
    alive: boolean;
  };
  connectionState: {
    instanceName?: string;
    state?: string;
    restarted?: boolean;
    reason?: string;
  };
  recoveredFromHistory?: number;
  cycle: {
    processed: number;
    dispatched: number;
  };
  error?: string;
}

const DEFAULT_GATEWAY_URL = 'https://radar-whatsapp-gateway.onrender.com';
const DEFAULT_GATEWAY_KEY = 'radar_wa_key_88392104';
const DEFAULT_INSTANCE_NAME = 'radar_00000000_4453f2';

/**
 * Watchdog Sentinela de Auto-Cura do Copiador:
 * 1. Pinga o servidor Render para mantê-lo 100% acordado (anti-sleep).
 * 2. Verifica a saúde do WebSocket Baileys da Evolution API (aguardando handshake caso esteja em 'connecting').
 * 3. Se detectar socket desconectado, reconecta/reinicia a instância automaticamente.
 * 4. Busca ativamente na Evolution API as últimas mensagens dos grupos de origem ativos (recuperação pós-hibernação).
 * 5. Drena e processa qualquer mensagem pendente na fila.
 */
export async function runCopierWatchdog(forceRestart = false): Promise<WatchdogReport> {
  const now = new Date();
  const timestamp = now.toISOString();

  let baseUrl = process.env.EVOLUTION_BASE_URL || process.env.EVOLUTION_API_URL || DEFAULT_GATEWAY_URL;
  let apiKey = process.env.EVOLUTION_API_KEY || DEFAULT_GATEWAY_KEY;
  let instanceName = process.env.EVOLUTION_INSTANCE_NAME || DEFAULT_INSTANCE_NAME;
  let connectionRow: Record<string, unknown> | null = null;

  // 1. Tentar ler do Supabase as credenciais reais da conexão
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: waConns } = await supabase.from('whatsapp_connections').select('*').limit(1);
      if (waConns?.[0]) {
        connectionRow = waConns[0];
        if (waConns[0].instance_name) instanceName = String(waConns[0].instance_name);
        if (waConns[0].base_url) baseUrl = String(waConns[0].base_url);
        if (waConns[0].api_key) apiKey = String(waConns[0].api_key);
      }
      const { data: legacy } = await supabase.from('integrations_whatsapp').select('*').limit(1);
      if (legacy?.[0]) {
        if (legacy[0].base_url) baseUrl = legacy[0].base_url;
        if (legacy[0].api_key) apiKey = legacy[0].api_key;
        if (!connectionRow && legacy[0].instance_name) instanceName = legacy[0].instance_name;
      }
    } catch {}
  }

  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  let gatewayAlive = false;
  let gatewayHttpStatus = 0;
  let currentState = 'unknown';

  const fetchConnectionState = async (timeoutMs = 10000): Promise<{ ok: boolean; status: number; state: string }> => {
    try {
      const res = await fetch(`${cleanBaseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });
      if (!res.ok) return { ok: false, status: res.status, state: 'unknown' };
      const data = await res.json();
      const state = String(data?.instance?.state || data?.state || 'unknown');
      return { ok: true, status: res.status, state };
    } catch {
      return { ok: false, status: 503, state: 'unknown' };
    }
  };

  // 2. Ping Keep-Alive + Leitura do Estado da Conexão no Gateway
  const initialCheck = await fetchConnectionState(12000);
  gatewayHttpStatus = initialCheck.status;
  gatewayAlive = initialCheck.ok;
  currentState = initialCheck.state;

  // Se o Render acabou de acordar e o Baileys está em 'connecting', aguarda 6s antes de tomar qualquer ação
  // (dar restart durante 'connecting' interrompe o handshake e derruba a sessão!)
  if (gatewayAlive && currentState.toLowerCase() === 'connecting' && !forceRestart) {
    await new Promise((r) => setTimeout(r, 6000));
    const recheck = await fetchConnectionState(8000);
    if (recheck.ok) {
      currentState = recheck.state;
    }
  }

  let shouldRestart = forceRestart;
  let restartReason = forceRestart ? 'Forçado manualmente pelo usuário' : '';

  if (gatewayAlive) {
    const normalizedState = currentState.toLowerCase();
    if (['close', 'closed', 'disconnected'].includes(normalizedState)) {
      // Tentar reconectar suavemente via /instance/connect antes de forçar restart
      try {
        await fetch(`${cleanBaseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
          headers: { apikey: apiKey },
          signal: AbortSignal.timeout(8000),
          cache: 'no-store',
        });
        await new Promise((r) => setTimeout(r, 3000));
        const afterConnect = await fetchConnectionState(6000);
        if (afterConnect.ok && ['open', 'connecting'].includes(afterConnect.state.toLowerCase())) {
          currentState = afterConnect.state;
        } else {
          shouldRestart = true;
          restartReason = `Instância estava desconectada (state: ${currentState})`;
        }
      } catch {
        shouldRestart = true;
        restartReason = `Instância estava desconectada (state: ${currentState})`;
      }
    } else if (normalizedState !== 'open' && normalizedState !== 'connecting') {
      shouldRestart = true;
      restartReason = `Instância não confirmada (state: ${currentState})`;
    } else if (normalizedState === 'open' && !forceRestart && isSupabaseConfigured && supabase) {
      // Atualizar status conectado no banco caso estivesse desatualizado
      try {
        await supabase
          .from('whatsapp_connections')
          .update({ last_ping_at: timestamp, status: 'connected' })
          .eq('instance_name', instanceName);
      } catch {}
    }
  }

  // 4. Executar Auto-Restart somente se realmente necessário
  let didRestart = false;
  if (shouldRestart && gatewayAlive) {
    try {
      const restartRes = await fetch(`${cleanBaseUrl}/instance/restart/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(15000),
      });
      didRestart = restartRes.ok;
      if (didRestart) {
        currentState = 'restarted_open';
        if (isSupabaseConfigured && supabase) {
          await supabase
            .from('whatsapp_connections')
            .update({ last_ping_at: timestamp, status: 'connected' })
            .eq('instance_name', instanceName);
        }
      }
    } catch (restartErr) {
      restartReason += ` | Falha ao reiniciar: ${restartErr instanceof Error ? restartErr.message : String(restartErr)}`;
    }
  }

  // 5. Recuperação Ativa de Mensagens dos Grupos de Origem (caso o Render estivesse dormindo quando a mensagem chegou)
  let recoveredFromHistory = 0;
  if (
    gatewayAlive &&
    ['open', 'restarted_open'].includes(currentState.toLowerCase()) &&
    isSupabaseConfigured &&
    supabase &&
    connectionRow?.webhook_secret
  ) {
    try {
      const { data: activeSources } = await supabase
        .from('copy_sources')
        .select('source_jid')
        .eq('connection_id', String(connectionRow.id))
        .eq('is_active', true);

      const twoHoursAgoSec = Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000);

      for (const src of activeSources || []) {
        const sourceJid = String(src.source_jid || '');
        if (!sourceJid) continue;
        try {
          const histRes = await fetch(`${cleanBaseUrl}/chat/findMessages/${encodeURIComponent(instanceName)}`, {
            method: 'POST',
            headers: { apikey: apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              where: { key: { remoteJid: sourceJid } },
              limit: 6,
            }),
            signal: AbortSignal.timeout(8000),
            cache: 'no-store',
          });
          if (!histRes.ok) continue;
          const histData = await histRes.json();
          const records: unknown[] =
            histData?.messages?.records ||
            (Array.isArray(histData?.messages) ? histData.messages : Array.isArray(histData) ? histData : []);

          const recentRecords = records
            .filter((rec: any) => {
              if (!rec?.key?.id || rec?.key?.fromMe) return false;
              const ts = Number(rec?.messageTimestamp || 0);
              if (ts > 0 && ts < twoHoursAgoSec) return false;
              const txt = extractWhatsAppMessageText(rec);
              return extractUrlsFromText(txt).length > 0;
            })
            .slice(0, 5);

          if (recentRecords.length > 0) {
            const acceptRes = await acceptCopierEvent(
              {
                event: 'messages.upsert',
                instance: instanceName,
                data: recentRecords as any,
              },
              String(connectionRow.webhook_secret)
            );
            recoveredFromHistory += acceptRes.inserted || 0;
          }
        } catch {}
      }
    } catch {}
  }

  // 6. Drenagem e Execução do Ciclo de Envios
  let cycleRes = { processed: 0, dispatched: 0 };
  try {
    const first = await runDurableCopierCycle();
    cycleRes.processed += first.processed;
    cycleRes.dispatched += first.dispatched;
    if (first.processed > 0) {
      const second = await runDurableCopierCycle();
      cycleRes.processed += second.processed;
      cycleRes.dispatched += second.dispatched;
    }
  } catch (cycleErr) {
    console.error('[Watchdog] Erro ao executar ciclo:', cycleErr);
  }

  return {
    ok: gatewayAlive,
    timestamp,
    gatewayPing: {
      status: gatewayHttpStatus,
      url: cleanBaseUrl,
      alive: gatewayAlive,
    },
    connectionState: {
      instanceName,
      state: currentState,
      restarted: didRestart,
      reason: restartReason || undefined,
    },
    recoveredFromHistory,
    cycle: cycleRes,
  };
}
