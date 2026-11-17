import { NextRequest, NextResponse } from 'next/server';
import { getStrictSession } from '@/lib/server/auth';
import { cancelForUser, getStatusForUser, BillingError } from '@/lib/server/billing/billing-core';
import { billingDeps } from '@/lib/server/billing/billing-service';
import { logAccess } from '@/lib/server/compliance';
import { notifyOwner } from '@/lib/server/owner-notify';

export const dynamic = 'force-dynamic';

const ARREPENDIMENTO_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cancela a assinatura do próprio cliente. O acesso continua até o fim do período já pago.
 * Dentro de 7 dias da primeira contratação vale o direito de arrependimento (CDC, art. 49):
 * o responsável é avisado na hora para fazer o estorno integral no Mercado Pago.
 */
export async function POST(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Entre na sua conta.', code: 'UNAUTHORIZED' }, { status: 401 });
  const deps = billingDeps();
  try {
    const before = await deps.repo.latestForUser(session.userId, deps.env);
    await cancelForUser(deps, session.userId);
    const createdAt = before?.createdAt ? new Date(before.createdAt).getTime() : NaN;
    const arrependimento = Number.isFinite(createdAt) && Date.now() - createdAt <= ARREPENDIMENTO_MS && before?.lastPaymentStatus === 'approved';
    await logAccess(arrependimento ? 'cancelamento_arrependimento' : 'cancelamento', req.headers, session.userId, { planId: before?.planId || null });
    if (arrependimento) {
      await notifyOwner({
        title: 'Arrependimento: fazer estorno',
        body: `Cliente cancelou dentro de 7 dias (CDC art. 49). Estornar o valor integral de R$ ${before?.amount ?? '?'} no Mercado Pago (assinatura ${before?.preapprovalId || '?'}).`,
        tags: 'money_with_wings',
        priority: 'high',
      });
    }
    return NextResponse.json({ ok: true, arrependimento, subscription: await getStatusForUser(deps, session.userId) });
  } catch (e) {
    const status = e instanceof BillingError ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Falha ao cancelar.' }, { status });
  }
}
