import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { getHighResCandidateUrls } from '../src/lib/server/product-image-optimizer';

test('Sistema Inteligente de Tratamento de Imagens: Padrões de CDN em alta resolução', () => {
  // 1. Mercado Livre: substituição de miniatura por -F.jpg e -O.jpg em 2X
  const mlCandidates = getHighResCandidateUrls('https://http2.mlstatic.com/D_NQ_NP_676510-MLB70498132049_072023-V.webp');
  assert.ok(mlCandidates.some((c) => c.includes('D_NQ_NP_2X_') && c.endsWith('-F.jpg')), 'Deve conter variante Retina 2X -F.jpg');
  assert.ok(mlCandidates.some((c) => c.includes('D_NQ_NP_2X_') && c.endsWith('-O.jpg')), 'Deve conter variante Retina 2X -O.jpg');

  // 2. Shopee: remoção de sufixos _tn
  const shopeeCandidates = getHighResCandidateUrls('https://down-br.img.susercontent.com/file/br-11134207-7r98o-xxx_tn');
  assert.ok(shopeeCandidates.some((c) => !c.includes('_tn')), 'Deve conter versão sem sufixo _tn');

  // 3. Amazon: substituição por SL1500
  const amzCandidates = getHighResCandidateUrls('https://m.media-amazon.com/images/I/71xyz123._AC_SX679_.jpg');
  assert.ok(amzCandidates.some((c) => c.includes('._AC_SL1500_.')), 'Deve conter versão master SL1500');

  // 4. Netshoes: substituição por zoom
  const nsCandidates = getHighResCandidateUrls('https://static.netshoes.com.br/produtos/tenis-xyz/06/detalhe/tenis-xyz.jpg');
  assert.ok(nsCandidates.some((c) => c.includes('/zoom/')), 'Deve conter endpoint zoom');
});

test('Sistema Inteligente de Tratamento de Imagens: Enquadramento 1080x1080 sem corte para calçados e celulares', async () => {
  const artifactDir = path.join(process.cwd(), 'public', 'test-renders');
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  // Dummy Tênis (1200x600 - horizontal largo)
  const tenisSvg = Buffer.from(`
    <svg width="1200" height="600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="600" fill="#FFFFFF"/>
      <path d="M 120 450 Q 250 500 500 490 Q 800 500 1080 430 Q 1120 400 1050 320 Q 960 220 800 200 Q 720 180 650 300 Q 520 300 350 350 Q 180 360 120 450 Z" fill="#2563EB"/>
      <circle cx="1000" cy="340" r="24" fill="#F59E0B"/>
      <text x="360" y="430" font-family="sans-serif" font-size="44" font-weight="bold" fill="#FFFFFF">TÊNIS DE CORRIDA PRO</text>
    </svg>
  `);

  const tenisBuffer = await sharp(tenisSvg).png().toBuffer();

  // Executar auto-trim + contain 840x840 no canvas 1080x1080
  const maxSafeInner = 840;
  const targetSize = 1080;

  const innerBuffer = await sharp(tenisBuffer)
    .trim({ background: '#FFFFFF', threshold: 12 })
    .resize(maxSafeInner, maxSafeInner, {
      fit: 'inside',
      kernel: sharp.kernel.lanczos3,
    })
    .toBuffer();

  const metaInner = await sharp(innerBuffer).metadata();
  assert.ok(metaInner.width! <= maxSafeInner, 'Largura não deve exceder área útil de 840px');
  assert.ok(metaInner.height! <= maxSafeInner, 'Altura não deve exceder área útil de 840px');

  // Proporção de tênis deve ser mais larga que alta
  assert.ok(metaInner.width! > metaInner.height!, 'Tênis horizontal deve preservar aspect ratio mais largo que alto');

  const topPos = Math.round((targetSize - metaInner.height!) / 2);
  const leftPos = Math.round((targetSize - metaInner.width!) / 2);

  // Garantir margem de segurança de pelo menos 100px nas bordas
  assert.ok(leftPos >= 100, 'Margem lateral deve ser >= 100px para evitar cortes no WhatsApp');
  assert.ok(topPos >= 100, 'Margem vertical deve ser >= 100px para evitar cortes no WhatsApp');

  const canvas1080 = await sharp({
    create: {
      width: targetSize,
      height: targetSize,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: innerBuffer, top: topPos, left: leftPos }])
    .jpeg({ quality: 92 })
    .toBuffer();

  const finalMeta = await sharp(canvas1080).metadata();
  assert.equal(finalMeta.width, 1080, 'Canvas deve ter exatamente 1080px de largura');
  assert.equal(finalMeta.height, 1080, 'Canvas deve ter exatamente 1080px de altura');
  assert.equal(finalMeta.format, 'jpeg', 'Formato final deve ser JPEG');
});
