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
  const headerY = story ? 150 : 64;
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

  // ---- Palco da foto
  const stageTop = headerY + logoSize + (story ? 90 : 48);
  const stageW = W - pad * 2;
  const stageH = story ? 860 : 560;
  const stageX = pad;
  svg.push(`<ellipse cx="${W / 2}" cy="${stageTop + stageH / 2}" rx="${stageW * 0.62}" ry="${stageH * 0.62}" fill="url(#glow)"/>`);
  svg.push(`<rect x="${stageX + 30}" y="${stageTop + 40}" width="${stageW - 60}" height="${stageH - 20}" rx="56" fill="${t.stage.shadow}" filter="url(#soft)"/>`);
  svg.push(`<rect x="${stageX}" y="${stageTop}" width="${stageW}" height="${stageH}" rx="56" fill="url(#stage)"/>`);

  // área do produto deixa espaço para o selo de desconto no canto superior esquerdo
  const chipReserve = story ? 120 : 100;
  const productBoxW = stageW - 200;
  const productBoxH = stageH - chipReserve - (story ? 90 : 60);
  const product = await prepareProduct(input.product.image, productBoxW, productBoxH);
  const productLeft = Math.round(W / 2 - product.width / 2);
  const productTop = Math.round(stageTop + chipReserve + (stageH - chipReserve - product.height) / 2 - (story ? 10 : 6));
  // sombra de contato sob o produto
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
  let y = stageTop + stageH + (story ? 96 : 76);
  const titleSize = story ? 50 : 42;
  const titleLines = wrapText(input.product.title || 'Oferta', { size: titleSize, weight: 700, maxWidth: W - pad * 2, maxLines: story ? 3 : 2 });
  for (const line of titleLines) {
    svg.push(textPath(line, { x: pad, y, size: titleSize, weight: 700, fill: t.text }).svg);
    y += titleSize * 1.22;
  }

  // ---- Preços
  y += story ? 34 : 20;
  if (input.pricing.original && input.pricing.original > input.pricing.current) {
    const oldText = `R$ ${money(input.pricing.original)}`;
    const oldSize = story ? 36 : 30;
    const oldW = measureText(oldText, oldSize, 500);
    svg.push(textPath(oldText, { x: pad, y, size: oldSize, weight: 500, fill: t.textMuted }).svg);
    svg.push(`<rect x="${pad - 4}" y="${y - oldSize * 0.36}" width="${oldW + 8}" height="${story ? 4 : 3}" rx="2" fill="${t.textMuted}"/>`);
    y += story ? 26 : 20;
  }
  const priceSize = story ? 132 : 104;
  const currencySize = story ? 48 : 40;
  y += priceSize * 0.82;
  const currency = textPath('R$', { x: pad, y: y - priceSize * 0.42, size: currencySize, weight: 800, fill: t.accentText });
  svg.push(currency.svg);
  const value = textPath(money(input.pricing.current), { x: pad + currency.width + 14, y, size: priceSize, weight: 800, fill: t.text, letterSpacing: -2 });
  svg.push(value.svg);

  // cupom (à direita do preço quando couber; senão abaixo)
  if (input.coupon) {
    const couponText = `CUPOM ${input.coupon.toUpperCase().trim()}`;
    const couponSize = story ? 32 : 28;
    const cw = measureText(couponText, couponSize, 700, 1) + 48;
    const ch = couponSize + 36;
    const fitsRight = pad + currency.width + 14 + value.width + 40 + cw <= W - pad;
    const cx = fitsRight ? W - pad - cw : pad;
    const cy = fitsRight ? y - priceSize * 0.38 - ch / 2 : y + (story ? 40 : 28);
    svg.push(`<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="14" fill="none" stroke="${t.accentText}" stroke-width="3" stroke-dasharray="10 8"/>`);
    svg.push(textPath(couponText, { x: cx + cw / 2, y: cy + ch / 2 + couponSize * 0.36, size: couponSize, weight: 700, fill: t.accentText, anchor: 'middle', letterSpacing: 1 }).svg);
  }

  // ---- Rodapé: Oferta #N · link na bio
  // story: rodapé logo abaixo do conteúdo, acima da barra de resposta do Instagram
  const footerY = story ? Math.min(Math.max(y + 215, 1640), H - 230) : H - 74;
  svg.push(`<rect x="${pad}" y="${footerY - (story ? 64 : 54)}" width="${W - pad * 2}" height="2" fill="${t.divider}"/>`);
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
