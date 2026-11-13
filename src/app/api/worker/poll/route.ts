import { NextRequest, NextResponse } from 'next/server';
import { runDurableCopierCycle } from '@/lib/server/copier-runtime';
import { checkCronSecret } from '@/lib/server/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handlePoll(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;
  try {
    const report = await runDurableCopierCycle();
    return NextResponse.json({ ok: true, report });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handlePoll(req);
}

export async function POST(req: NextRequest) {
  return handlePoll(req);
}
