import test from 'node:test';
import assert from 'node:assert/strict';
import { convertToAffiliateLink } from '../src/lib/server/affiliate-converter';
import { getStoreHealthMap } from '../src/lib/server/store-health';

const PRODUCT = 'https://www.mercadolivre.com.br/o-boticario-quasar-blue-desodorante-colonia-100ml/p/MLB39016247';
const originalFetch = global.fetch;
test.afterEach(() => { global.fetch = originalFetch; });

let n = 0;
function creds() {
  n++;
  const userId = `44444444-4444-4444-8444-44444444444${n}`;
  return {
    userId,
    map: {
      mercadolivre: {
        id: 'm', userId, storeName: 'mercadolivre', isActive: true, isValidated: true,
        appId: '77625408', affiliateTag: 'michelhenrique1', userToken: 'ssid=abc; _csrf=xyz; outro=1',
      },
    } as any,
  };
}

function mockMl(api: 'ok' | 401 | 'network') {
  global.fetch = (async (url: any) => {
    const u = String(url);
    if (u.includes('/affiliate-program/api/v2/stripe/user/links')) {
      if (api === 'network') throw new TypeError('fetch failed');
      if (api === 401) return new Response('{"message":"Unauthorized"}', { status: 401 });
      return new Response(JSON.stringify({ short_url: 'https://meli.la/2NUusqT' }), { status: 200 });
    }
    return new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
}

test('com meli.la gerado, usa só o meli.la e libera o envio', async () => {
  mockMl('ok');
  const { map } = creds();
  const r = await convertToAffiliateLink(PRODUCT, map);
  assert.equal(r.success, true, r.error);
  assert.equal(r.affiliateUrl, 'https://meli.la/2NUusqT');
  assert.equal(r.isAutoDispatchAllowed, true);
});

test('sessão recusada (401): sem link, sem envio, motivo claro e saúde marcada como falhou', async () => {
  mockMl(401);
  const { map, userId } = creds();
  const r = await convertToAffiliateLink(PRODUCT, map);
  assert.equal(r.affiliateUrl, null);
  assert.equal(r.isAutoDispatchAllowed, false);
  assert.equal(r.error, 'Sessão do Mercado Livre expirou. Reconecte pela extensão.');
  const health = await getStoreHealthMap(userId);
  assert.equal(health.mercadolivre.status, 'falhou');
  assert.equal(health.mercadolivre.reason, 'Sessão do Mercado Livre expirou. Reconecte pela extensão.');
});

test('erro de rede: sem link e sem envio, mas a saúde não é alterada', async () => {
  mockMl('network');
  const { map, userId } = creds();
  const r = await convertToAffiliateLink(PRODUCT, map);
  assert.equal(r.affiliateUrl, null);
  assert.equal(r.isAutoDispatchAllowed, false);
  assert.doesNotMatch(r.affiliateUrl || '', /matt_word/);
  const health = await getStoreHealthMap(userId);
  assert.equal(health.mercadolivre.status, 'nao_configurado');
});
