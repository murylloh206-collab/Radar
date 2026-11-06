import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { checkPlanFeatureAccess, resolveCurrentUserId } from '@/lib/server/plan-guard';
import { resolveEffectiveWatermarkConfig, getBrandSettings } from '@/lib/server/brand-settings';
import { getOfficialWatermarkBadge, convertHandleToVectorPath } from '@/lib/server/watermark-vector';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderSvgTextOrPath(text: string, x: number, y: number, fontSize: number, fill: string, center = false): string {
  const { pathData, width } = convertHandleToVectorPath(text, 0, 0, fontSize);
  if (pathData) {
    const offsetX = center ? Math.round(x - width / 2) : x;
    return `<g transform="translate(${offsetX}, ${y})"><path d="${pathData}" fill="${fill}" stroke="${fill}" stroke-width="0.4" stroke-linejoin="round"/></g>`;
  }
  const anchor = center ? 'middle' : 'start';
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="sans-serif" font-size="${fontSize}" font-weight="700" fill="${fill}">${escapeXml(text)}</text>`;
}

async function fetchProductPhotoBuffer(imageUrl?: string): Promise<Buffer | null> {
  if (!imageUrl || !imageUrl.trim()) return null;
  try {
    if (imageUrl.startsWith('data:image/')) {
      const b64 = imageUrl.split(',')[1];
      if (b64) return Buffer.from(b64, 'base64');
    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const res = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(7000),
      });
      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }
    }
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const access = await checkPlanFeatureAccess('auto_image_cards', userId);
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

    const body = await req.json().catch(() => ({}));
    const format: 'feed' | 'story' = body.format === 'feed' ? 'feed' : 'story';
    const title = (typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Oferta Especial Verificada').slice(0, 85);
    const currentPriceStr = typeof body.currentPrice === 'string' || typeof body.currentPrice === 'number'
      ? String(body.currentPrice).replace(/^R\$\s*/i, '').trim()
      : '0,00';
    const originalPriceStr = typeof body.originalPrice === 'string' || typeof body.originalPrice === 'number'
      ? String(body.originalPrice).replace(/^R\$\s*/i, '').trim()
      : '';
    const coupon = typeof body.coupon === 'string' ? body.coupon.trim().toUpperCase() : '';
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
    const realDealBadge = typeof body.realDealBadge === 'string' ? body.realDealBadge.trim() : '';

    const [effectiveWm, brandSettings] = await Promise.all([
      resolveEffectiveWatermarkConfig(userId),
      getBrandSettings(userId),
    ]);

    const accentColor = brandSettings.accentColor || '#1CCAF2';
    const panelName = (brandSettings.panelName || 'RADAR DE OFERTAS').toUpperCase();

    const width = 1080;
    const height = format === 'story' ? 1920 : 1080;

    // 1. Preparar SVG de fundo e tipografia vetorial
    const isStory = format === 'story';
    const photoBoxTop = isStory ? 260 : 140;
    const photoBoxSize = isStory ? 780 : 520;
    const photoBoxLeft = Math.round((width - photoBoxSize) / 2);

    const titleLine1 = title.slice(0, 42);
    const titleLine2 = title.length > 42 ? title.slice(42, 82) + (title.length > 82 ? '...' : '') : '';

    const textStartY = photoBoxTop + photoBoxSize + (isStory ? 95 : 65);
    const priceY = textStartY + (titleLine2 ? 150 : 105);

    const headerSvg = renderSvgTextOrPath(panelName, 540, isStory ? 130 : 72, isStory ? 34 : 28, '#F8FBFF', true);
    const subHeaderSvg = renderSvgTextOrPath(
      realDealBadge ? `★ ${realDealBadge.toUpperCase()}` : 'OFERTA VERIFICADA',
      540,
      isStory ? 185 : 110,
      isStory ? 24 : 18,
      realDealBadge ? '#34D399' : accentColor,
      true
    );

    const titleSvg1 = renderSvgTextOrPath(titleLine1, 540, textStartY, isStory ? 38 : 32, '#FFFFFF', true);
    const titleSvg2 = titleLine2
      ? renderSvgTextOrPath(titleLine2, 540, textStartY + (isStory ? 50 : 42), isStory ? 38 : 32, '#E2E8F0', true)
      : '';

    const dePriceSvg = originalPriceStr
      ? renderSvgTextOrPath(`De R$ ${originalPriceStr}`, 540, priceY - (isStory ? 68 : 54), isStory ? 28 : 22, '#94A3B8', true)
      : '';

    const porPriceSvg = renderSvgTextOrPath(
      `Por R$ ${currentPriceStr}`,
      540,
      priceY,
      isStory ? 64 : 52,
      '#34D399',
      true
    );

    const couponSvg = coupon
      ? `<g>
          <rect x="330" y="${priceY + (isStory ? 36 : 24)}" width="420" height="${isStory ? 64 : 52}" rx="14" fill="#1E293B" stroke="${accentColor}" stroke-width="2"/>
          ${renderSvgTextOrPath(`CUPOM: ${coupon}`, 540, priceY + (isStory ? 78 : 58), isStory ? 28 : 24, '#F8FAFC', true)}
        </g>`
      : '';

    const baseSvg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#060913"/>
            <stop offset="55%" stop-color="#0D1636"/>
            <stop offset="100%" stop-color="#13204E"/>
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
        <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="28" fill="none" stroke="${accentColor}" stroke-width="2" stroke-opacity="0.45"/>
        ${headerSvg}
        ${subHeaderSvg}
        <rect x="${photoBoxLeft}" y="${photoBoxTop}" width="${photoBoxSize}" height="${photoBoxSize}" rx="24" fill="#FFFFFF"/>
        ${titleSvg1}
        ${titleSvg2}
        ${dePriceSvg}
        ${porPriceSvg}
        ${couponSvg}
      </svg>
    `);

    const layers: sharp.OverlayOptions[] = [];

    // 2. Inserir foto real do produto dentro do quadro branco central
    const photoBuf = await fetchProductPhotoBuffer(imageUrl);
    if (photoBuf) {
      const innerMax = photoBoxSize - 60;
      const resizedPhoto = await sharp(photoBuf)
        .resize(innerMax, innerMax, { fit: 'inside', withoutEnlargement: false })
        .png()
        .toBuffer();
      const meta = await sharp(resizedPhoto).metadata();
      const pw = meta.width || innerMax;
      const ph = meta.height || innerMax;
      layers.push({
        input: resizedPhoto,
        left: photoBoxLeft + Math.round((photoBoxSize - pw) / 2),
        top: photoBoxTop + Math.round((photoBoxSize - ph) / 2),
      });
    }

    // 3. Aplicar a marca d'água do usuário (ou padrão no Impulse)
    if (effectiveWm.enabled) {
      const wmBadge = await getOfficialWatermarkBadge({
        handle: effectiveWm.handle,
        customLogoUrl: effectiveWm.logoUrl,
        opacity: effectiveWm.opacity,
        scale: effectiveWm.scale,
        position: effectiveWm.position,
        customX: effectiveWm.customX,
        customY: effectiveWm.customY,
        targetImageWidth: width,
        targetImageHeight: height,
      });

      if (wmBadge?.buffer) {
        layers.push({
          input: wmBadge.buffer,
          left: wmBadge.left,
          top: wmBadge.top,
        });
      }
    }

    const finalPng = await sharp(baseSvg).composite(layers).png({ compressionLevel: 8 }).toBuffer();
    const dataUrl = `data:image/png;base64,${finalPng.toString('base64')}`;

    return NextResponse.json({
      ok: true,
      format,
      width,
      height,
      imageDataUrl: dataUrl,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
