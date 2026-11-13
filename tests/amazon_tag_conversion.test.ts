import test from 'node:test';
import assert from 'node:assert/strict';
import { convertToAffiliateLink } from '../src/lib/server/affiliate-converter';

const originalFetch = global.fetch;
test.afterEach(() => { global.fetch = originalFetch; });
test.beforeEach(() => {
  global.fetch = (async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch;
});

function credentials(amazon: Record<string, string>) {
  return { amazon: { id: 'a', storeName: 'amazon', isActive: true, isValidated: true, ...amazon } } as any;
}

test('com a tag de associado, gera o link curto oficial /dp/ASIN?tag= e libera o envio automático', async () => {
  const result = await convertToAffiliateLink(
    'https://www.amazon.com.br/Fone-Bluetooth-JBL-Tune-520BT/dp/B0C6KKQ7ND/ref=sr_1_1?keywords=fone&qid=1&sr=8-1',
    credentials({ affiliateTag: 'radardeofe00a-20' })
  );
  assert.equal(result.success, true, result.error);
  assert.equal(result.affiliateUrl, 'https://www.amazon.com.br/dp/B0C6KKQ7ND?tag=radardeofe00a-20');
  assert.equal(result.isAutoDispatchAllowed, true);
  assert.equal(result.linkState, 'apto_para_envio');
});

test('troca a tag de outro afiliado pela do dono da conta', async () => {
  const result = await convertToAffiliateLink(
    'https://www.amazon.com.br/dp/B0C6KKQ7ND?tag=outroafiliado-20&linkCode=ogi&th=1',
    credentials({ affiliateTag: 'radardeofe00a-20' })
  );
  assert.equal(result.affiliateUrl, 'https://www.amazon.com.br/dp/B0C6KKQ7ND?tag=radardeofe00a-20');
  assert.doesNotMatch(result.affiliateUrl || '', /outroafiliado/);
});

test('sem ASIN identificável continua indo para revisão manual', async () => {
  const result = await convertToAffiliateLink(
    'https://www.amazon.com.br/s?k=fone+bluetooth',
    credentials({ affiliateTag: 'radardeofe00a-20' })
  );
  assert.equal(result.isAutoDispatchAllowed, false);
});

test('tag em formato inválido não libera envio automático', async () => {
  const result = await convertToAffiliateLink(
    'https://www.amazon.com.br/dp/B0C6KKQ7ND',
    credentials({ affiliateTag: 'minha tag' })
  );
  assert.equal(result.isAutoDispatchAllowed, false);
});
