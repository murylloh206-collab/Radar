import 'server-only';
import sharp from 'sharp';
import { textPath, wrapText } from './text';
import type { ArtTheme } from './theme';
import { paymentWarning } from './promo-texts';

/*
 * Arte "promo" (referência aprovada pelo dono em 18/11): @ no topo, foto num cartão arredondado,
 * título centralizado, "De" riscado, preço grande na cor da marca, forma de pagamento, cupom
 * (só no WhatsApp), aviso de validade e rodapé com o número da oferta.
 * Fundo = template do cliente (se houver) ou o degradê da identidade, com texto de campanha em diagonal.
 * Texto sempre em vetor (fonte Inter embutida), como o resto das artes.
 */

const W = 1080;

export interface PromoArtInput {
  format: 'story' | 'feed';
  theme: ArtTheme;
  /** Imagem de fundo do template do cliente (opcional). */
  background?: Buffer | null;
  handle?: string;
  campaignText?: string | null;
  product: { title: string; image: Buffer };
  pricing: { current: number; original?: number | null };
  paymentNote?: string | null;
  coupon?: string | null;
  offerNumber?: number | null;
  /** Chamada no rodapé ("link na bio" no Instagram); vazio = só o número da oferta. */
  footerCta?: string;
}

const money = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Texto de campanha repetido em diagonal, bem apagado (só decoração). */
function campaignPattern(text: string, H: number): string {
  const word = text.trim().toUpperCase();
  const label = `${word} · `;
  const size = 58;
  const row = textPath(label, { x: 0, y: 0, size, weight: 800, fill: '#FFFFFF' });
  const repeat = Math.max(2, Math.ceil(2600 / Math.max(row.width, 200)));
  const out: string[] = [`<g transform="rotate(-16 ${W / 2} ${H / 2})" opacity="0.07">`];
  for (let y = -500, i = 0; y < H + 700; y += 150, i++) {
    let x = -900 + (i % 2) * (row.width / 2);
    for (let k = 0; k < repeat; k++, x += row.width) out.push(textPath(label, { x, y, size, weight: 800, fill: '#FFFFFF' }).svg);
  }
  out.push('</g>');
  return out.join('');
}

/** Triângulo de alerta desenhado (a fonte embutida não tem o emoji ⚠). */
function warningIcon(x: number, y: number, s: number): string {
  return `<path d="M${x} ${y - s} L${x + s * 0.95} ${y + s * 0.7} L${x - s * 0.95} ${y + s * 0.7} Z" fill="#F5C542"/>`
    + `<rect x="${x - s * 0.09}" y="${y - s * 0.45}" width="${s * 0.18}" height="${s * 0.62}" rx="${s * 0.09}" fill="#1A1A1A"/>`
    + `<circle cx="${x}" cy="${y + s * 0.43}" r="${s * 0.11}" fill="#1A1A1A"/>`;
}

