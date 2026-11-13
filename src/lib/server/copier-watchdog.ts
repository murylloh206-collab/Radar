import 'server-only';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { acceptCopierEvent, runDurableCopierCycle, serviceSession } from './copier-runtime';
import { extractUrlsFromText, extractWhatsAppMessageText } from './copier-service';
import { copierConnections } from './copier-group-catalog';
import { readDatabase } from './storage';

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
  connections: WatchdogConnectionResult[];
  error?: string;
}

export interface WatchdogConnectionResult {
  connectionId: string;
  instanceName: string;
  state: string;
  restarted: boolean;
  recoveredFromHistory: number;
  error?: string;
}

type WatchdogTarget = { connectionId: string; userId: string; instanceName: string; baseUrl: string; apiKey: string };

/** Lista as conexões a verificar, cada uma com as credenciais do próprio cadastro (nunca chaves embutidas). */
async function listWatchdogTargets(userId?: string): Promise<WatchdogTarget[]> {
  const userIds = new Set<string>();
  if (userId) userIds.add(userId);
  else if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.from('whatsapp_connections').select('user_id');
    for (const row of data || []) if (row.user_id) userIds.add(String(row.user_id));
  } else {
    for (const connection of readDatabase().connections || []) if (connection.userId) userIds.add(connection.userId);
  }
  const targets: WatchdogTarget[] = [];
  for (const id of userIds) {
    const connections = await copierConnections(serviceSession(id)).catch(() => []);
    for (const connection of connections) {
      targets.push({ connectionId: connection.id, userId: id, instanceName: connection.instanceName,
        baseUrl: connection.baseUrl, apiKey: connection.apiKey });
    }
  }
  return targets;
}

/**
 * Watchdog Sentinela de Auto-Cura do Copiador, para TODAS as conexões (ou só as do usuário informado):
 * 1. Pinga o gateway para mantê-lo acordado (anti-sleep).
 * 2. Verifica a saúde da sessão do WhatsApp (aguardando handshake caso esteja em 'connecting').
 * 3. Se detectar sessão desconectada, reconecta/reinicia a instância automaticamente.
 * 4. Busca as últimas mensagens dos grupos de origem ativos (recuperação pós-hibernação).
 * 5. Drena e processa qualquer mensagem pendente na fila (uma vez, ao final).
 */
export async function runCopierWatchdog(
  forceRestart = false,
  options: { userId?: string; connectionId?: string; budgetMs?: number } = {},
): Promise<WatchdogReport> {
  const timestamp = new Date().toISOString();
  // Orçamento de tempo das verificações: sobra tempo para drenar a fila dentro do limite de 60s da Vercel.
  const budgetMs = options.budgetMs ?? 35000;
  const deadline = Date.now() + budgetMs;
  const targets = (await listWatchdogTargets(options.userId))
    .filter(target => !options.connectionId || target.connectionId === options.connectionId);
  type Result = WatchdogConnectionResult & { gatewayStatus: number; gatewayUrl: string; alive: boolean; reason?: string };
  const failed = (target: WatchdogTarget, error: string): Result => ({ connectionId: target.connectionId, instanceName: target.instanceName,
    state: 'unknown', restarted: false, recoveredFromHistory: 0, error, gatewayStatus: 0, gatewayUrl: target.baseUrl, alive: false });

  // Todas as conexões em paralelo; uma conexão lenta não segura as demais nem a fila.
  const results: Result[] = await Promise.all(targets.map(async target => {
    if (!target.baseUrl || !target.apiKey || !target.instanceName) return failed(target, 'Gateway não configurado');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<Result>(resolve => {
      timer = setTimeout(() => resolve(failed(target, 'Tempo esgotado ao verificar a conexão com o gateway.')), Math.max(deadline - Date.now(), 0));
    });
    try {
      return await Promise.race([
        watchConnection(target, forceRestart, timestamp, deadline)
          .catch(error => failed(target, error instanceof Error ? error.message : 'Falha ao verificar a conexão')),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }));

  // Drenagem e execução do ciclo de envios (uma vez para todas as conexões)
  const cycleRes = { processed: 0, dispatched: 0 };
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
    console.error('[Watchdog] Erro ao executar ciclo:', cycleErr instanceof Error ? cycleErr.message : cycleErr);
  }

  const first = results[0];
  return {
    ok: results.length > 0 && results.filter(result => result.error !== 'Gateway não configurado' || options.connectionId).every(result => result.alive),
    timestamp,
    gatewayPing: { status: first?.gatewayStatus || 0, url: (first?.gatewayUrl || '').replace(/\/+$/, ''), alive: !!first?.alive },
    connectionState: { instanceName: first?.instanceName, state: first?.state, restarted: first?.restarted, reason: first?.reason },
    recoveredFromHistory: results.reduce((sum, result) => sum + result.recoveredFromHistory, 0),
    cycle: cycleRes,
    connections: results.map(({ connectionId, instanceName, state, restarted, recoveredFromHistory, error }) =>
      ({ connectionId, instanceName, state, restarted, recoveredFromHistory, ...(error ? { error } : {}) })),
    ...(results.length === 0 ? { error: 'Nenhuma conexão de WhatsApp cadastrada.' } : {}),
  };
}

async function watchConnection(target: WatchdogTarget, forceRestart: boolean, timestamp: string, deadline: number) {
  const { baseUrl, apiKey, instanceName } = target;
  const connectionRow: Record<string, unknown> | null = isSupabaseConfigured && supabase
    ? (await supabase.from('whatsapp_connections').select('id,webhook_secret').eq('id', target.connectionId).maybeSingle()).data
    : null;

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
          .eq('id', target.connectionId);
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
            .eq('id', target.connectionId);
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
        // Sem tempo suficiente para mais uma busca de histórico: deixa para o próximo ciclo (5 min).
        if (Date.now() > deadline - 10000) break;
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

  return {
    connectionId: target.connectionId,
    instanceName,
    state: currentState,
    restarted: didRestart,
    recoveredFromHistory,
    reason: restartReason || undefined,
    gatewayStatus: gatewayHttpStatus,
    gatewayUrl: cleanBaseUrl,
    alive: gatewayAlive,
  };
}
