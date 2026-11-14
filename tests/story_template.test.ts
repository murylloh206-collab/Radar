import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { planHasFeature } from '../src/lib/plans-config';
import { normalizeBrandAsset, BrandAssetError } from '../src/lib/server/brand-assets';
import { renderStoryTemplate } from '../src/lib/server/offer-art/story-template';

const img = (w: number, h: number, bg = '#123456', fmt: 'png' | 'jpeg' = 'png') => {
  const s = sharp({ create: { width: w, height: h, channels: 3, background: bg } });
  return fmt === 'png' ? s.png().toBuffer() : s.jpeg().toBuffer();
};

test('template do story é recurso só do Ultimate', () => {
  assert.equal(planHasFeature('ultimate', 'story_template'), true);
  assert.equal(planHasFeature('plus', 'story_template'), false);
  assert.equal(planHasFeature('impulse', 'story_template'), false);
});

test('logo vira PNG 512x512 e fundo vira JPEG 1080x1920', async () => {
  const logo = await normalizeBrandAsset('logo', await img(800, 300));
  const lm = await sharp(logo.buffer).metadata();
  assert.equal(logo.contentType, 'image/png');
  assert.deepEqual([lm.width, lm.height], [512, 512]);
  const bg = await normalizeBrandAsset('story_background', await img(1125, 2000, '#0a1a3a', 'jpeg'));
  const bm = await sharp(bg.buffer).metadata();
  assert.equal(bg.contentType, 'image/jpeg');
  assert.deepEqual([bm.width, bm.height], [1080, 1920]);
});

test('arquivo que não é imagem, grande demais ou pequeno demais é recusado', async () => {
  await assert.rejects(normalizeBrandAsset('logo', Buffer.from('não sou imagem')), BrandAssetError);
  await assert.rejects(normalizeBrandAsset('logo', Buffer.alloc(8 * 1024 * 1024 + 1)), /8 MB/);
  await assert.rejects(normalizeBrandAsset('story_background', await img(200, 300)), /pequena/);
});

test('story com template: fundo preservado nas bordas e cartão branco no centro', async () => {
  const background = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#0a1a3a' } }).jpeg().toBuffer();
  const product = await img(600, 600, '#cc2200');
  const png = await renderStoryTemplate({ background, product, title: 'Relógio Masculino Technos Skydiver Prata Azul', current: 436, original: 795.99, discountPct: 45 });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height], [1080, 1920]);
  const px = (x: number, y: number) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
  const [r, g, b] = px(20, 20);
  assert.ok(r < 40 && g < 50 && b > 40, `borda deveria ser o fundo, veio ${[r, g, b]}`);
  const card = px(120, 1460);
  assert.ok(card.every(v => v > 240), `canto inferior do cartão deveria ser branco, veio ${card}`);
  const prod = px(540, 750);
  assert.ok(prod[0] > 150 && prod[1] < 80, `centro do cartão deveria ter a foto do produto, veio ${prod}`);
});

test('conta do dono tem acesso a todos os recursos, inclusive o template do story', async () => {
  const { checkPlanFeatureAccess } = await import('../src/lib/server/plan-guard');
  const r = await checkPlanFeatureAccess('story_template', '00000000-0000-0000-0000-000000000001');
  assert.equal(r.allowed, true);
});
