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
    try { await runDurableCopierCycle(); }
    catch { console.error('[Copiador] Ciclo não concluído. Confira a conexão do banco, a migração 06 e as configurações das contas.'); }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, 2000));
  }
  stopHeartbeat();
}
process.on('SIGTERM', () => { stopping = true; stopHeartbeat(); });
process.on('SIGINT', () => { stopping = true; stopHeartbeat(); });
void start().catch(() => { stopHeartbeat(); process.exitCode = 1; });
