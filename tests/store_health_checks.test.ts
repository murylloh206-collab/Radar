import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { checkStoreConnection, runDailyStoreHealth, type StoreCheckDeps } from '../src/lib/server/store-health-checks';
import { memoryStoreHealthRepo, getStoreHealthMap } from '../src/lib/server/store-health';
import { RakutenAuthError } from '../src/lib/server/rakuten-auth';

const U = '55555555-5555-4555-8555-555555555555';
const ML = { appId: '77625408', affiliateTag: 'michelhenrique1', userToken: 'ssid=a; _csrf=b' };
const SHOPEE = { appId: '18312345678', appSecret: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456' };
const RAKUTEN = { appId: 'cid', appSecret: 'csecret', affiliateTag: '3846201', sessionData: { netshoesAdvertiserId: '43984' } };

function deps(over: Partial<StoreCheckDeps> = {}, creds: any = {}): StoreCheckDeps {
  const saved: string[] = [];
  return {
    repo: memoryStoreHealthRepo(),
    getCredentials: async () => creds,
    saveNetshoesAdvertiserId: async (_u, id) => { saved.push(id); },
    meliLa: async () => ({ link: 'https://meli.la/x', unauthorized: false }),
    shopee: async () => ({ ok: true, shortLink: 'https://s.shopee.com.br/x' }),
    rakutenToken: async () => 'tok',
    findNetshoes: async () => '43984',
    deepLink: async () => 'https://click.linksynergy.com/link?id=x',
    listUsers: async () => [U],
    ...over,
  };
}

test('Mercado Livre: meli.la gerado → ok; sessão recusada → falhou com motivo; sem credencial → nao_configurado', async () => {
  assert.equal((await checkStoreConnection(U, 'mercadolivre', deps({}, { mercadolivre: ML }))).status, 'ok');
  const f = await checkStoreConnection(U, 'mercadolivre', deps({ meliLa: async () => ({ link: null, unauthorized: true }) }, { mercadolivre: ML }));
  assert.equal(f.status, 'falhou');
  assert.equal(f.reason, 'Sessão do Mercado Livre expirou. Reconecte pela extensão.');
  assert.equal((await checkStoreConnection(U, 'mercadolivre', deps({}, {}))).status, 'nao_configurado');
});

test('Shopee: link curto gerado → ok; recusa de autenticação → falhou pedindo reconexão', async () => {
  assert.equal((await checkStoreConnection(U, 'shopee', deps({}, { shopee: SHOPEE }))).status, 'ok');
  const f = await checkStoreConnection(U, 'shopee', deps({ shopee: async () => ({ ok: false, shortLink: null, httpStatus: 401, errorMessage: 'Invalid Signature' }) }, { shopee: SHOPEE }));
  assert.equal(f.status, 'falhou');
  assert.equal(f.reason, 'AppID ou Senha da Shopee inválidos. Reconecte pela extensão.');
});

test('Rakuten/Netshoes: ok com deep link; credencial inválida → falhou; parcial → falhou dizendo o que falta', async () => {
  assert.equal((await checkStoreConnection(U, 'netshoes', deps({}, { netshoes: RAKUTEN }))).status, 'ok');
  const bad = await checkStoreConnection(U, 'netshoes', deps({ rakutenToken: async () => { throw new RakutenAuthError('Client ID, Client Secret ou SID da Rakuten inválidos.', 'credenciais_invalidas'); } }, { netshoes: RAKUTEN }));
  assert.equal(bad.status, 'falhou');
  assert.equal(bad.reason, 'Client ID, Client Secret ou SID da Rakuten inválidos.');
  const partial = await checkStoreConnection(U, 'netshoes', deps({}, { netshoes: { affiliateTag: '3846201' } }));
  assert.equal(partial.status, 'falhou');
  assert.match(partial.reason || '', /Falta abrir a página de desenvolvedor/);
});

test('Rakuten: código da Netshoes novo é salvo no cofre', async () => {
  const saved: string[] = [];
  const d = deps({ findNetshoes: async () => '99999', saveNetshoesAdvertiserId: async (_u, id) => { saved.push(id); } }, { netshoes: RAKUTEN });
  assert.equal((await checkStoreConnection(U, 'netshoes', d)).status, 'ok');
  assert.deepEqual(saved, ['99999']);
});

test('Amazon: tag válida → sem_teste; inválida → falhou; ausente → nao_configurado', async () => {
  const ok = await checkStoreConnection(U, 'amazon', deps({}, { amazon: { affiliateTag: 'radardeofe00a-20' } }));
  assert.equal(ok.status, 'sem_teste');
  assert.equal((await checkStoreConnection(U, 'amazon', deps({}, { amazon: { affiliateTag: 'minha tag' } }))).status, 'falhou');
  assert.equal((await checkStoreConnection(U, 'amazon', deps({}, {}))).status, 'nao_configurado');
});

test('checagem diária: uma loja lança erro e outra trava, as demais gravam resultado', async () => {
  const d = deps({
    meliLa: async () => { throw new Error('boom'); },
    shopee: () => new Promise(() => {}),
  }, { mercadolivre: ML, shopee: SHOPEE, netshoes: RAKUTEN, amazon: { affiliateTag: 'radardeofe00a-20' } });
  const report = await runDailyStoreHealth({ perStoreTimeoutMs: 50, deps: d });
  assert.equal(report.checked, 4);
  assert.equal(report.failed, 2);
  const map = await getStoreHealthMap(U, d.repo);
  assert.equal(map.netshoes.status, 'ok');
  assert.equal(map.amazon.status, 'sem_teste');
  assert.equal(map.shopee.status, 'falhou');
  assert.equal(map.mercadolivre.status, 'falhou');
});

test('rota diária recusa chamada sem o segredo do agendador', async () => {
  process.env.CRON_SECRET = 'segredo-de-teste';
  const { POST } = await import('../src/app/api/cron/store-health/route');
  const res = await POST(new NextRequest('http://localhost/api/cron/store-health', { method: 'POST' }));
  assert.equal(res.status, 401);
});

test('credencial desativada ou revogada conta como "não configurado" (não mostra 🟡/✅ falso)', async () => {
  const off = { affiliateTag: 'radar-20', isActive: false };
  assert.equal((await checkStoreConnection(U, 'amazon', deps({}, { amazon: off }))).status, 'nao_configurado');
  assert.equal((await checkStoreConnection(U, 'mercadolivre', deps({}, { mercadolivre: { ...ML, isActive: false } }))).status, 'nao_configurado');
});
