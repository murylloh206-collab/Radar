import { NextRequest, NextResponse } from 'next/server';
import { getStrictSession } from '@/lib/server/auth';
import { cancelForUser, getStatusForUser, BillingError } from '@/lib/server/billing/billing-core';
import { billingDeps } from '@/lib/server/billing/billing-service';

export const dynamic = 'force-dynamic';

/** Cancela a assinatura do próprio cliente. O acesso continua até o fim do período já pago. */
export async function POST(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Entre na sua conta.', code: 'UNAUTHORIZED' }, { status: 401 });
  const deps = billingDeps();
  try {
    await cancelForUser(deps, session.userId);
    return NextResponse.json({ ok: true, subscription: await getStatusForUser(deps, session.userId) });
  } catch (e) {
    const status = e instanceof BillingError ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Falha ao cancelar.' }, { status });
  }
}
