import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderOfferArt } from '../src/lib/server/offer-art/render';
import { fetchProductImage } from '../src/lib/server/offer-art/fetch-image';
import { buildArtTheme } from '../src/lib/server/offer-art/theme';

async function fakeProduct() {
  // Produto simulado: círculo laranja sobre fundo branco (com margem branca para testar o recorte)
  return sharp({ create: { width: 800, height: 600, channels: 3, background: '#FFFFFF' } })
    .composite([{ input: Buffer.from('<svg width="800" height="600"><circle cx="400" cy="300" r="180" fill="#E8742A"/></svg>') }])
    .png().toBuffer();
}

const base = async () => ({
  theme: buildArtTheme('#1CCAF2', 'dark' as const),
  brand: { name: 'Radar de Ofertas', handle: '@radar.ofertas.br1', logo: null },
  product: { title: 'Creatina Monohidratada Soldiers Nutrition 1kg', image: await fakeProduct() },
  pricing: { current: 81.9, original: 129.9, discountPct: 37 },
  coupon: 'RADAR10',
  offerNumber: 128,
});

test('story tem 1080×1920 e feed 1080×1350', async () => {
  const story = await sharp(await renderOfferArt({ ...(await base()), format: 'story' })).metadata();
  const feed = await sharp(await renderOfferArt({ ...(await base()), format: 'feed' })).metadata();
  assert.deepEqual([story.width, story.height, story.format], [1080, 1920, 'jpeg']);
  assert.deepEqual([feed.width, feed.height], [1080, 1350]);
});

test('sem preço original, cupom e número não quebra', async () => {
  const input = await base();
  const out = await renderOfferArt({ ...input, format: 'feed', pricing: { current: 49.9 }, coupon: undefined, offerNumber: undefined });
  assert.ok(out.length > 10_000);
});

test('título enorme com emoji e fundo claro com cor clara não quebram', async () => {
  const input = await base();
  const out = await renderOfferArt({
    ...input, format: 'story', theme: buildArtTheme('#FFFF66', 'light'),
    product: { ...input.product, title: '🔥 '.repeat(5) + 'Kit '.repeat(80) },
  });
  assert.ok(out.length > 10_000);
});

test('logo enviado pelo cliente é usado', async () => {
  const input = await base();
  const logo = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#FF0000' } }).png().toBuffer();
  const withLogo = await renderOfferArt({ ...input, format: 'feed', brand: { ...input.brand, logo } });
  const without = await renderOfferArt({ ...input, format: 'feed' });
  assert.notDeepEqual(withLogo, without);
});

test('busca da foto recusa endereço interno', async () => {
  await assert.rejects(fetchProductImage('http://127.0.0.1/produto.jpg'), /endereço/i);
  await assert.rejects(fetchProductImage('http://192.168.0.10/produto.jpg'), /endereço/i);
  await assert.rejects(fetchProductImage('file:///etc/passwd'), /endereço/i);
});

test('busca da foto recusa arquivo grande demais', async () => {
  const original = global.fetch;
  global.fetch = (async () => new Response(new Uint8Array(9 * 1024 * 1024), { status: 200, headers: { 'content-type': 'image/jpeg' } })) as typeof fetch;
  try {
    await assert.rejects(fetchProductImage('https://http2.mlstatic.com/produto.jpg'), /grande/i);
  } finally {
    global.fetch = original;
  }
});
