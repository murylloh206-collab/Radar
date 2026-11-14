import { NextRequest, NextResponse } from 'next/server';
import { checkCronSecret } from '@/lib/server/cron-auth';
import { reconcileAll } from '@/lib/server/billing/billing-core';
import { billingDeps } from '@/lib/server/billing/billing-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Reconciliação horária: confere no Mercado Pago as assinaturas, caso alguma notificação não tenha chegado. */
export async function POST(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;
  const report = await reconcileAll(billingDeps());
  return NextResponse.json({ ok: true, report });
}
