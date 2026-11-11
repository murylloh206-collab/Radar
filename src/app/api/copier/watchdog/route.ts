import { NextRequest, NextResponse } from 'next/server';
import { runCopierWatchdog } from '@/lib/server/copier-watchdog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const forceRestart = req.nextUrl.searchParams.get('restart') === 'true';
    const report = await runCopierWatchdog(forceRestart);
    return NextResponse.json(report, {
      headers: {
        'Cache-Control': 'no-store, no-cache',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na execução do watchdog.';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
