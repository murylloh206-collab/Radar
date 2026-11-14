import test from 'node:test';
import assert from 'node:assert/strict';
import { getStoreCredentialsMapWithSecrets } from '../src/lib/server/credentials-vault';
import { generateMercadoLivreMeliLaDetailed } from '../src/lib/server/affiliate-converter';
import { resolveExtensionUser, ExtensionAuthUnavailableError, memoryExtensionAuthRepo, createPairingCode, exchangePairingCode, revokeAllExtensionTokens } from '../src/lib/server/extension-auth';
import { runDailyStoreHealth, checkStoreConnection, SHOPEE_TEST_URL, type StoreCheckDeps } from '../src/lib/server/store-health-checks';
import { memoryStoreHealthRepo, getStoreHealthMap, type StoreHealthRepo } from '../src/lib/server/store-health';
import { connectStore, getStoreStatusViews, type StoreConnectDeps } from '../src/lib/server/store-connect';
import { recordStoreHealth } from '../src/lib/server/store-health';
import { storeStatusLabel } from '../src/lib/store-status-labels';

const CLIENT = '99999999-9999-4999-8999-999999999999';
const req = (t?: string) => new Request('http://x/api/extension/status', { headers: t ? { authorization: `Bearer ${t}` } : {} });

// #1 — dados do dono nunca completam a conta de um cliente
test('#1 cofre não completa a conta de cliente com etiqueta, cookie ou chaves do dono', async () => {
  process.env.SHOPEE_APP_ID = '18300000777';
  process.env.SHOPEE_APP_SECRET = 'DONOSEGREDOSHOPEEDONOSEGREDOSHOP';
  process.env.MERCADOLIVRE_COOKIE = 'ssid=COOKIEDODONO';
  const map = await getStoreCredentialsMapWithSecrets(CLIENT, [
    { id: 's', storeName: 'shopee', affiliateTag: 'subidcliente', isActive: true } as any,
    { id: 'm', storeName: 'mercadolivre', isActive: true } as any,
  ]);
  assert.equal(map.shopee?.appId ?? '', '');
  assert.equal(map.shopee?.appSecret ?? '', '');
  assert.equal(map.mercadolivre?.affiliateTag ?? '', '');
  assert.equal(map.mercadolivre?.appId ?? '', '');
  assert.equal(map.mercadolivre?.userToken ?? '', '');
});

test('#1 meli.la sem cookie próprio não usa o cookie do dono e nem chama o ML', async () => {
  process.env.MERCADOLIVRE_COOKIE = 'ssid=COOKIEDODONO';
  const orig = global.fetch;
  let called = false;
  global.fetch = (async () => { called = true; return new Response('{}'); }) as typeof fetch;
  const r = await generateMercadoLivreMeliLaDetailed('https://www.mercadolivre.com.br/p/MLB1', 'tag', '');
  global.fetch = orig;
  assert.deepEqual(r, { link: null, unauthorized: true });
  assert.equal(called, false);
});

// #2 — erro de banco não desvincula a extensão
test('#2 erro do banco ao validar o token vira ExtensionAuthUnavailableError, não "token inválido"', async () => {
  const repo = { ...memoryExtensionAuthRepo(), findToken: async () => { throw new Error('db down'); } };
  await assert.rejects(resolveExtensionUser(req('x'.repeat(43)), repo), ExtensionAuthUnavailableError);
});

// #7 — desvincular extensões
test('#7 revokeAllExtensionTokens corta todos os tokens do usuário e só dele', async () => {
  const repo = memoryExtensionAuthRepo();
  const a1 = await exchangePairingCode((await createPairingCode(CLIENT, repo)).code, repo);
  const a2 = await exchangePairingCode((await createPairingCode(CLIENT, repo)).code, repo);
  const other = await exchangePairingCode((await createPairingCode('12121212-1212-4121-8121-121212121212', repo)).code, repo);
  await revokeAllExtensionTokens(CLIENT, repo);
  assert.equal(await resolveExtensionUser(req(a1!.token), repo), null);
  assert.equal(await resolveExtensionUser(req(a2!.token), repo), null);
  assert.ok(await resolveExtensionUser(req(other!.token), repo));
});

function checkDeps(over: Partial<StoreCheckDeps> = {}): StoreCheckDeps {
  return {
    repo: memoryStoreHealthRepo(),
    getCredentials: async () => ({ amazon: { affiliateTag: 'radardeofe00a-20' } }),
    saveNetshoesAdvertiserId: async () => {},
    meliLa: async () => ({ link: 'https://meli.la/x', unauthorized: false }),
    shopee: async () => ({ ok: true, shortLink: 'https://s.shopee.com.br/x' }),
    rakutenToken: async () => 'tok',
    findNetshoes: async () => '1',
    deepLink: async () => 'https://x',
    listUsers: async () => [],
    ...over,
  };
}

