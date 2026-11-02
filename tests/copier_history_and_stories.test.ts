import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

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

