import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

test('upload de imagem exige login', async () => {
  const { POST, GET, DELETE } = await import('../src/app/api/brand-assets/route');
  const fd = new FormData();
  fd.set('kind', 'logo');
  fd.set('file', new Blob([Buffer.from('x')], { type: 'image/png' }), 'logo.png');
  assert.equal((await POST(new NextRequest('http://localhost/api/brand-assets', { method: 'POST', body: fd }))).status, 401);
  assert.equal((await GET(new NextRequest('http://localhost/api/brand-assets'))).status, 401);
  assert.equal((await DELETE(new NextRequest('http://localhost/api/brand-assets?kind=story_background', { method: 'DELETE' }))).status, 401);
});

test('tipo de imagem desconhecido é recusado (400)', async () => {
  const { validateAssetKind } = await import('../src/lib/server/brand-assets');
  assert.equal(validateAssetKind('logo'), 'logo');
  assert.equal(validateAssetKind('story_background'), 'story_background');
  assert.equal(validateAssetKind('../../etc'), null);
});
