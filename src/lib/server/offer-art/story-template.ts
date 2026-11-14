import 'server-only';
import sharp from 'sharp';
import { textPath, wrapText } from './text';

/*
 * Story com o FUNDO DO CLIENTE (plano Ultimate): o fundo ocupa a tela toda e a oferta vai num cartão
 * branco em área fixa — o cliente desenha o fundo deixando o topo para o logo e o centro livre.
 */

export interface StoryTemplateInput {
  background: Buffer;
  product: Buffer;
  title: string;
  current: number;
  original?: number | null;
  discountPct?: number | null;
}

const W = 1080;
const H = 1920;
export const STORY_CARD = { x: 80, y: 480, w: 920, h: 1020, r: 44 };
const PRODUCT_H = 590;

function money(v: number): string {
  const opts = Number.isInteger(v) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return v.toLocaleString('pt-BR', opts);
}

function discountOf(i: StoryTemplateInput): number | null {
  if (i.discountPct && i.discountPct > 0) return Math.round(i.discountPct);
  if (i.original && i.original > i.current) return Math.round((1 - i.current / i.original) * 100);
  return null;
}

export async function renderStoryTemplate(input: StoryTemplateInput): Promise<Buffer> {
  const c = STORY_CARD;
  const pad = 60;
  const inner = c.w - pad * 2;
  const svg: string[] = [];

  // Cartão branco com sombra suave
  svg.push(`<defs><filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="22"/></filter></defs>`);
  svg.push(`<rect x="${c.x + 30}" y="${c.y + 40}" width="${c.w - 60}" height="${c.h - 60}" rx="${c.r}" fill="#000" fill-opacity="0.45" filter="url(#sh)"/>`);
  svg.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="${c.r}" fill="#FFFFFF"/>`);
  const card = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join('')}</svg>`);
  svg.length = 0; // a partir daqui: camada de cima (selo e textos), acima da foto

  // Selo de desconto ("−" desenhado à mão: a fonte embutida não traz o hífen nesse peso)
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

  // Texto: título (2 linhas), preço "de" riscado, preço atual
  let y = c.y + 40 + PRODUCT_H + 72;
  for (const line of wrapText(input.title, { size: 48, weight: 700, maxWidth: inner, maxLines: 2 })) {
    svg.push(textPath(line, { x: c.x + pad, y, size: 48, weight: 700, fill: '#16161A' }).svg);
    y += 60;
  }
  y += 34;
  if (input.original && input.original > input.current) {
    const de = textPath(`R$ ${money(input.original)}`, { x: c.x + pad, y, size: 40, weight: 500, fill: '#8A8A93' });
    svg.push(de.svg);
    svg.push(`<rect x="${c.x + pad}" y="${y - 14}" width="${de.width}" height="4" fill="#8A8A93"/>`);
    y += 100;
  } else {
    y += 50;
  }
  svg.push(textPath(`R$ ${money(input.current)}`, { x: c.x + pad, y, size: 96, weight: 800, fill: '#0B0B0F' }).svg);

  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join('')}</svg>`);

  // Foto do produto no topo do cartão (inteira, sem cortes)
  const boxW = inner + 40;
  const boxH = PRODUCT_H;
  const product = await sharp(input.product)
    .rotate()
    .resize(boxW, boxH, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
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