export async function renderPromoArt(input: PromoArtInput): Promise<Buffer> {
  const story = input.format === 'story';
  const H = story ? 1920 : 1350;
  const t = input.theme;
  const k = story ? 1 : 0.8; // escala dos textos no feed
  const pad = 90;

  // ---------------------------------------------------------------- medidas de cima para baixo
  const handleSize = Math.round(46 * k);
  const titleSize = Math.round(52 * k);
  const deSize = Math.round(40 * k);
  const priceSize = Math.round(150 * k);
  const paySize = Math.round(46 * k);
  const warnSize = Math.round(32 * k);

  const titleLines = wrapText(input.product.title, { size: titleSize, weight: 800, maxWidth: W - pad * 2, maxLines: 2 });
  const showDe = Boolean(input.pricing.original && input.pricing.original > input.pricing.current);
  const coupon = input.coupon?.trim() ? input.coupon.trim().toUpperCase().slice(0, 24) : null;
  const top = story ? 190 : 70;
  const handleH = input.handle ? handleSize + 40 : 0;
  const below =
    40 + titleLines.length * titleSize * 1.18 +
    (showDe ? deSize + 22 : 0) +
    priceSize * 1.02 +
    (input.paymentNote ? paySize + 14 : 0) +
    (coupon ? Math.round(150 * k) + 30 : 0) +
    warnSize + 40 +
    (input.offerNumber || input.footerCta ? Math.round(84 * k) + 30 : 0);
  const bottomMargin = story ? 110 : 50;
  const cardW = W - 2 * Math.round(60 * (story ? 1 : 1.6));
  const cardH = Math.round(Math.max(story ? 520 : 380, Math.min(story ? 960 : 560, H - top - handleH - below - bottomMargin)));
  const cardX = (W - cardW) / 2;
  const cardY = top + handleH;

  // ---------------------------------------------------------------- fundo
  let base: sharp.Sharp;
  if (input.background) {
    base = sharp(await sharp(input.background).rotate().resize(W, H, { fit: 'cover' }).toBuffer());
  } else {
    const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0" stop-color="${t.background.top}"/><stop offset="0.5" stop-color="${t.background.mid}"/><stop offset="1" stop-color="${t.background.bottom}"/>`
      + `</linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`;
    base = sharp(Buffer.from(bg));
  }

  const svg: string[] = [];
  // Véu escuro: garante leitura do texto branco sobre qualquer fundo do cliente.
  if (input.background) svg.push(`<rect width="${W}" height="${H}" fill="#000" fill-opacity="0.45"/>`);
  if (input.campaignText?.trim()) svg.push(campaignPattern(input.campaignText, H));

  let y = top;
  if (input.handle) {
    svg.push(textPath(input.handle, { x: W / 2, y: y + handleSize, size: handleSize, weight: 800, fill: '#FFFFFF', anchor: 'middle' }).svg);
    y += handleH;
  }
  // sombra e moldura do cartão da foto
  svg.push(`<rect x="${cardX}" y="${cardY + 14}" width="${cardW}" height="${cardH}" rx="44" fill="#000" fill-opacity="0.35"/>`);
  svg.push(`<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="44" fill="#FFFFFF"/>`);
  y = cardY + cardH + 40;

  for (const line of titleLines) {
    y += titleSize * 1.05;
    svg.push(textPath(line, { x: W / 2, y, size: titleSize, weight: 800, fill: '#FFFFFF', anchor: 'middle' }).svg);
    y += titleSize * 0.13;
  }
  if (showDe) {
    y += deSize + 22;
    const de = textPath(`De R$ ${money(input.pricing.original!)}`, { x: W / 2, y, size: deSize, weight: 700, fill: t.textMuted, anchor: 'middle' });
    svg.push(de.svg);
    svg.push(`<rect x="${W / 2 - de.width / 2 - 4}" y="${y - deSize * 0.36}" width="${de.width + 8}" height="${Math.max(3, deSize * 0.08)}" fill="#FF4D4F"/>`);
  }
  y += priceSize * 0.98;
  svg.push(textPath(`R$ ${money(input.pricing.current)}`, { x: W / 2, y, size: priceSize, weight: 800, fill: t.accentText, anchor: 'middle', letterSpacing: -2 }).svg);
  y += priceSize * 0.04;
  if (input.paymentNote) {
    y += paySize + 14;
    svg.push(textPath(input.paymentNote, { x: W / 2, y, size: paySize, weight: 700, fill: '#FFFFFF', anchor: 'middle' }).svg);
  }
  if (coupon) {
    const boxH = Math.round(150 * k);
    const boxY = y + 30;
    svg.push(`<rect x="${pad - 20}" y="${boxY}" width="${W - (pad - 20) * 2}" height="${boxH}" rx="28" fill="#000" fill-opacity="0.35" stroke="${t.accentText}" stroke-width="5"/>`);
    svg.push(textPath('USE O CUPOM', { x: W / 2, y: boxY + boxH * 0.38, size: Math.round(32 * k), weight: 700, fill: t.textMuted, anchor: 'middle', letterSpacing: 2 }).svg);
    svg.push(textPath(coupon, { x: W / 2, y: boxY + boxH * 0.82, size: Math.round(64 * k), weight: 800, fill: t.accentText, anchor: 'middle' }).svg);
    y = boxY + boxH;
  }
  // aviso de validade
  y += warnSize + 40;
  const warning = paymentWarning(Boolean(coupon));
  const warnText = textPath(warning, { x: 0, y: 0, size: warnSize, weight: 500, fill: '#FFFFFF' });
  const iconS = warnSize * 0.62;
  const startX = (W - (warnText.width + iconS * 2 + 16)) / 2;
  svg.push(warningIcon(startX + iconS, y - warnSize * 0.35, iconS));
  svg.push(textPath(warning, { x: startX + iconS * 2 + 16, y, size: warnSize, weight: 500, fill: '#FFFFFF', opacity: 0.9 }).svg);

  // rodapé: Oferta #N · link na bio (Instagram) ou só Oferta #N (WhatsApp)
  const cta = input.footerCta === undefined ? 'link na bio' : input.footerCta;
  const footer = input.offerNumber ? `Oferta #${input.offerNumber}${cta ? ` · ${cta}` : ''}` : cta;
  if (footer) {
    const fs = Math.round(36 * k);
    const ft = textPath(footer, { x: 0, y: 0, size: fs, weight: 700, fill: '#FFFFFF' });
    const pillW = ft.width + 64;
    const pillH = Math.round(84 * k);
    const pillY = Math.min(y + 30, H - pillH - (story ? 70 : 24));
    svg.push(`<rect x="${(W - pillW) / 2}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="#000" fill-opacity="0.55"/>`);
    svg.push(textPath(footer, { x: W / 2, y: pillY + pillH * 0.66, size: fs, weight: 700, fill: '#FFFFFF', anchor: 'middle' }).svg);
  }

  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join('')}</svg>`);

  // foto do produto inteira (sem cortes) dentro do cartão branco
  const inner = 28;
  const photo = await sharp(input.product.image).rotate()
    .resize(cardW - inner * 2, cardH - inner * 2, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: '#FFFFFF' }).jpeg({ quality: 92 }).toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cardW - inner * 2}" height="${cardH - inner * 2}"><rect width="100%" height="100%" rx="26" fill="#fff"/></svg>`);
  const roundedPhoto = await sharp(photo).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

  return base
    .composite([
      { input: overlay, left: 0, top: 0 },
      { input: roundedPhoto, left: Math.round(cardX + inner), top: Math.round(cardY + inner) },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

