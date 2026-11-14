import test from 'node:test';
import assert from 'node:assert/strict';
import { recordStoreHealth, getStoreHealthMap, memoryStoreHealthRepo } from '../src/lib/server/store-health';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

test('status ok grava lastOkAt e lastCheckedAt', async () => {
  const repo = memoryStoreHealthRepo();
  const h = await recordStoreHealth(U1, 'mercadolivre', { status: 'ok' }, repo);
  assert.equal(h.status, 'ok');
  assert.ok(h.lastOkAt);
  assert.equal(h.lastOkAt, h.lastCheckedAt);
  assert.equal(h.reason, null);
});

test('falha depois de ok mantém o lastOkAt anterior e grava o motivo', async () => {
  const repo = memoryStoreHealthRepo();
  const ok = await recordStoreHealth(U1, 'mercadolivre', { status: 'ok' }, repo);
  await new Promise(r => setTimeout(r, 5));
  const f = await recordStoreHealth(U1, 'mercadolivre', { status: 'falhou', reason: 'Sessão expirou' }, repo);
  assert.equal(f.status, 'falhou');
  assert.equal(f.reason, 'Sessão expirou');
  assert.equal(f.lastOkAt, ok.lastOkAt);
  assert.notEqual(f.lastCheckedAt, ok.lastCheckedAt);
});

test('usuário sem registros recebe as 5 lojas como nao_configurado', async () => {
  const map = await getStoreHealthMap(U1, memoryStoreHealthRepo());
  assert.deepEqual(Object.keys(map).sort(), ['amazon', 'magalu', 'mercadolivre', 'netshoes', 'shopee']);
  for (const h of Object.values(map)) assert.equal(h.status, 'nao_configurado');
});

test('um usuário não enxerga a saúde de outro', async () => {
  const repo = memoryStoreHealthRepo();
  await recordStoreHealth(U1, 'shopee', { status: 'ok' }, repo);
  const map2 = await getStoreHealthMap(U2, repo);
  assert.equal(map2.shopee.status, 'nao_configurado');
  const map1 = await getStoreHealthMap(U1, repo);
  assert.equal(map1.shopee.status, 'ok');
});
