import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { renderStoryImage } from '@/lib/server/story-renderer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      jobId,
      title,
      priceOriginal,
      priceCurrent,
      discountPct,
      coupon,
      imageUrl,
      affiliateUrl,
      linkCallToAction,
      format = 'story_9_16',
    } = body;

    if (!title || !priceCurrent || !imageUrl) {
      return NextResponse.json(
        { ok: false, error: 'Título, Preço Por e Imagem são obrigatórios para gerar a arte publicitária.' },
        { status: 400 }
      );
    }

    const result = await renderStoryImage({
      userId: session.userId,
      jobId,
      title,
      priceOriginal,
      priceCurrent,
      discountPct,
      coupon,
      imageUrl,
      affiliateUrl,
      linkCallToAction,
      format,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || 'Falha ao renderizar a imagem do Story.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      publicUrl: result.publicUrl,
      width: result.width,
      height: result.height,
      processingMs: result.processingMs,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro interno ao renderizar o Story.' },
      { status: 500 }
    );
  }
}

