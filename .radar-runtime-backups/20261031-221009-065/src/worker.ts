import { runWorkerCycle } from './lib/server/worker-engine';

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS || 30000);

let isRunning = true;

async function startWorker() {
  console.log(`[Radar Worker] Iniciado com intervalo de ${INTERVAL_MS / 1000}s`);

  while (isRunning) {
    try {
      const report = await runWorkerCycle();
      if (report.processedCount > 0) {
        console.log(
          `[Radar Worker] ${report.timestamp} — Processados ${report.processedCount} jobs com sucesso.`
        );
      } else if (report.skippedReason) {
        console.log(`[Radar Worker] Ignorado: ${report.skippedReason}`);
      }
    } catch (err) {
      console.error('[Radar Worker] Erro no ciclo de envio:', err);
    }

    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }

  console.log('[Radar Worker] Encerrado com sucesso.');
}

process.on('SIGTERM', () => {
  console.log('[Radar Worker] Recebido SIGTERM. Finalizando...');
  isRunning = false;
});

process.on('SIGINT', () => {
  console.log('[Radar Worker] Recebido SIGINT. Finalizando...');
  isRunning = false;
});

startWorker();
