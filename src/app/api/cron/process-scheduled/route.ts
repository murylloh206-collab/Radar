import { NextRequest, NextResponse } from 'next/server';
import { runCopierWatchdog } from '@/lib/server/copier-watchdog';
import { checkCronSecret } from '@/lib/server/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Chamado pelo agendador (Supabase pg_cron) a cada 5 minutos, autenticado por CRON_SECRET:
 * verifica as conexões do WhatsApp, recupera mensagens perdidas e drena a fila.
 */
export async function GET(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;
  try {
    const forceRestart = req.nextUrl.searchParams.get('restart') === 'true';
    const watchdogReport = await runCopierWatchdog(forceRestart);
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      watchdog: watchdogReport,
      cycle: watchdogReport.cycle,
    }, { headers: { 'Cache-Control': 'no-store, no-cache' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao processar agendamento cron.';
    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