// #3 — vários usuários em paralelo dentro do prazo
test('#3 checagem diária roda usuários em paralelo e cabe no prazo', async () => {
  const users = Array.from({ length: 6 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${i}`);
  const d = checkDeps({
    listUsers: async () => users,
    getCredentials: async () => ({ mercadolivre: { affiliateTag: 't', userToken: 'ssid=1' } }),
    meliLa: async () => { await new Promise(r => setTimeout(r, 40)); return { link: 'https://meli.la/x', unauthorized: false }; },
  });
  const report = await runDailyStoreHealth({ deps: d, concurrency: 3, deadlineAt: Date.now() + 150 });
  assert.equal(report.checked, 6);
});

test('#3 ✅ antigo (mais de 26 h) aparece como teste atrasado', () => {
  const now = new Date('2026-11-14T15:00:00Z');
  const l = storeStatusLabel({ store: 'shopee', status: 'ok', reason: null, lastCheckedAt: '2026-11-13T10:00:00Z', hint: null }, now);
  assert.equal(l.emoji, '⚠️');
  assert.equal(l.title, 'Teste atrasado');
});

// #4 — falha ao gravar não derruba os outros usuários
test('#4 erro ao gravar a saúde de um usuário não impede os seguintes', async () => {
  const base = memoryStoreHealthRepo();
  const repo: StoreHealthRepo = {
    list: base.list,
    upsert: async (u, h) => { if (u.endsWith('1')) throw new Error('upsert falhou'); return base.upsert(u, h); },
  };
  const d = checkDeps({ repo, listUsers: async () => ['bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002'] });
  const report = await runDailyStoreHealth({ deps: d });
  assert.ok(report.checked >= 1);
  const map = await getStoreHealthMap('bbbbbbbb-bbbb-4bbb-8bbb-000000000002', base);
  assert.equal(map.amazon.status, 'sem_teste');
});

// #5 — quem já tinha loja aparece "ainda não testado", com botão
test('#5 loja com credencial e sem teste ainda aparece como "Ainda não testado"', async () => {
  const views = await getStoreStatusViews(CLIENT, {
    repo: memoryStoreHealthRepo(),
    getCredentials: async () => ({ mercadolivre: { affiliateTag: 'cliente', userToken: 'ssid=1' } }),
  });
  const ml = views.find(v => v.store === 'mercadolivre')!;
  assert.equal(ml.status, 'sem_teste');
  assert.deepEqual(storeStatusLabel(ml), { emoji: '🟡', title: 'Ainda não testado', detail: 'Clique em Testar agora' });
  assert.equal(views.find(v => v.store === 'shopee')!.status, 'nao_configurado');
});

// #6 — reconectar com dado errado não apaga a credencial boa
test('#6 dado lido errado não substitui a credencial que funcionava', async () => {
  const GOOD = 'GOODSECRETSHOPEEGOODSECRETSHOPEE';
  const BAD = 'BADSECRETSHOPEEBADSECRETSHOPEEXX';
  const vault: any = { shopee: { appId: '18398765432', appSecret: GOOD } };
  const repo = memoryStoreHealthRepo();
  const d: StoreConnectDeps = {
    repo,
    getCredentials: async () => JSON.parse(JSON.stringify(vault)),
    save: async (_u, input) => { vault[input.storeName] = { ...vault[input.storeName], ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) }; },
    check: async (u, store) => recordStoreHealth(u, store, vault.shopee.appSecret === GOOD
      ? { status: 'ok' } : { status: 'falhou', reason: 'AppID ou Senha da Shopee inválidos. Reconecte pela extensão.' }, repo),
  };
  const view = await connectStore(CLIENT, { store: 'shopee', appId: '18398765432', appSecret: BAD }, d);
  assert.equal(vault.shopee.appSecret, GOOD);
  assert.equal(view.status, 'ok');
  assert.match(view.notice || '', /mantive a conexão anterior/);
});

// #8 — teste da Shopee usa a página inicial e não confunde "invalid" com senha errada
test('#8 Shopee: erro genérico com "invalid" não vira "senha inválida"', async () => {
  assert.equal(SHOPEE_TEST_URL, 'https://shopee.com.br/');
  const h = await checkStoreConnection(CLIENT, 'shopee', checkDeps({
    getCredentials: async () => ({ shopee: { appId: '18398765432', appSecret: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ987654' } }),
    shopee: async () => ({ ok: false, shortLink: null, httpStatus: 200, errorMessage: 'invalid originUrl' }),
  }));
  assert.equal(h.status, 'falhou');
  assert.doesNotMatch(h.reason || '', /inválidos/);
});

test('#1 base global (db.stores) de outra conta ou sem dono não completa a conta de um cliente', async () => {
  const map = await getStoreCredentialsMapWithSecrets(CLIENT, [
    { id: 's', storeName: 'shopee', userId: '12121212-1212-4121-8121-121212121212', appId: '18311112222', affiliateTag: 'tagdeoutro', isActive: true } as any,
    { id: 'a', storeName: 'amazon', affiliateTag: 'legadosemdono-20', isActive: true } as any,
  ]);
  assert.equal(map.shopee, null);
  assert.equal(map.amazon, null);
});
