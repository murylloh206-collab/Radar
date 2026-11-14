import { NextRequest, NextResponse } from 'next/server';
import { exchangePairingCode } from '@/lib/server/extension-auth';

export const dynamic = 'force-dynamic';

/** A extensão troca o código do painel por um token próprio desta conta. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = await exchangePairingCode(String(body?.code || ''));
  if (!result) {
    return NextResponse.json({ ok: false, error: 'Código inválido ou expirado. Gere um novo no painel.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, token: result.token }, { headers: { 'Cache-Control': 'no-store' } });
}
