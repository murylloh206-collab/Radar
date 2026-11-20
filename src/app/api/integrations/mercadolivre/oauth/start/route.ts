import { NextRequest, NextResponse } from 'next/server';
import { getStrictSession } from '@/lib/server/auth';
import { isAssistantOwner } from '@/lib/server/assistant/access';
import { buildAuthorization } from '@/lib/server/ml-api';

export const dynamic = 'force-dynamic';

/** Leva a conta dona para a tela oficial de autorização do Mercado Livre (só leitura). */
export async function GET(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session || !isAssistantOwner(session.userId)) return NextResponse.json({ ok: false, error: 'Página não encontrada.' }, { status: 404 });
  const auth = buildAuthorization(session.userId);
  if (!auth) return NextResponse.json({ ok: false, error: 'Chaves do aplicativo do Mercado Livre não configuradas no servidor.' }, { status: 503 });
  return NextResponse.redirect(auth.url);
}
