import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { cutWhiteBackground, discountOf, priceParts, renderVitrineArt, splitTitle } from '../src/lib/server/offer-art/vitrine';
import { buildArtTheme } from '../src/lib/server/offer-art/theme';

test('título: nome grande (até 4 palavras) e o resto como detalhe', () => {
  const s = splitTitle('Apple iPhone 16 256 GB Preto');
  assert.equal(s.headline.join(' '), 'APPLE IPHONE 16');
  assert.equal(s.detail, '256 GB PRETO');
  assert.equal(splitTitle('Playstation 5').detail, '');
});

test('preço com centavos separados e desconto calculado', () => {
  assert.deepEqual(priceParts(5309.1), { main: 'R$ 5.309,', cents: '10' });
  assert.deepEqual(priceParts(59.9), { main: 'R$ 59,', cents: '90' });
  assert.equal(discountOf(53, 100, null), 47);
  assert.equal(discountOf(53, null, 44), 44);
  assert.equal(discountOf(53, null, null), null);
});

test('fundo branco sai; foto com cena fica para o cartão', async () => {
  const white = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#fff"/><rect x="120" y="60" width="160" height="280" fill="#222"/></svg>')).png().toBuffer();
  const cut = await cutWhiteBackground(white);
  assert.ok(cut);
  const m = await sharp(cut!).metadata();
  assert.ok(m.hasAlpha && (m.width || 0) <= 170, `recortado ${m.width}x${m.height}`);
  const scene = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#3a6' } }).png().toBuffer();
  assert.equal(await cutWhiteBackground(scene), null);
});

test('arte do feed sai em 1080x1350', async () => {
  const image = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#fff' } })
    .composite([{ input: await sharp({ create: { width: 120, height: 200, channels: 3, background: '#111' } }).png().toBuffer(), left: 90, top: 50 }]).png().toBuffer();
  const art = await renderVitrineArt({ theme: buildArtTheme('#1CCAF2', 'dark'), product: { title: 'Fone Bluetooth JBL Tune 520BT Preto', image },
    pricing: { current: 199.9, original: 299.9 }, paymentNote: 'no Pix', offerNumber: 7 });
  const m = await sharp(art).metadata();
  assert.deepEqual([m.width, m.height], [1080, 1350]);
});
