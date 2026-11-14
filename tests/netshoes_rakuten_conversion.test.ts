import test from 'node:test';
import assert from 'node:assert/strict';
import { convertToAffiliateLink } from '../src/lib/server/affiliate-converter';
import { clearRakutenTokenCache } from '../src/lib/server/rakuten-auth';

const PRODUCT = 'https://www.netshoes.com.br/tenis-nike-revolution-7-masculino-preto+branco-JD8-5683-026';
const originalFetch = global.fetch;
test.afterEach(() => { global.fetch = originalFetch; clearRakutenTokenCache(); });

function creds(extra: Record<string, unknown>) {
  return {
    netshoes: {
      id: 'n', userId: '33333333-3333-4333-8333-333333333333', storeName: 'netshoes', isActive: true, isValidated: true,
      appId: 'ClientIdRakutenK8p3Qz9vWm2Lx7Rd', appSecret: 'ClientSecretRakutenH4n8Tq2Zx6Bv', affiliateTag: '3846201',
      ...extra,
    },
  } as any;
}

function mockRakuten(calls: string[] = []) {
  global.fetch = (async (url: any, init?: RequestInit) => {
    const u = String(url);
    calls.push(u);
    if (u === 'https://api.linksynergy.com/token') {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
    }
    if (u.includes('/v1/links/deep_links')) {
      assert.equal((init?.headers as any).Authorization, 'Bearer tok');
      assert.equal(JSON.parse(String(init?.body)).advertiser_id, 43984);
      return new Response(JSON.stringify({ short_link: 'https://click.linksynergy.com/link?id=ABC&offerid=1.2&type=2' }), { status: 200 });
    }
    return new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
  return calls;
}

test('Netshoes com Client ID, Secret, SID e código da loja gera o link oficial e libera o envio', async () => {
  const calls = mockRakuten();
  const r = await convertToAffiliateLink(PRODUCT, creds({ sessionData: { netshoesAdvertiserId: '43984' } }));
  assert.equal(r.success, true, r.error);
  assert.equal(r.affiliateUrl, 'https://click.linksynergy.com/link?id=ABC&offerid=1.2&type=2');
  assert.equal(r.isAutoDispatchAllowed, true);
  assert.ok(calls.includes('https://api.linksynergy.com/token'));
});

test('Netshoes sem o código da loja descoberto falha pedindo para conectar pela extensão', async () => {
  mockRakuten();
  const r = await convertToAffiliateLink(PRODUCT, creds({}));
  assert.equal(r.success, false);
  assert.match(r.error || '', /Conecte a Rakuten pela extensão \(faltando: .*código da Netshoes/);
});

test('Netshoes sem Client Secret falha listando o que falta', async () => {
  mockRakuten();
  const r = await convertToAffiliateLink(PRODUCT, creds({ appSecret: undefined, sessionData: { netshoesAdvertiserId: '43984' } }));
  assert.equal(r.success, false);
  assert.match(r.error || '', /faltando: .*Client Secret/);
});

test('lê o formato real da Rakuten: advertiser.deep_link.deep_link_url', async () => {
  global.fetch = (async (url: any) => {
    const u = String(url);
    if (u === 'https://api.linksynergy.com/token') return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
    if (u.includes('/v1/links/deep_links')) {
      return new Response(JSON.stringify({
        _metadata: { api_name_version: 'links-deep-links-v1.1.0' },
        advertiser: { id: 43984, name: 'Netshoes WL', deep_link: { deep_link_url: 'https://click.linksynergy.com/deeplink?id=AbC&mid=43984&murl=https%3A%2F%2Fwww.netshoes.com.br%2F', u1: '' } },
      }), { status: 200 });
    }
    return new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
  const r = await convertToAffiliateLink(PRODUCT, creds({ sessionData: { netshoesAdvertiserId: '43984' } }));
  assert.equal(r.success, true, r.error);
  assert.equal(r.affiliateUrl, 'https://click.linksynergy.com/deeplink?id=AbC&mid=43984&murl=https%3A%2F%2Fwww.netshoes.com.br%2F');
});
