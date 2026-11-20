import 'server-only';
import sharp from 'sharp';
import { measureText, textPath, wrapText } from './text';
import type { ArtTheme } from './theme';

/*
 * Arte "vitrine" do POST DO FEED (1080×1350, referências do dono em 21/11):
 * topo livre para o logo (vem do fundo do cliente) ou o @; à esquerda nome grande, detalhe, selo de desconto,
 * "De" riscado e preço com centavos pequenos; à direita a foto do produto solta (fundo branco removido);
 * rodapé "O LINK ESTÁ NA BIO" (Instagram) ou "LINK PARA COMPRAR NA LEGENDA" (WhatsApp) e "Oferta sujeita a alteração."
 */

const W = 1080;
const H = 1350;
const LEFT = 64;
const COL_W = 470; // coluna do texto
const PHOTO = { x: 548, y: 360, w: 492, h: 640 };

export interface VitrineArtInput {
  theme: ArtTheme;
  background?: Buffer | null;
  handle?: string;
  campaignText?: string | null;
  product: { title: string; image: Buffer };
  pricing: { current: number; original?: number | null };
  discountPct?: number | null;
  paymentNote?: string | null;
  coupon?: string | null;
  offerNumber?: number | null;
  /** "link na bio" (Instagram, padrão) ou vazio (WhatsApp: link na legenda). */
  footerCta?: string;
}

/** Divide o título em nome (até 2 linhas, grande) e detalhe (o resto, menor). */
export function splitTitle(title: string, size = 66, maxWidth = COL_W): { headline: string[]; detail: string } {
  const words = title.replace(/\s+/g, ' ').trim().toUpperCase().split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  let used = 0;
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    // palavra sozinha sempre entra (a letra diminui na hora de desenhar)
    if (!current || measureText(candidate, size, 800) <= maxWidth) { current = candidate; used++; continue; }
    if (lines.length === 1) break; // segunda linha cheia: o resto vira detalhe
    lines.push(current);
    current = word;
    used++;
  }
  if (current) lines.push(current);
  // No máximo 4 palavras no nome: o resto (memória, cor, modelo) vai para o detalhe, como nas referências.
  let headline = lines.slice(0, 2);
  const all = headline.join(' ').split(' ');
  if (all.length > 4) {
    headline = wrapText(all.slice(0, 4).join(' '), { size, weight: 800, maxWidth, maxLines: 2 });
    used = 4;
  }
  const detail = words.slice(used).join(' ').replace(/^[-–•,\s]+/, '');
  return { headline, detail };
}

export function priceParts(value: number): { main: string; cents: string } {
  const [int, dec] = value.toFixed(2).split('.');
  return { main: `R$ ${Number(int).toLocaleString('pt-BR')},`, cents: dec };
}

export function discountOf(current: number, original?: number | null, pct?: number | null): number | null {
  if (pct && pct > 0) return Math.round(pct);
  if (original && original > current) return Math.round((1 - current / original) * 100);
  return null;
}

/**
 * Tira o fundo branco liso da foto (preenchimento a partir das bordas).
 * Se a borda não for branca (foto com cena/cor), devolve null e a foto vai num cartão.
 */
export async function cutWhiteBackground(image: Buffer): Promise<Buffer | null> {
  const { data, info } = await sharp(image).rotate().resize(900, 900, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const isWhite = (i: number) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return data[i + 3] < 20 || (r > 232 && g > 232 && b > 232 && Math.max(r, g, b) - Math.min(r, g, b) < 18);
  };
  let border = 0, whiteBorder = 0;
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { border++; if (isWhite((y * w + x) * 4)) whiteBorder++; }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { border++; if (isWhite((y * w + x) * 4)) whiteBorder++; }
  if (whiteBorder / border < 0.7) return null;

  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number) => { if (!seen[p] && isWhite(p * 4)) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w, y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  let removed = 0;
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) { data[p * 4 + 3] = 0; removed++; continue; }
    // borda suave: pixel do produto encostado no fundo removido fica meio transparente se for quase branco
    const x = p % w;
    const nearBg = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (p >= w && seen[p - w]) || (p < w * (h - 1) && seen[p + w]);
    if (nearBg) {
      const i = p * 4;
      const light = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (light > 215) data[i + 3] = Math.round(data[i + 3] * 0.45);
    }
  }
  // Quase tudo era branco (produto branco no fundo branco): melhor o cartão.
  if (removed / (w * h) > 0.93) return null;
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 1 }).png().toBuffer().catch(() => null);
}

