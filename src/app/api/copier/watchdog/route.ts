import { NextRequest, NextResponse } from 'next/server';
import { runCopierWatchdog } from '@/lib/server/copier-watchdog';
import { getSessionFromRequest } from '@/lib/server/auth';
import { checkCronSecret } from '@/lib/server/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Painel (sessão do usuário: só as conexões dele) ou agendador (CRON_SECRET: todas as conexões).
  const session = getSessionFromRequest(req);
  if (!session) {
    const denied = checkCronSecret(req);
    if (denied) return denied.status === 400 ? denied : NextResponse.json({ ok: false, error: 'Faça login para verificar a conexão.' }, { status: 401 });
  }
  try {
    const forceRestart = req.nextUrl.searchParams.get('restart') === 'true';
    const report = await runCopierWatchdog(forceRestart, session ? { userId: session.userId } : {});
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store, no-cache' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na execução do watchdog.';
    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
