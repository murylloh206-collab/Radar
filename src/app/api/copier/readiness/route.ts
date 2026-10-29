import { NextRequest, NextResponse } from 'next/server';
import { getSystemReadiness } from '@/lib/server/readiness';
import { readDatabase } from '@/lib/server/storage';

export async function GET(req: NextRequest) {
  try {
    const db = readDatabase();
    const readiness = getSystemReadiness(db);
    return NextResponse.json({ ok: true, readiness });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
