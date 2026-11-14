import { NextRequest, NextResponse } from 'next/server';
import { getStrictSession } from '@/lib/server/auth';
import { createPairingCode } from '@/lib/server/extension-auth';

export const dynamic = 'force-dynamic';

/** Painel logado gera o código de 8 caracteres que a extensão usa para se vincular a esta conta. */
export async function GET(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session?.userId) {
    return NextResponse.json({ ok: false, error: 'Faça login no painel.', code: 'UNAUTHORIZED' }, { status: 401 });
  }
  const { code, expiresAt } = await createPairingCode(session.userId);
  return NextResponse.json({ ok: true, code, expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
}
