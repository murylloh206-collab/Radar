import sharp from 'sharp';
import type { ArtTheme } from './theme';
import { measureText, textPath, wrapText } from './text';

/**
 * Arte de oferta “Radar escuro premium” (direção B) com a identidade do cliente.
 * story = 1080×1920 (também usada no status do WhatsApp) · feed = 1080×1350 (4:5)
 */

export interface OfferArtInput {
  format: 'story' | 'feed';
  theme: ArtTheme;
  brand: { name: string; handle?: string; logo?: Buffer | null };
  product: { title: string; image: Buffer };
  pricing: { current: number; original?: number | null; discountPct?: number | null };
  coupon?: string;
  offerNumber?: number;
  footerCta?: string;
}

const W = 1080;

function money(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function discountOf(pricing: OfferArtInput['pricing']): number | null {
  if (pricing.discountPct && pricing.discountPct > 0) return Math.round(pricing.discountPct);
  if (pricing.original && pricing.original > pricing.current) return Math.round((1 - pricing.current / pricing.original) * 100);
  return null;
}

/** Recorta bordas brancas/transparentes da foto para o produto ocupar bem o palco. */
async function prepareProduct(image: Buffer, boxW: number, boxH: number): Promise<{ buffer: Buffer; width: number; height: number }> {
  let pipeline = sharp(image).rotate();
  try {
    const trimmed = await sharp(image).rotate().trim({ threshold: 18 }).toBuffer();
    const meta = await sharp(trimmed).metadata();
    if ((meta.width || 0) > 40 && (meta.height || 0) > 40) pipeline = sharp(trimmed);
  } catch { /* foto sem borda recortável */ }
  const buffer = await pipeline.resize(boxW, boxH, { fit: 'inside', withoutEnlargement: false }).png().toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width || boxW, height: meta.height || boxH };
}

