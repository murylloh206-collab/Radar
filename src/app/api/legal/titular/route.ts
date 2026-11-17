import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { openTitularRequest, TITULAR_KINDS, type TitularKind } from '@/lib/server/compliance';
import { checkPublicRouteRateLimit } from '@/lib/server/rate-limiter';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Pedido de titular (LGPD, art. 18). Público para quem não tem conta, com limite por IP. */
export async function POST(req: NextRequest) {
  if (!checkPublicRouteRateLimit(req, 'storefront', 5).allowed) {
    return NextResponse.json({ ok: false, error: 'Muitos pedidos seguidos. Tente de novo em um minuto.' }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const kind = body?.kind as TitularKind;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!TITULAR_KINDS.includes(kind)) return NextResponse.json({ ok: false, error: 'Escolha o tipo de pedido.' }, { status: 400 });
  if (!EMAIL.test(email)) return NextResponse.json({ ok: false, error: 'Informe um e-mail válido para a resposta.' }, { status: 400 });

  const session = getSessionFromRequest(req);
  const result = await openTitularRequest({ kind, email, details: body?.details, userId: session?.userId || null });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: 'Não consegui registrar o pedido agora. Escreva para o e-mail do Encarregado.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, protocol: result.protocol });
}
