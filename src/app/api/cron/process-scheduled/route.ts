import { NextRequest, NextResponse } from 'next/server';
import { runCopierWatchdog } from '@/lib/server/copier-watchdog';
import { runDurableCopierCycle } from '@/lib/server/copier-runtime';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Rota de compatibilidade para cronjobs legados ou externos:
 * /api/cron/process-scheduled
 * 
 * Executa o Sentinela de Auto-Cura (keep-alive anti-sleep no Render, verificação
 * de conexão do WhatsApp) e drena a fila de envios pendentes.
 */
export async function GET(req: NextRequest) {
  try {
    const forceRestart = req.nextUrl.searchParams.get('restart') === 'true';
    const watchdogReport = await runCopierWatchdog(forceRestart);
    const cycleReport = await runDurableCopierCycle();

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      watchdog: watchdogReport,
      cycle: cycleReport,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao processar agendamento cron.';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
