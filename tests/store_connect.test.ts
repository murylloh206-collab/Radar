import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { connectStore, getStoreStatusViews, ConnectError, type StoreConnectDeps } from '../src/lib/server/store-connect';
import { memoryStoreHealthRepo, recordStoreHealth } from '../src/lib/server/store-health';
import type { StoreName } from '../src/lib/types';

const U = '88888888-8888-4888-8888-888888888888';

function deps(initial: Record<string, any> = {}): StoreConnectDeps & { vault: Record<string, any> } {
  const vault: Record<string, any> = { ...initial };
  const repo = memoryStoreHealthRepo();
  return {
    vault,
    repo,
    async getCredentials() { return vault; },
    async save(_u, input) {
      const key = input.storeName as string;
      const prev = vault[key] || {};
      const next = { ...prev };
      for (const [k, v] of Object.entries(input)) if (v !== undefined) next[k] = v;
      vault[key] = next;
    },
    async check(userId, store: StoreName) {
      const c = vault[store] || {};
      if (store === 'netshoes') {
        if (!c.appId || !c.appSecret) return recordStoreHealth(userId, store, { status: 'falhou', reason: 'Falta abrir a página de desenvolvedor (Client ID/Secret) e conectar pela extensão.' }, repo);
        if (!c.affiliateTag) return recordStoreHealth(userId, store, { status: 'falhou', reason: 'Falta abrir a página do publisher (SID) e conectar pela extensão.' }, repo);
      }
      return recordStoreHealth(userId, store, { status: store === 'amazon' ? 'sem_teste' : 'ok' }, repo);
    },
  };
}

test('Rakuten conectada em duas páginas chega a ok; só com o SID diz o que falta', async () => {
  const d = deps();
  const partial = await connectStore(U, { store: 'rakuten', sid: '3846201' }, d);
  assert.equal(partial.store, 'netshoes');
  assert.equal(partial.status, 'falhou');
  assert.match(partial.reason || '', /página de desenvolvedor/);
  const full = await connectStore(U, { store: 'rakuten', clientId: 'K8p3Qz9vWm2Lx7RdK8p3Qz9vWm2Lx7Rd', clientSecret: 'H4n8Tq2Zx6BvH4n8Tq2Zx6BvH4n8Tq2Z' }, d);
  assert.equal(full.status, 'ok');
  assert.equal(d.vault.netshoes.affiliateTag, '3846201');
  assert.equal(d.vault.netshoes.appId, 'K8p3Qz9vWm2Lx7RdK8p3Qz9vWm2Lx7Rd');
});

test('Shopee e Amazon salvam e testam; Amazon fica em sem_teste', async () => {
  const d = deps();
  assert.equal((await connectStore(U, { store: 'shopee', appId: '18398765432', appSecret: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ987654' }, d)).status, 'ok');
  assert.equal((await connectStore(U, { store: 'amazon', tag: 'radardeofe00a-20' }, d)).status, 'sem_teste');
});

test('dados em formato inválido são recusados com ConnectError 400', async () => {
  const d = deps();
  await assert.rejects(connectStore(U, { store: 'amazon', tag: 'minha tag' }, d), (e: any) => e instanceof ConnectError && e.status === 400);
  await assert.rejects(connectStore(U, { store: 'rakuten', sid: 'abc' }, d), ConnectError);
  await assert.rejects(connectStore(U, { store: 'shopee', appId: '1', appSecret: 'x' }, d), ConnectError);
  await assert.rejects(connectStore(U, { store: 'mercadolivre', cookies: 'sem sessao' }, d), ConnectError);
});

test('Mercado Livre sem etiqueta salva e sem etiqueta enviada pede a etiqueta', async () => {
  await assert.rejects(connectStore(U, { store: 'mercadolivre', cookies: 'ssid=abc; _csrf=x' }, deps()), /etiqueta/);
  const d = deps({ mercadolivre: { affiliateTag: 'michelhenrique1' } });
  assert.equal((await connectStore(U, { store: 'mercadolivre', cookies: 'ssid=abc; _csrf=x' }, d)).status, 'ok');
  assert.equal(d.vault.mercadolivre.userToken, 'ssid=abc; _csrf=x');
});

test('a resposta de status nunca contém segredos', async () => {
  const secrets = ['ssid=SEGREDOCOOKIE999', 'H4n8Tq2Zx6BvSEGREDORAKUTEN000000', 'SHOPEESEGREDO1234567890ABCDEFGHI'];
  const d = deps({
    mercadolivre: { affiliateTag: 'michelhenrique1', userToken: secrets[0] },
    netshoes: { appId: 'ClientIdPublico01', appSecret: secrets[1], affiliateTag: '3846201' },
    shopee: { appId: '18398765432', appSecret: secrets[2] },
  });
  const views = await getStoreStatusViews(U, d);
  const json = JSON.stringify(views);
  for (const s of secrets) assert.ok(!json.includes(s), `vazou ${s.slice(0, 6)}…`);
  assert.deepEqual(views.map(v => v.store).sort(), ['amazon', 'mercadolivre', 'netshoes', 'shopee']);
});

test('rota de conexão do Mercado Livre recusa quem não está logado nem pareado', async () => {
  const { POST } = await import('../src/app/api/integrations/mercadolivre/connect/route');
  const res = await POST(new NextRequest('http://localhost/api/integrations/mercadolivre/connect', {
    method: 'POST', body: JSON.stringify({ cookies: 'ssid=abc' }), headers: { 'content-type': 'application/json' },
  }));
  assert.equal(res.status, 401);
});

test('rotas da extensão recusam sem token com código EXTENSION_UNPAIRED', async () => {
  const { POST } = await import('../src/app/api/extension/connect/route');
  const res = await POST(new NextRequest('http://localhost/api/extension/connect', { method: 'POST', body: '{}' }));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, 'EXTENSION_UNPAIRED');
});

test('loja desativada no cofre aparece como não configurada no status', async () => {
  const views = await getStoreStatusViews(U, { repo: memoryStoreHealthRepo(), getCredentials: async () => ({ amazon: { affiliateTag: 'radar-20', isActive: false } }) });
  assert.equal(views.find(v => v.store === 'amazon')!.status, 'nao_configurado');
});
