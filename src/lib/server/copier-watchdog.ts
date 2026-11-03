import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { runDurableCopierCycle } from './copier-runtime';

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
 * 2. Verifica a saúde do WebSocket Baileys da Evolution API.
 * 3. Se detectar socket zumbi, desconectado ou inativo por mais de 45min de dia, reinicia a instância automaticamente.
 * 4. Drena e processa qualquer mensagem pendente na fila.
 */
export async function runCopierWatchdog(forceRestart = false): Promise<WatchdogReport> {
  const now = new Date();
  const timestamp = now.toISOString();

  let baseUrl = process.env.EVOLUTION_BASE_URL || process.env.EVOLUTION_API_URL || DEFAULT_GATEWAY_URL;
  let apiKey = process.env.EVOLUTION_API_KEY || DEFAULT_GATEWAY_KEY;
  let instanceName = process.env.EVOLUTION_INSTANCE_NAME || DEFAULT_INSTANCE_NAME;

  // 1. Tentar ler do Supabase as credenciais reais da conexão
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: waConns } = await supabase.from('whatsapp_connections').select('*').limit(1);
      if (waConns?.[0]?.instance_name) {
        instanceName = waConns[0].instance_name;
      }
      const { data: legacy } = await supabase.from('integrations_whatsapp').select('*').limit(1);
      if (legacy?.[0]) {
        if (legacy[0].base_url) baseUrl = legacy[0].base_url;
        if (legacy[0].api_key) apiKey = legacy[0].api_key;
        if (legacy[0].instance_name) instanceName = legacy[0].instance_name;
      }
    } catch {}
  }

  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  let gatewayAlive = false;
  let gatewayHttpStatus = 0;

  // 2. Ping Keep-Alive no Gateway (impede o Render de suspender)
  try {
    const pingRes = await fetch(`${cleanBaseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    gatewayHttpStatus = pingRes.status;
    gatewayAlive = pingRes.ok;
  } catch (err) {
    gatewayHttpStatus = 503;
    gatewayAlive = false;
  }

  // 3. Checar Estado da Conexão
  let currentState = 'unknown';
  let shouldRestart = forceRestart;
  let restartReason = forceRestart ? 'Forçado manualmente pelo usuário' : '';

  if (gatewayAlive) {
    try {
      const stateRes = await fetch(`${cleanBaseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      });
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        currentState = stateData?.instance?.state || stateData?.state || 'unknown';
      }
    } catch {}

    if (['close', 'closed', 'disconnected'].includes(currentState.toLowerCase())) {
      shouldRestart = true;
      restartReason = `Instância estava desconectada (state: ${currentState})`;
    } else if (currentState.toLowerCase() !== 'open') {
      shouldRestart = true;
      restartReason = `Instância não confirmada (state: ${currentState})`;
    } else if (!forceRestart && isSupabaseConfigured && supabase) {
      // Detector de Socket Zumbi:
      // Se estamos em horário comercial (08:00 às 22:00 BRT) e a última mensagem recebida tem mais de 45 minutos,
      // o WebSocket pode ter congelado silenciosamente (zombie socket). Reinicia a sessão preventivamente.
      try {
        const brtHour = Number(
          new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            hourCycle: 'h23',
          }).format(now)
        );

        if (brtHour >= 8 && brtHour < 22) {
          const { data: latestInbox } = await supabase
            .from('copier_inbox')
            .select('received_at')
            .order('received_at', { ascending: false })
            .limit(1);

          if (latestInbox?.[0]?.received_at) {
            const lastMs = Date.now() - new Date(latestInbox[0].received_at).getTime();
            const minutesSinceLast = Math.round(lastMs / (60 * 1000));
            // Mais de 45 minutos sem nenhuma mensagem do grupo no meio do dia
            if (minutesSinceLast >= 45) {
              shouldRestart = true;
              restartReason = `Detector anti-zombie: ${minutesSinceLast} minutos sem eventos recebidos em horário comercial`;
            }
          }
        }
      } catch {}
    }
  }

  // 4. Executar Auto-Restart se necessário
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
        // Atualizar last_ping_at no Supabase
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

  // 5. Drenagem e Execução do Ciclo de Envios
  let cycleRes = { processed: 0, dispatched: 0 };
  try {
    cycleRes = await runDurableCopierCycle();
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
    cycle: cycleRes,
  };
}
