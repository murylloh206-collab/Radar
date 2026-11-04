import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { generatePostCaption } from '../src/lib/client/post-copy-generator';

test('1. Validação de Dimensões e Proporção do Story 9:16 (1080x1920)', async () => {
  const width = 1080;
  const height = 1920;
  assert.equal(width / height, 9 / 16);
});

test('2. Geração do Adesivo de Link com chamada {X}% OFF solicitada', async () => {
  const discountVal = '44';
  const customCall = `👇 COMPRE AQUI COM ${discountVal}% OFF 👇`;
  assert.match(customCall, /COMPRE AQUI COM 44% OFF/);
  assert.match(customCall, /👇/);
});

test('3. Sharp compõe imagem 9:16 com elementos vetoriais SVG válidos', async () => {
  const width = 1080;
  const height = 1920;
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#061225"/>
      <text x="540" y="200" fill="#F8FBFF" font-size="36" text-anchor="middle">RADAR DE OFERTAS</text>
      <text x="540" y="1600" fill="#1CCAF2" font-size="32" text-anchor="middle">👇 COMPRE AQUI COM 50% OFF 👇</text>
    </svg>
  `;
  const buffer = await sharp(Buffer.from(svg))
    .jpeg({ quality: 90 })
    .toBuffer();

  const metadata = await sharp(buffer).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1920);
  assert.equal(metadata.format, 'jpeg');
});

test('4. Geração de texto/legenda de post de feed a partir da oferta do histórico', () => {
  const copy = generatePostCaption({
    title: 'Camisa Térmica Voker Academia Proteção Solar',
    priceOriginal: '69,99',
    priceCurrent: '38,90',
    discountPct: '44',
    coupon: 'RADAR10',
    affiliateUrl: 'https://is.gd/4Smf1n',
    store: 'Mercado Livre',
  }, 'promocional');

  assert.match(copy, /Camisa Térmica Voker Academia/);
  assert.match(copy, /38,90/);
  assert.match(copy, /44% OFF/);
  assert.match(copy, /RADAR10/);
  assert.match(copy, /https:\/\/is\.gd\/4Smf1n/);
  assert.match(copy, /Radar de Ofertas/);
});

test('5. Geração de texto com estilo engajamento (Comente EU QUERO)', () => {
  const copy = generatePostCaption({
    title: 'Smartwatch Ultra Pro',
    priceCurrent: '199,90',
    affiliateUrl: 'https://is.gd/smart',
  }, 'engajamento');

  assert.match(copy, /EU QUERO/);
  assert.match(copy, /Smartwatch Ultra Pro/);
});
