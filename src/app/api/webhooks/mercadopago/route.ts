import { NextRequest, NextResponse } from 'next/server';
import { verifyMercadoPagoSignature } from '@/lib/server/billing/mp-signature';
import { handleNotification } from '@/lib/server/billing/billing-core';
import { billingConfig, billingDeps } from '@/lib/server/billing/billing-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Notificações do Mercado Pago (assinaturas e cobranças). Valida x-signature, consulta o recurso no MP
 * e aplica o estado atual — repetidas ou fora de ordem são inofensivas.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const url = req.nextUrl;
  const type = String(body?.type || body?.topic || url.searchParams.get('type') || url.searchParams.get('topic') || '');
  const dataId = String(url.searchParams.get('data.id') || body?.data?.id || '');
  const cfg = billingConfig();
  const ok = verifyMercadoPagoSignature({
    signature: req.headers.get('x-signature'),
    requestId: req.headers.get('x-request-id'),
    dataId,
    secret: cfg.webhookSecret,
  });
  if (!ok) return NextResponse.json({ ok: false, error: 'Assinatura da notificação inválida.' }, { status: 401 });
  try {
    await handleNotification(billingDeps(), { type, dataId });
  } catch {
    // Falha temporária: responde 500 para o Mercado Pago reenviar (e a reconciliação cobre o resto).
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
