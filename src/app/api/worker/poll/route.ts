import { NextRequest, NextResponse } from 'next/server';
import { runDurableCopierCycle } from '@/lib/server/copier-runtime';
import { checkCronSecret } from '@/lib/server/cron-auth';
import { runSocialAutopostCycle } from '@/lib/server/social-posts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handlePoll(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;
  const started = Date.now();
  let report: unknown = null;
  let copierError: string | null = null;
  try {
    report = await runDurableCopierCycle();
  } catch (err: unknown) {
    copierError = err instanceof Error ? err.message : String(err);
  }
  // Posts automáticos do Instagram Pro: depois do copiador, isolados e com tempo limitado (nunca atrasam o copiador).
  let social: unknown = null;
  const remaining = 50000 - (Date.now() - started);
  if (remaining > 5000) {
    try { social = await runSocialAutopostCycle({ budgetMs: Math.min(15000, remaining - 3000), deadlineAt: started + 55000 }); }
    catch { social = { error: 'Ciclo de posts automáticos não concluído.' }; }
  }
  if (copierError) return NextResponse.json({ ok: false, error: copierError, social }, { status: 500 });
  return NextResponse.json({ ok: true, report, social });
}

export async function GET(req: NextRequest) {
  return handlePoll(req);
}

export async function POST(req: NextRequest) {
  return handlePoll(req);
}
