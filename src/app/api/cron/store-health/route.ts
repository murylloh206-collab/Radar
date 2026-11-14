import { NextRequest, NextResponse } from 'next/server';
import { checkCronSecret } from '@/lib/server/cron-auth';
import { runDailyStoreHealth } from '@/lib/server/store-health-checks';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Chamado 1x por dia pelo agendador (pg_cron) para testar a conexão de todas as lojas. */
export async function POST(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;
  try {
    const report = await runDailyStoreHealth({ deadlineAt: Date.now() + 50_000 });
    return NextResponse.json({ ok: true, report }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na checagem das lojas.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
