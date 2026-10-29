import { NextRequest, NextResponse } from 'next/server';
import { processRadarArt } from '@/lib/server/radar-art-engine';
import { StoreName } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      productTitle,
      storeName,
      imageUrl,
      currentPrice,
      originalPrice,
      discountPct,
      isPriceVerified,
      isDiscountVerified,
    } = body;

    const result = await processRadarArt({
      productTitle: productTitle || 'Produto Radar de Ofertas',
      storeName: (storeName as StoreName) || 'mercadolivre',
      imageUrl,
      currentPrice: typeof currentPrice === 'number' ? currentPrice : undefined,
      originalPrice: typeof originalPrice === 'number' ? originalPrice : undefined,
      discountPct: typeof discountPct === 'number' ? discountPct : undefined,
      isPriceVerified: Boolean(isPriceVerified),
      isDiscountVerified: Boolean(isDiscountVerified),
      fallbackRule: 'revisao_manual',
    });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
