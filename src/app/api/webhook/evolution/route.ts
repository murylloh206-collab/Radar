import { NextRequest, NextResponse } from 'next/server';
import { acceptCopierEvent, CopierRuntimeError } from '@/lib/server/copier-runtime';

export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET() { return NextResponse.json({ ok: true, service: 'Evolution webhook receiver' }); }
export async function POST(req: NextRequest) {
  if (['secret', 'apikey', 'token'].some(parameter => req.nextUrl.searchParams.has(parameter))) {
    return NextResponse.json({ ok: false, error: 'Autenticação somente por cabeçalho.' }, { status: 400 });
  }
  const started = performance.now();
  try {
    const text = await req.text();
    if (text.length > 2 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'Evento excede o tamanho permitido.' }, { status: 413 });
    let payload;
    try { payload = JSON.parse(text); }
    catch { return NextResponse.json({ ok: false, error: 'JSON inválido.' }, { status: 400 }); }
    if (!payload || typeof payload !== 'object') return NextResponse.json({ ok: false }, { status: 400 });
    const secret = req.headers.get('x-webhook-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const result = await acceptCopierEvent(payload, secret);
    return NextResponse.json({ ok: true, ...result }, { status: 202,
      headers: { 'Cache-Control': 'no-store', 'Server-Timing': `durable-inbox;dur=${(performance.now() - started).toFixed(1)}` } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof CopierRuntimeError ? error.message : 'Não foi possível persistir o evento. O gateway deve tentar novamente.' },
      { status: error instanceof CopierRuntimeError ? error.status : 503 });
  }
}
