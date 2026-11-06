import { NextRequest, NextResponse } from 'next/server';
import { checkPlanFeatureAccess, resolveCurrentUserId } from '@/lib/server/plan-guard';
import { evaluateRealDealBadge, recordOfferPriceHistory } from '@/lib/server/price-history';

export async function POST(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const access = await checkPlanFeatureAccess('real_deal_badge', userId);

    const body = await req.json().catch(() => ({}));
    const productUrl = typeof body.productUrl === 'string' ? body.productUrl.trim() : '';
    const productTitle = typeof body.productTitle === 'string' ? body.productTitle.trim() : 'Produto';
    const store = typeof body.store === 'string' ? body.store.trim() : 'mercadolivre';
    const currentPrice = Number(body.currentPrice);
    const claimedOriginalPrice =
      body.originalPrice !== undefined && body.originalPrice !== '' && Number(body.originalPrice) > 0
        ? Number(body.originalPrice)
        : undefined;

    if (!productUrl || isNaN(currentPrice) || currentPrice <= 0) {
      return NextResponse.json(
        { ok: false, error: 'Informe a URL do produto e um preço atual válido para auditar o histórico.' },
        { status: 400 }
      );
    }

    // Se solicitado registrar nova coleta no histórico antes de auditar
    if (body.recordSample === true) {
      await recordOfferPriceHistory({
        userId,
        productTitle,
        productUrl,
        store,
        price: currentPrice,
        originalPrice: claimedOriginalPrice,
      });
    }

    // Se o plano for Impulse, bloqueia a exibição do selo de promoção real no servidor
    if (!access.allowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'FEATURE_LOCKED',
          error: access.error,
          requiredPlan: access.requiredPlan,
        },
        { status: 403 }
      );
    }

    const audit = await evaluateRealDealBadge({
      productUrl,
      currentPrice,
      claimedOriginalPrice,
    });

    return NextResponse.json({
      ok: true,
      audit,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
