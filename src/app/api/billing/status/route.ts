import { NextRequest, NextResponse } from 'next/server';
import { getStrictSession } from '@/lib/server/auth';
import { getStatusForUser } from '@/lib/server/billing/billing-core';
import { billingDeps } from '@/lib/server/billing/billing-service';

export const dynamic = 'force-dynamic';

/** Assinatura do PRÓPRIO cliente logado. ?refresh=1 confere no Mercado Pago na hora (tela de retorno). */
export async function GET(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Entre na sua conta.', code: 'UNAUTHORIZED' }, { status: 401 });
  try {
    const status = await getStatusForUser(billingDeps(), session.userId, { refresh: req.nextUrl.searchParams.get('refresh') === '1' });
    return NextResponse.json({ ok: true, subscription: status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Falha ao consultar a assinatura.' }, { status: 502 });
  }
}
