import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRakutenTokenKey,
  getRakutenAccessToken,
  rakutenFetch,
  findNetshoesAdvertiserId,
  RakutenAuthError,
  clearRakutenTokenCache,
} from '../src/lib/server/rakuten-auth';

const originalFetch = global.fetch;
test.afterEach(() => { global.fetch = originalFetch; clearRakutenTokenCache(); });

const CREDS = { clientId: 'abc', clientSecret: 'xyz', sid: '1234567' };

type Call = { url: string; init?: RequestInit };
function mock(handler: (url: string, init: RequestInit | undefined, n: number) => Response) {
  const calls: Call[] = [];
  global.fetch = (async (url: any, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  }) as typeof fetch;
  return calls;
}
const tokenResponse = (t = 'tok-1') =>
  new Response(JSON.stringify({ access_token: t, expires_in: 3600, refresh_token: 'r' }), { status: 200 });

test('token-key é o base64 de clientId:clientSecret', () => {
  assert.equal(buildRakutenTokenKey('abc', 'xyz'), Buffer.from('abc:xyz').toString('base64'));
});

test('pede o token com Bearer da token-key e scope=SID, e reaproveita o cache por 55 min', async () => {
  let now = 1_000_000;
  const calls = mock(() => tokenResponse());
  const t1 = await getRakutenAccessToken(CREDS, { now: () => now });
  assert.equal(t1, 'tok-1');
  assert.equal(calls[0].url, 'https://api.linksynergy.com/token');
  assert.equal((calls[0].init?.headers as any).Authorization, `Bearer ${buildRakutenTokenKey('abc', 'xyz')}`);
  assert.match(String(calls[0].init?.body), /scope=1234567/);
  now += 54 * 60_000;
  await getRakutenAccessToken(CREDS, { now: () => now });
  assert.equal(calls.length, 1);
  now += 2 * 60_000;
  await getRakutenAccessToken(CREDS, { now: () => now });
  assert.equal(calls.length, 2);
});

test('credenciais recusadas viram RakutenAuthError credenciais_invalidas com mensagem clara', async () => {
  mock(() => new Response('{"error":"invalid_client"}', { status: 401 }));
  await assert.rejects(getRakutenAccessToken(CREDS), (e: any) => {
    assert.ok(e instanceof RakutenAuthError);
    assert.equal(e.code, 'credenciais_invalidas');
    assert.equal(e.message, 'Client ID, Client Secret ou SID da Rakuten inválidos.');
    return true;
  });
});

test('rakutenFetch: 401 na API renova o token uma vez e repete a chamada', async () => {
  let apiCalls = 0;
  const calls = mock((url, _init, n) => {
    if (url.endsWith('/token')) return tokenResponse(`tok-${n}`);
    apiCalls++;
    return apiCalls === 1 ? new Response('', { status: 401 }) : new Response('{"ok":true}', { status: 200 });
  });
  const res = await rakutenFetch(CREDS, 'https://api.linksynergy.com/v1/links/deep_links', { method: 'POST', body: '{}' });
  assert.equal(res.status, 200);
  assert.equal(calls.filter(c => c.url.endsWith('/token')).length, 2);
  assert.equal(apiCalls, 2);
  const last = calls[calls.length - 1];
  assert.notEqual((last.init?.headers as any).Authorization, (calls[1].init?.headers as any).Authorization);
});

test('descobre o código da Netshoes nas PARCERIAS ativas da conta (não na lista geral da rede)', async () => {
  const calls = mock(url => url.endsWith('/token') ? tokenResponse() :
    new Response(JSON.stringify({ _metadata: { total: 2 }, partnerships: [
      { status: 'active', advertiser: { id: 111, name: 'Outra Loja' } },
      { status: 'active', advertiser: { id: 43984, name: 'Netshoes WL' } },
    ] }), { status: 200 }));
  assert.equal(await findNetshoesAdvertiserId(CREDS), '43984');
  const api = calls.find(c => !c.url.endsWith('/token'))!;
  assert.match(api.url, /\/v1\/partnerships\?/);
  assert.match(api.url, /partner_status=active/);
});

test('sem parceria ativa com a Netshoes devolve null', async () => {
  mock(url => url.endsWith('/token') ? tokenResponse() :
    new Response(JSON.stringify({ partnerships: [{ status: 'active', advertiser: { id: 1, name: 'X' } }] }), { status: 200 }));
  assert.equal(await findNetshoesAdvertiserId(CREDS), null);
});