const money2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Ícone de corrente (link) desenhado em traço. */
function linkIcon(cx: number, cy: number, s: number, color: string): string {
  const r = s * 0.22;
  return `<g transform="rotate(-45 ${cx} ${cy})" fill="none" stroke="${color}" stroke-width="${s * 0.13}" stroke-linecap="round">`
    + `<rect x="${cx - s * 0.62}" y="${cy - r}" width="${s * 0.7}" height="${r * 2}" rx="${r}"/>`
    + `<rect x="${cx - s * 0.08}" y="${cy - r}" width="${s * 0.7}" height="${r * 2}" rx="${r}"/></g>`;
}

/** Faixas de luz diagonais nos cantos (só quando não há fundo do cliente). */
function lightStreaks(accent: string): string {
  const band = (x1: number, y1: number, x2: number, y2: number, wdt: number, op: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${accent}" stroke-width="${wdt}" stroke-opacity="${op}" stroke-linecap="round" filter="url(#glow)"/>`;
  return `<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>`
    + band(-60, 300, 300, -60, 34, 0.55) + band(-60, 380, 380, -60, 10, 0.8) + band(-60, 210, 210, -60, 6, 0.6)
    + band(760, 1410, 1140, 1030, 34, 0.55) + band(700, 1410, 1140, 970, 10, 0.8) + band(860, 1410, 1140, 1130, 6, 0.6);
}

export async function renderVitrineArt(input: VitrineArtInput): Promise<Buffer> {
  const t = input.theme;
  const accent = t.accentText;
  const svg: string[] = [];

  // ---------------------------------------------------------------- fundo
  let base: sharp.Sharp;
  if (input.background) {
    base = sharp(await sharp(input.background).rotate().resize(W, H, { fit: 'cover' }).toBuffer());
    // véu leve só na faixa do texto, para ler bem sem esconder o fundo do cliente
    svg.push(`<defs><linearGradient id="veil" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="0.55" stop-color="#000" stop-opacity="0.1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>`);
    // o véu some suavemente no topo, para não apagar o logo do fundo
    svg.push(`<defs><linearGradient id="vfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.2" stop-color="#fff" stop-opacity="0"/><stop offset="0.32" stop-color="#fff"/></linearGradient><mask id="vmask"><rect width="${W}" height="${H}" fill="url(#vfade)"/></mask></defs>`);
    svg.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="url(#veil)" mask="url(#vmask)"/>`);
  } else {
    const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>`
      + `<radialGradient id="g" cx="0.62" cy="0.5" r="0.75"><stop offset="0" stop-color="${t.background.mid}"/><stop offset="1" stop-color="${t.background.bottom}"/></radialGradient>`
      + `</defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`;
    base = sharp(Buffer.from(bg));
    svg.push(lightStreaks(accent));
  }
  if (input.campaignText?.trim()) {
    const label = `${input.campaignText.trim()}   `;
    const row = textPath(label, { x: 0, y: 0, size: 40, weight: 700, fill: '#FFFFFF' });
    svg.push(`<g transform="rotate(-30 ${W / 2} ${H / 2})" opacity="0.06">`);
    for (let y = -400, i = 0; y < H + 500; y += 170, i++) {
      for (let x = -700 + (i % 2) * row.width / 2; x < W + 700; x += row.width) svg.push(textPath(label, { x, y, size: 40, weight: 700, fill: '#FFFFFF' }).svg);
    }
    svg.push('</g>');
  }

  // ---------------------------------------------------------------- topo (sem fundo do cliente: o @ no lugar do logo)
  if (!input.background && input.handle) {
    const hs = 54;
    const ht = textPath(input.handle, { x: W / 2, y: 190, size: hs, weight: 800, fill: '#FFFFFF', anchor: 'middle' });
    svg.push(ht.svg);
    const lineY = 172;
    svg.push(`<rect x="${W / 2 - ht.width / 2 - 140}" y="${lineY}" width="110" height="4" rx="2" fill="${accent}"/>`);
    svg.push(`<rect x="${W / 2 + ht.width / 2 + 30}" y="${lineY}" width="110" height="4" rx="2" fill="${accent}"/>`);
  }

  // ---------------------------------------------------------------- coluna do texto
  const { headline, detail } = splitTitle(input.product.title);
  let hSize = 66;
  while (hSize > 40 && headline.some(l => measureText(l, hSize, 800, -1) > COL_W)) hSize -= 2;
  let y = 430;
  for (const line of headline) {
    svg.push(textPath(line, { x: LEFT, y, size: hSize, weight: 800, fill: '#FFFFFF', letterSpacing: -1 }).svg);
    y += hSize * 1.02;
  }
  if (detail) {
    const dl = wrapText(detail, { size: 34, weight: 500, maxWidth: COL_W, maxLines: 2 });
    y += 4;
    for (const line of dl) { svg.push(textPath(line, { x: LEFT, y, size: 34, weight: 500, fill: '#FFFFFF', opacity: 0.92, letterSpacing: 1 }).svg); y += 42; }
  }
  // divisória com brilho
  y += 18;
  svg.push(`<defs><linearGradient id="div" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${accent}" stop-opacity="0.2"/><stop offset="0.5" stop-color="${accent}"/><stop offset="1" stop-color="${accent}" stop-opacity="0.2"/></linearGradient></defs>`);
  svg.push(`<rect x="${LEFT}" y="${y}" width="${COL_W - 20}" height="4" rx="2" fill="url(#div)"/>`);
  y += 34;

  // selo de desconto (paralelogramo)
  const pct = discountOf(input.pricing.current, input.pricing.original, input.discountPct);
  if (pct) {
    const label = `-${pct}%`;
    const ls = 68;
    const lw = measureText(label, ls, 800);
    const bw = lw + 80, bh = 96, skew = 26;
    svg.push(`<path d="M${LEFT + skew} ${y} L${LEFT + bw + skew} ${y} L${LEFT + bw - skew} ${y + bh} L${LEFT - skew + 10} ${y + bh} Z" fill="${t.accent}" fill-opacity="0.22" stroke="${accent}" stroke-width="4"/>`);
    svg.push(textPath(label, { x: LEFT + 40, y: y + bh * 0.74, size: ls, weight: 800, fill: '#FFFFFF' }).svg);
    y += bh + 26;
  }

  // "De" riscado
  if (input.pricing.original && input.pricing.original > input.pricing.current) {
    y += 40;
    const de = textPath(`R$ ${money2(input.pricing.original)}`, { x: LEFT, y, size: 42, weight: 700, fill: '#FFFFFF', opacity: 0.6 });
    svg.push(de.svg);
    svg.push(`<rect x="${LEFT - 4}" y="${y - 15}" width="${de.width + 8}" height="4" fill="#FFFFFF" fill-opacity="0.7"/>`);
  } else {
    y += 44;
    svg.push(textPath('Por:', { x: LEFT, y, size: 46, weight: 800, fill: '#FFFFFF' }).svg);
  }

  // preço grande com centavos pequenos
  const { main, cents } = priceParts(input.pricing.current);
  let ps = 124;
  while (ps > 70 && measureText(main, ps, 800, -3) + measureText(cents, ps * 0.45, 800) + 8 > COL_W + 20) ps -= 4;
  y += ps * 0.98;
  const mainW = textPath(main, { x: LEFT, y, size: ps, weight: 800, fill: '#FFFFFF', letterSpacing: -3 });
  svg.push(mainW.svg);
  svg.push(textPath(cents, { x: LEFT + mainW.width - 4, y: y - ps * 0.42, size: Math.round(ps * 0.45), weight: 800, fill: '#FFFFFF' }).svg);
  y += 18;

  // forma de pagamento (pílula)
  if (input.paymentNote) {
    const note = input.paymentNote.toUpperCase().slice(0, 22);
    const ns = 40;
    const nw = measureText(note, ns, 800) + 56;
    svg.push(`<path d="M${LEFT + 14} ${y} L${LEFT + nw + 14} ${y} L${LEFT + nw - 8} ${y + 64} L${LEFT - 8} ${y + 64} Z" fill="${t.accent}"/>`);
    svg.push(textPath(note, { x: LEFT + 28, y: y + 47, size: ns, weight: 800, fill: t.onAccent }).svg);
    y += 64 + 16;
  }
  // cupom (só chega aqui no WhatsApp)
  if (input.coupon?.trim()) {
    const c = `Cupom: ${input.coupon.trim().toUpperCase().slice(0, 20)}`;
    const cw = measureText(c, 36, 800) + 48;
    y += 10;
    svg.push(`<rect x="${LEFT}" y="${y}" width="${cw}" height="62" rx="16" fill="none" stroke="${accent}" stroke-width="3" stroke-dasharray="10 7"/>`);
    svg.push(textPath(c, { x: LEFT + 24, y: y + 44, size: 36, weight: 800, fill: accent }).svg);
  }

  // ---------------------------------------------------------------- rodapé
  const insta = (input.footerCta === undefined ? 'link na bio' : input.footerCta) !== '';
  const fy = 1176;
  const fs = 54;
  const [first, highlight] = insta ? ['O LINK ESTÁ NA', 'BIO'] : ['LINK NA', 'LEGENDA'];
  const gap = 18;
  const w1 = measureText(first, fs, 800, -1) + gap;
  const w2 = measureText(highlight, fs, 800, -1);
  const iconW = 96;
  const total = iconW + w1 + w2;
  const sx = (W - total) / 2;
  svg.push(linkIcon(sx + 34, fy - 18, 70, accent));
  svg.push(textPath(first, { x: sx + iconW, y: fy, size: fs, weight: 800, fill: '#FFFFFF', letterSpacing: -1 }).svg);
  svg.push(textPath(highlight, { x: sx + iconW + w1, y: fy, size: fs, weight: 800, fill: accent, letterSpacing: -1 }).svg);
  svg.push(`<rect x="${Math.max(40, sx - 150)}" y="${fy - 20}" width="${Math.min(120, sx - 50)}" height="4" rx="2" fill="${accent}"/>`);
  svg.push(`<rect x="${sx + total + 30}" y="${fy - 20}" width="${Math.min(120, W - (sx + total + 30) - 40)}" height="4" rx="2" fill="${accent}"/>`);
  const small = `${input.offerNumber ? `Oferta #${input.offerNumber} · ` : ''}Oferta sujeita a alteração.`;
  svg.push(textPath(small, { x: W / 2, y: fy + 74, size: 30, weight: 500, fill: '#FFFFFF', anchor: 'middle', opacity: 0.85 }).svg);

  // ---------------------------------------------------------------- foto do produto (direita)
  const cut = await cutWhiteBackground(input.product.image).catch(() => null);
  const layers: sharp.OverlayOptions[] = [];
  if (cut) {
    const photo = await sharp(cut).resize(PHOTO.w, PHOTO.h, { fit: 'inside' }).png().toBuffer();
    const m = await sharp(photo).metadata();
    const px = Math.round(PHOTO.x + (PHOTO.w - (m.width || PHOTO.w)) / 2);
    const py = Math.round(PHOTO.y + (PHOTO.h - (m.height || PHOTO.h)) / 2);
    // brilho atrás e sombra no chão
    const back = `<defs><radialGradient id="halo"><stop offset="0" stop-color="${accent}" stop-opacity="0.35"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="floor"><stop offset="0" stop-color="#000" stop-opacity="0.6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`
      + `<ellipse cx="${PHOTO.x + PHOTO.w / 2}" cy="${PHOTO.y + PHOTO.h / 2}" rx="${PHOTO.w * 0.62}" ry="${PHOTO.h * 0.5}" fill="url(#halo)"/>`
      + `<ellipse cx="${px + (m.width || 0) / 2}" cy="${py + (m.height || 0) - 6}" rx="${(m.width || 300) * 0.48}" ry="34" fill="url(#floor)"/>`;
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${back}</svg>`), left: 0, top: 0 });
    layers.push({ input: photo, left: px, top: py });
  } else {
    // foto com cena/cor: cartão arredondado
    const cw = PHOTO.w - 20, ch = Math.min(PHOTO.h, 560);
    const cx = PHOTO.x + 10, cy = PHOTO.y + (PHOTO.h - ch) / 2;
    const inner = 22;
    const photo = await sharp(input.product.image).rotate()
      .resize(cw - inner * 2, ch - inner * 2, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: '#FFFFFF' }).png().toBuffer();
    const card = `<rect x="${cx}" y="${cy + 14}" width="${cw}" height="${ch}" rx="36" fill="#000" fill-opacity="0.4"/><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="36" fill="#FFFFFF"/>`;
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${card}</svg>`), left: 0, top: 0 });
    layers.push({ input: photo, left: cx + inner, top: Math.round(cy + inner) });
  }

  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join('')}</svg>`);
  return base.composite([...layers.slice(0, 1), { input: overlay, left: 0, top: 0 }, ...layers.slice(1)]).jpeg({ quality: 90 }).toBuffer();
}

