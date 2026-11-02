import { loadEnvConfig } from '@next/env';
import { serialPoll } from './lib/client/serial-poll';

let stopping = false;
let stopHeartbeat = () => {};

async function start() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
  const { copierHeartbeat, runDurableCopierCycle } = await import('./lib/server/copier-runtime');
  stopHeartbeat = serialPoll(async () => {
    try { await copierHeartbeat(); }
    catch { console.error('[Copiador] Não foi possível registrar heartbeat. Confira o banco e a migração 06.'); }
    return stopping;
  }, 15000);
  console.log('[Copiador] Worker persistente iniciado.');
  while (!stopping) {
    let busy = false;
    try {
      const cycle = await runDurableCopierCycle();
      busy = cycle.processed > 0 || cycle.dispatched > 0;
      if (busy) console.log('[Copiador] Ciclo: ' + cycle.processed + ' eventos processados; ' + cycle.dispatched + ' publicações avaliadas.');
    }
    catch { console.error('[Copiador] Ciclo não concluído. Confira a conexão do banco, a migração 06 e as configurações das contas.'); }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, busy ? 50 : 750));
  }
  stopHeartbeat();
}
process.on('SIGTERM', () => { stopping = true; stopHeartbeat(); });
process.on('SIGINT', () => { stopping = true; stopHeartbeat(); });
void start().catch(() => { stopHeartbeat(); process.exitCode = 1; });
