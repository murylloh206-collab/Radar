import 'server-only';
import sharp from 'sharp';

/*
 * Foto das ofertas do copiador com o FUNDO DO CLIENTE (plano Ultimate): fundo quadrado inteiro
 * (moldura e pílula do @ preservadas) e a foto do produto num cartão branco arredondado no centro.
 */
const W = 1080;
export const COPIER_CARD = { x: 120, y: 110, w: 840, h: 780, r: 44, pad: 40 };

export async function renderCopierTemplate(input: { background: Buffer; product: Buffer }): Promise<Buffer> {
  const c = COPIER_CARD;
  const card = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}">
    <defs><filter id="s" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="20"/></filter></defs>
    <rect x="${c.x + 24}" y="${c.y + 30}" width="${c.w - 48}" height="${c.h - 40}" rx="${c.r}" fill="#000" fill-opacity="0.5" filter="url(#s)"/>
    <rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="${c.r}" fill="#FFFFFF"/>
  </svg>`);
  const product = await sharp(input.product)
    .rotate()
    .resize(c.w - c.pad * 2, c.h - c.pad * 2, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  const background = await sharp(input.background).rotate().resize(W, W, { fit: 'cover' }).toBuffer();
  return sharp(background)
    .composite([
      { input: card, top: 0, left: 0 },
      { input: product, top: c.y + c.pad, left: c.x + c.pad },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}
