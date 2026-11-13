import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

process.env.RADAR_DB_PATH = path.join(os.tmpdir(), `radar_branded_${Date.now()}.json`);

async function productFile() {
  const file = path.join(os.tmpdir(), `produto_${Date.now()}.png`);
  await sharp({ create: { width: 500, height: 500, channels: 3, background: '#FFFFFF' } })
    .composite([{ input: Buffer.from('<svg width="500" height="500"><rect x="150" y="100" width="200" height="300" fill="#334"/></svg>') }])
    .png().toFile(file);
  return file;
}

test('arte usa nome, cor e fundo da marca do cliente', async () => {
  const { saveBrandSettings } = await import('../src/lib/server/brand-settings');
  const { renderBrandedOfferArt } = await import('../src/lib/server/offer-art/branded');
  const image = await productFile();
  await saveBrandSettings('cliente-laranja', { panelName: 'Baratinhos da Ju', accentColor: '#FF7A1A', artBackground: 'dark' } as any);
  await saveBrandSettings('cliente-rosa', { panelName: 'Achadinhos da Bia', accentColor: '#FF3D8B', artBackground: 'light' } as any);
  const a = await renderBrandedOfferArt('cliente-laranja', { format: 'feed', title: 'Produto teste', imagePathOrUrl: image, priceCurrent: 99.9 });
  const b = await renderBrandedOfferArt('cliente-rosa', { format: 'feed', title: 'Produto teste', imagePathOrUrl: image, priceCurrent: 99.9 });
  const pixel = async (buf: Buffer) => (await sharp(buf).extract({ left: 5, top: 1300, width: 1, height: 1 }).raw().toBuffer());
  const [pa, pb] = [await pixel(a), await pixel(b)];
  assert.ok(pa[0] + pa[1] + pa[2] < 200, 'fundo escuro na loja laranja');
  assert.ok(pb[0] + pb[1] + pb[2] > 600, 'fundo claro na loja rosa');
});

test('renderizador antigo do story passa a usar a arte nova', async () => {
  const { renderStoryImage } = await import('../src/lib/server/story-renderer');
  const image = await productFile();
  const out = await renderStoryImage({ userId: 'cliente-laranja', title: 'Produto teste', priceCurrent: 99.9, priceOriginal: 149.9, imageUrl: image, format: 'story_9_16' });
  assert.equal(out.ok, true);
  const file = out.publicUrl.startsWith('/') ? path.join(process.cwd(), 'public', out.publicUrl) : out.publicUrl;
  const meta = await sharp(fs.readFileSync(file)).metadata();
  assert.deepEqual([meta.width, meta.height], [1080, 1920]);
  // canto inferior esquerdo com o fundo laranja-escuro da marca (não o azul antigo do Radar)
  const [r, , b] = await sharp(fs.readFileSync(file)).extract({ left: 5, top: 1900, width: 1, height: 1 }).raw().toBuffer();
  assert.ok(r > b, 'tom quente da marca laranja');
  fs.rmSync(file, { force: true });
});