async function circularLogo(logo: Buffer, size: number): Promise<Buffer> {
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
  return sharp(logo).resize(size, size, { fit: 'cover' }).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

function initialOf(name: string): string {
  const letter = Array.from((name || '').trim()).find(ch => /[\p{L}\p{N}]/u.test(ch));
  return (letter || 'R').toUpperCase();
}

export interface ArtLayout {
  stageTop: number; stageH: number;
  titleLines: string[]; titleSize: number; titleY: number;
  oldPriceY: number | null; priceY: number; priceSize: number; currencySize: number; currencyW: number; priceBottom: number;
  coupon: { text: string; size: number; x: number; y: number; w: number; h: number; right: number; bottom: number } | null;
  dividerY: number; footerY: number;
  /** "De R$ X" (null se não houver preço antigo) e o rótulo "Por" antes do preço atual. */
  oldPriceText: string | null; porLabel: string; porW: number;
}

/** Calcula as posições da arte: a foto encolhe o necessário para que nada se sobreponha. */
export function computeArtLayout(p: { format: 'story' | 'feed'; title: string; current: number; original?: number | null; coupon?: string }): ArtLayout {
  const story = p.format === 'story';
  const H = story ? 1920 : 1350;
  const pad = 72;
  const headerY = story ? 120 : 64;
  const logoSize = story ? 104 : 88;
  const stageTop = headerY + logoSize + (story ? 52 : 48);
  const titleSize = story ? 50 : 42;
  const titleLines = wrapText(p.title || 'Oferta', { size: titleSize, weight: 700, maxWidth: W - pad * 2, maxLines: story ? 3 : 2 });
  const priceSize = story ? 132 : 104;
  const currencySize = story ? 48 : 40;
  const currencyW = measureText('R$', currencySize, 800);
  const porLabel = 'Por';
  const porW = measureText(porLabel, currencySize, 700) + 14;
  const valueW = measureText(money(p.current), priceSize, 800, -2);
  const hasOld = Boolean(p.original && p.original > p.current);

  // alturas relativas ao fim do palco
  const titleRel = story ? 96 : 76;
  let y = titleRel + titleLines.length * titleSize * 1.22 + (story ? 34 : 20);
  const oldPriceRel = hasOld ? y : null;
  if (hasOld) y += story ? 26 : 20;
  const priceRel = y + priceSize * 0.82;
  let contentBottomRel = priceRel + priceSize * 0.24;

  let couponRel: { text: string; size: number; x: number; yRel: number; w: number; h: number } | null = null;
  if (p.coupon && p.coupon.trim()) {
    const size = story ? 32 : 28;
    const [text] = wrapText(`CUPOM ${p.coupon.toUpperCase().trim()}`, { size, weight: 700, maxWidth: W - pad * 2 - 60, maxLines: 1 });
    const w = measureText(text, size, 700, 1) + 48;
    const h = size + 36;
    const fitsRight = pad + porW + currencyW + 14 + valueW + 40 + w <= W - pad;
    const x = fitsRight ? W - pad - w : pad;
    const yRel = fitsRight ? priceRel - priceSize * 0.38 - h / 2 : priceRel + priceSize * 0.24 + (story ? 28 : 20);
    couponRel = { text, size, x, yRel, w, h };
    contentBottomRel = Math.max(contentBottomRel, yRel + h);
  }

  const dividerGap = story ? 36 : 30;
  const footerGap = story ? 54 : 54;
  const maxFooter = story ? H - 200 : H - 74;
  const maxStage = story ? 980 : 600;
  const minStage = story ? 520 : 360;
  const available = maxFooter - footerGap - dividerGap - contentBottomRel - stageTop;
  const stageH = Math.max(minStage, Math.min(maxStage, Math.floor(available)));
  const base = stageTop + stageH;
  const naturalDivider = base + contentBottomRel + dividerGap;
  // Rodapé logo depois do conteúdo (sem vão grande); no feed fica na base.
  const footerY = story ? Math.min(maxFooter, naturalDivider + footerGap) : maxFooter;
  const coupon = couponRel ? { text: couponRel.text, size: couponRel.size, x: couponRel.x, y: base + couponRel.yRel, w: couponRel.w, h: couponRel.h,
    right: couponRel.x + couponRel.w, bottom: base + couponRel.yRel + couponRel.h } : null;
  return {
    stageTop, stageH, titleLines, titleSize, titleY: base + titleRel,
    oldPriceY: oldPriceRel === null ? null : base + oldPriceRel,
    priceY: base + priceRel, priceSize, currencySize, currencyW, priceBottom: base + priceRel + priceSize * 0.24,
    coupon, dividerY: footerY - footerGap, footerY,
    oldPriceText: hasOld ? `De R$ ${money(p.original as number)}` : null, porLabel, porW,
  };
}

export async function renderOfferArt(input: OfferArtInput): Promise<Buffer> {
  const story = input.format === 'story';
  const H = story ? 1920 : 1350;
  const t = input.theme;
  const pad = 72;
  const svg: string[] = [];
  const composites: sharp.OverlayOptions[] = [];

  // ---- Fundo
  svg.push(`<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.background.top}"/><stop offset="0.45" stop-color="${t.background.mid}"/><stop offset="1" stop-color="${t.background.bottom}"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${t.accent}" stop-opacity="${t.mode === 'dark' ? 0.22 : 0.16}"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></radialGradient>
    <linearGradient id="stage" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="28"/></filter>
    <filter id="contact" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>`);
  svg.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);

  // ---- Cabeçalho: logo + nome da loja + @
  const headerY = story ? 120 : 64;
  const logoSize = story ? 104 : 88;
  if (input.brand.logo) {
    try {
      composites.push({ input: await circularLogo(input.brand.logo, logoSize), left: pad, top: headerY });
    } catch { input.brand.logo = null; }
  }
  svg.push(`<circle cx="${pad + logoSize / 2}" cy="${headerY + logoSize / 2}" r="${logoSize / 2 + 3}" fill="none" stroke="${t.accent}" stroke-width="4"/>`);
  if (!input.brand.logo) {
    svg.push(`<circle cx="${pad + logoSize / 2}" cy="${headerY + logoSize / 2}" r="${logoSize / 2}" fill="${t.mode === 'dark' ? '#FFFFFF' : t.accent}"/>`);
    svg.push(textPath(initialOf(input.brand.name), { x: pad + logoSize / 2, y: headerY + logoSize / 2 + logoSize * 0.17, size: logoSize * 0.48, weight: 800, fill: t.mode === 'dark' ? t.background.mid : t.onAccent, anchor: 'middle' }).svg);
  }
  const nameX = pad + logoSize + 24;
  const nameMax = W - nameX - pad;
  const [storeName] = wrapText(input.brand.name.toUpperCase(), { size: story ? 38 : 32, weight: 800, maxWidth: nameMax, maxLines: 1 });
  const hasHandle = Boolean(input.brand.handle);
  svg.push(textPath(storeName || '', { x: nameX, y: headerY + logoSize / 2 + (hasHandle ? -2 : 13), size: story ? 38 : 32, weight: 800, fill: t.text, letterSpacing: 1.5 }).svg);
  if (hasHandle) {
    const [handle] = wrapText(input.brand.handle!, { size: story ? 28 : 24, weight: 500, maxWidth: nameMax, maxLines: 1 });
    svg.push(textPath(handle || '', { x: nameX, y: headerY + logoSize / 2 + (story ? 38 : 33), size: story ? 28 : 24, weight: 500, fill: t.textMuted }).svg);
  }

  // ---- Posições calculadas antes de desenhar (a foto encolhe para caber título, preços, cupom e rodapé)
  const L = computeArtLayout({ format: input.format, title: input.product.title, current: input.pricing.current, original: input.pricing.original, coupon: input.coupon });
  const { stageTop, stageH } = L;

  // ---- Palco da foto
  const stageW = W - pad * 2;
  const stageX = pad;
  svg.push(`<ellipse cx="${W / 2}" cy="${stageTop + stageH / 2}" rx="${stageW * 0.62}" ry="${stageH * 0.62}" fill="url(#glow)"/>`);
  svg.push(`<rect x="${stageX + 30}" y="${stageTop + 40}" width="${stageW - 60}" height="${stageH - 20}" rx="56" fill="${t.stage.shadow}" filter="url(#soft)"/>`);
  svg.push(`<rect x="${stageX}" y="${stageTop}" width="${stageW}" height="${stageH}" rx="56" fill="url(#stage)"/>`);

  // área do produto deixa espaço para o selo de desconto no canto superior esquerdo
  const chipReserve = story ? 120 : 100;
  const productBoxW = stageW - 96;
  const productBoxH = Math.max(stageH - chipReserve - (story ? 40 : 30), 160);
  const product = await prepareProduct(input.product.image, productBoxW, productBoxH);
  const productLeft = Math.round(W / 2 - product.width / 2);
  const productTop = Math.round(stageTop + chipReserve + (stageH - chipReserve - product.height) / 2 - (story ? 10 : 6));
  svg.push(`<ellipse cx="${W / 2}" cy="${productTop + product.height - 6}" rx="${Math.max(product.width * 0.38, 60)}" ry="${story ? 22 : 16}" fill="#000" fill-opacity="0.16" filter="url(#contact)"/>`);
  composites.push({ input: product.buffer, left: productLeft, top: productTop });

  // selo de desconto
  const discount = discountOf(input.pricing);
  if (discount) {
    const label = `−${discount}%`;
    const size = story ? 50 : 42;
    const chipW = measureText(label, size, 800) + 56;
    const chipH = size + 34;
    const chipX = stageX + 36;
    const chipY = stageTop + 36;
    svg.push(`<rect x="${chipX}" y="${chipY}" width="${chipW}" height="${chipH}" rx="${chipH / 2}" fill="${t.accent}"/>`);
    svg.push(textPath(label, { x: chipX + chipW / 2, y: chipY + chipH / 2 + size * 0.36, size, weight: 800, fill: t.onAccent, anchor: 'middle' }).svg);
  }

  // ---- Título
  L.titleLines.forEach((line, i) => {
    svg.push(textPath(line, { x: pad, y: L.titleY + i * L.titleSize * 1.22, size: L.titleSize, weight: 700, fill: t.text }).svg);
  });

  // ---- Preços
  if (L.oldPriceY !== null && L.oldPriceText) {
    const oldSize = story ? 36 : 30;
    const deW = measureText('De ', oldSize, 500);
    const oldW = measureText(L.oldPriceText, oldSize, 500);
    svg.push(textPath(L.oldPriceText, { x: pad, y: L.oldPriceY, size: oldSize, weight: 500, fill: t.textMuted }).svg);
    svg.push(`<rect x="${pad + deW - 4}" y="${L.oldPriceY - oldSize * 0.36}" width="${oldW - deW + 8}" height="${story ? 4 : 3}" rx="2" fill="${t.textMuted}"/>`);
  }
  // "Por" + R$ + valor
  svg.push(textPath(L.porLabel, { x: pad, y: L.priceY, size: L.currencySize, weight: 700, fill: t.textMuted }).svg);
  svg.push(textPath('R$', { x: pad + L.porW, y: L.priceY - L.priceSize * 0.42, size: L.currencySize, weight: 800, fill: t.accentText }).svg);
  svg.push(textPath(money(input.pricing.current), { x: pad + L.porW + L.currencyW + 14, y: L.priceY, size: L.priceSize, weight: 800, fill: t.text, letterSpacing: -2 }).svg);

  // cupom (à direita do preço quando couber; senão abaixo; encurtado se for longo)
  if (L.coupon) {
    const c = L.coupon;
    svg.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="14" fill="none" stroke="${t.accentText}" stroke-width="3" stroke-dasharray="10 8"/>`);
    svg.push(textPath(c.text, { x: c.x + c.w / 2, y: c.y + c.h / 2 + c.size * 0.36, size: c.size, weight: 700, fill: t.accentText, anchor: 'middle', letterSpacing: 1 }).svg);
  }

  // ---- Rodapé: Oferta #N · link na bio
  const footerY = L.footerY;
  svg.push(`<rect x="${pad}" y="${L.dividerY}" width="${W - pad * 2}" height="2" fill="${t.divider}"/>`);
  const footSize = story ? 34 : 30;
  if (input.offerNumber) {
    const label = textPath('Oferta ', { x: pad, y: footerY, size: footSize, weight: 500, fill: t.textMuted });
    svg.push(label.svg);
    svg.push(textPath(`#${input.offerNumber}`, { x: pad + label.width + 4, y: footerY, size: footSize, weight: 800, fill: t.text }).svg);
  }
  const cta = input.footerCta || 'link na bio';
  const ctaText = textPath(cta, { x: W - pad - footSize * 1.15, y: footerY, size: footSize, weight: 700, fill: t.accentText, anchor: 'end' });
  svg.push(ctaText.svg);
  // seta ↗ desenhada (a fonte embutida não tem o símbolo)
  const ax = W - pad - footSize * 0.62;
  const ay = footerY - footSize * 0.36;
  const s = footSize * 0.34;
  svg.push(`<path d="M${ax - s} ${ay + s} L${ax + s} ${ay - s} M${ax - s * 0.3} ${ay - s} L${ax + s} ${ay - s} L${ax + s} ${ay + s * 0.3}" stroke="${t.accentText}" stroke-width="${footSize * 0.11}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);

  const background = Buffer.from(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${svg.join('')}</svg>`);
  return sharp(background).composite(composites).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer();
}
