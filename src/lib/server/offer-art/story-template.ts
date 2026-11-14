import 'server-only';
import sharp from 'sharp';
import { textPath, wrapText } from './text';

/*
 * Story com o FUNDO DO CLIENTE (plano Ultimate): o fundo ocupa a tela toda e a oferta vai num cartão
 * branco em área fixa — o cliente desenha o fundo deixando o topo para o logo e o centro livre.
 * Mostra as mesmas informações da arte padrão: De/Por, desconto, cupom e "Oferta #N · link na bio".
 */

export interface StoryTemplateInput {
  background: Buffer;
  product: Buffer;
  title: string;
  current: number;
  original?: number | null;
  discountPct?: number | null;
  coupon?: string | null;
  offerNumber?: number | null;
}

const W = 1080;
const H = 1920;
export const STORY_CARD = { x: 80, y: 480, w: 920, h: 1020, r: 44 };
const PRODUCT_H = 520;

function money(v: number): string {
  const opts = Number.isInteger(v) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return v.toLocaleString('pt-BR', opts);
}

function discountOf(i: { current: number; original?: number | null; discountPct?: number | null }): number | null {
  if (i.discountPct && i.discountPct > 0) return Math.round(i.discountPct);
  if (i.original && i.original > i.current) return Math.round((1 - i.current / i.original) * 100);
  return null;
}

/** Textos do template (separados do desenho para teste). */
export function storyTemplateTexts(i: { title: string; current: number; original?: number | null; coupon?: string | null; offerNumber?: number | null }) {
  return {
    de: i.original && i.original > i.current ? `De R$ ${money(i.original)}` : null,
    por: `Por R$ ${money(i.current)}`,
    coupon: i.coupon && i.coupon.trim() ? `Cupom: ${i.coupon.trim().toUpperCase()}` : null,
    footer: i.offerNumber ? `Oferta #${i.offerNumber} · link na bio` : 'link na bio',
  };
}

export async function renderStoryTemplate(input: StoryTemplateInput): Promise<Buffer> {
  const c = STORY_CARD;
  const pad = 60;
  const inner = c.w - pad * 2;
  const texts = storyTemplateTexts(input);
  const svg: string[] = [];

  // Camada 1: cartão branco com sombra suave
  svg.push(`<defs><filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="22"/></filter></defs>`);
  svg.push(`<rect x="${c.x + 30}" y="${c.y + 40}" width="${c.w - 60}" height="${c.h - 60}" rx="${c.r}" fill="#000" fill-opacity="0.45" filter="url(#sh)"/>`);
  svg.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="${c.r}" fill="#FFFFFF"/>`);
  const card = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join('')}</svg>`);
  svg.length = 0; // Camada 3 (acima da foto): selo, textos e rodapé

  // Selo de desconto ("−" desenhado: a fonte embutida não traz o hífen nesse peso)
  const pct = discountOf(input);
  if (pct) {
    const num = `${pct}%`;
    const numW = textPath(num, { x: 0, y: 0, size: 64, weight: 800, fill: '#FFFFFF' }).width;
    const minusW = 30;
    const bw = 26 + minusW + 12 + numW + 26;
    const bx = c.x + c.w - 30 - bw;
    const by = c.y + 30;
    svg.push(`<rect x="${bx}" y="${by}" width="${bw}" height="92" rx="20" fill="#0B0B0F"/>`);
    svg.push(`<rect x="${bx + 26}" y="${by + 43}" width="${minusW}" height="9" rx="2" fill="#FFFFFF"/>`);
    svg.push(textPath(num, { x: bx + 26 + minusW + 12, y: by + 69, size: 64, weight: 800, fill: '#FFFFFF' }).svg);
  }

  const left = c.x + pad;
  // Título (até 2 linhas)
  let y = c.y + 40 + PRODUCT_H + 72;
  for (const line of wrapText(input.title, { size: 46, weight: 700, maxWidth: inner, maxLines: 2 })) {
    svg.push(textPath(line, { x: left, y, size: 46, weight: 700, fill: '#16161A' }).svg);
    y += 58;
  }
  // De (riscado só no valor)
  y += 14;
  if (texts.de) {
    const de = textPath(texts.de, { x: left, y, size: 38, weight: 500, fill: '#8A8A93' });
    svg.push(de.svg);
    const label = textPath('De ', { x: 0, y: 0, size: 38, weight: 500, fill: '#8A8A93' }).width;
    svg.push(`<rect x="${left + label}" y="${y - 13}" width="${de.width - label}" height="4" fill="#8A8A93"/>`);
  }
  // Por (rótulo + valor em destaque)
  y += 100;
  const porLabel = textPath('Por', { x: left, y, size: 44, weight: 700, fill: '#16161A' });
  svg.push(porLabel.svg);
  svg.push(textPath(texts.por.replace(/^Por /, ''), { x: left + porLabel.width + 16, y, size: 92, weight: 800, fill: '#0B0B0F' }).svg);
  // Cupom
  if (texts.coupon) {
    const ct = textPath(texts.coupon, { x: 0, y: 0, size: 34, weight: 700, fill: '#0B0B0F' });
    const cy = y + 28;
    svg.push(`<rect x="${left}" y="${cy}" width="${ct.width + 40}" height="58" rx="14" fill="#F2F4F7" stroke="#0B0B0F" stroke-width="2.5" stroke-dasharray="10 7"/>`);
    svg.push(textPath(texts.coupon, { x: left + 20, y: cy + 41, size: 34, weight: 700, fill: '#0B0B0F' }).svg);
  }

  // Rodapé abaixo do cartão: "Oferta #N · link na bio ↗", numa pílula escura (legível em qualquer fundo)
  const footSize = 40;
  const parts = texts.footer.split(' · ');
  const widths = parts.map(p => textPath(p, { x: 0, y: 0, size: footSize, weight: 700, fill: '#FFF' }).width);
  const dotGap = parts.length > 1 ? 44 : 0;
  const arrow = 34;
  const pillW = widths.reduce((a, b) => a + b, 0) + dotGap + arrow + 64;
  const pillX = (W - pillW) / 2;
  const pillY = c.y + c.h + 44;
  svg.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="84" rx="42" fill="#000" fill-opacity="0.62"/>`);
  let fx = pillX + 32;
  const fy = pillY + 56;
  parts.forEach((p, i) => {
    svg.push(textPath(p, { x: fx, y: fy, size: footSize, weight: 700, fill: '#FFFFFF' }).svg);
    fx += widths[i];
    if (i < parts.length - 1) {
      svg.push(`<circle cx="${fx + dotGap / 2}" cy="${fy - 13}" r="5" fill="#FFFFFF"/>`);
      fx += dotGap;
    }
  });
  const ax = fx + 22;
  const ay = fy - 14;
  const s = 11;
  svg.push(`<path d="M${ax - s} ${ay + s} L${ax + s} ${ay - s} M${ax - s * 0.3} ${ay - s} L${ax + s} ${ay - s} L${ax + s} ${ay + s * 0.3}" stroke="#FFFFFF" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);

  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join('')}</svg>`);

  // Camada 2: foto do produto no topo do cartão (inteira, sem cortes)
  const boxW = inner + 40;
  const product = await sharp(input.product)
    .rotate()
    .resize(boxW, PRODUCT_H, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  const background = await sharp(input.background).rotate().resize(W, H, { fit: 'cover' }).toBuffer();
  return sharp(background)
    .composite([
      { input: card, top: 0, left: 0 },
      { input: product, top: c.y + 40, left: c.x + (c.w - boxW) / 2 },
      { input: overlay, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}
