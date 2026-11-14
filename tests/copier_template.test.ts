import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { planHasFeature } from '../src/lib/plans-config';
import { normalizeBrandAsset, validateAssetKind } from '../src/lib/server/brand-assets';
import { renderCopierTemplate } from '../src/lib/server/offer-art/copier-template';

test('template das fotos do copiador é recurso só do Ultimate', () => {
  assert.equal(planHasFeature('ultimate', 'copier_template'), true);
  assert.equal(planHasFeature('plus', 'copier_template'), false);
});

test('fundo do copiador vira JPEG quadrado 1080x1080 e o tipo é aceito', async () => {
  assert.equal(validateAssetKind('copier_background'), 'copier_background');
  const src = await sharp({ create: { width: 1254, height: 1254, channels: 3, background: '#06142a' } }).jpeg().toBuffer();
  const out = await normalizeBrandAsset('copier_background', src);
  const m = await sharp(out.buffer).metadata();
  assert.equal(out.contentType, 'image/jpeg');
  assert.deepEqual([m.width, m.height], [1080, 1080]);
  await assert.rejects(normalizeBrandAsset('copier_background', await sharp({ create: { width: 300, height: 300, channels: 3, background: '#000' } }).png().toBuffer()), /pequena/);
});

test('foto do produto no cartão branco central; cantos e pílula do fundo preservados', async () => {
  const background = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: '#06142a' } }).jpeg().toBuffer();
  const product = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#cc2200' } }).png().toBuffer();
  const jpg = await renderCopierTemplate({ background, product });
  const { data, info } = await sharp(jpg).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height], [1080, 1080]);
  const px = (x: number, y: number) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
  assert.ok(px(20, 20).every(v => v < 60), 'canto superior = fundo');
  assert.ok(px(900, 1000).every(v => v < 60), 'área da pílula (canto inferior direito) = fundo');
  assert.ok(px(150, 140).every(v => v > 235), 'borda do cartão = branco');
  const c = px(540, 500);
  assert.ok(c[0] > 150 && c[1] < 80, 'centro = foto do produto');
});

test('copiador: com fundo e plano liberado monta a foto no template; sem fundo ou sem plano, não mexe', async () => {
  const { applyCopierTemplate } = await import('../src/lib/server/copier-photo-template');
  const bg = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: '#06142a' } }).jpeg().toBuffer();
  const photo = await sharp({ create: { width: 500, height: 500, channels: 3, background: '#cc2200' } }).png().toBuffer();
  const uploads: string[] = [];
  const deps = (over: any = {}) => ({
    allowed: async () => true,
    loadBackground: async () => bg,
    loadPhoto: async () => photo,
    upload: async (_b: Buffer, path: string) => { uploads.push(path); return `https://cdn/${path}`; },
    ...over,
  });
  assert.equal(await applyCopierTemplate('u1', 'https://x/p.jpg', 'MSG 1', deps()), 'https://cdn/copier-template/u1/MSG1.jpg');
  assert.equal(await applyCopierTemplate('u1', 'https://x/p.jpg', 'm', deps({ loadBackground: async () => null })), undefined);
  assert.equal(await applyCopierTemplate('u1', 'https://x/p.jpg', 'm', deps({ allowed: async () => false })), undefined);
  assert.equal(await applyCopierTemplate('u1', 'https://x/p.jpg', 'm', deps({ loadPhoto: async () => { throw new Error('404'); } })), undefined);
});
