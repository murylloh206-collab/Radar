import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(os.tmpdir(), `radar_bio_${Date.now()}.json`);
process.env.RADAR_DB_PATH = dbPath;
test.after(() => { fs.rmSync(dbPath, { force: true }); fs.rmSync(`${dbPath}.social.json`, { force: true }); });

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();

function offer(userId: string, n: number, createdAt: string) {
  return { id: `${userId}-${n}`, userId, offerNumber: n, sourceJobId: `job-${userId}-${n}`, title: `Produto ${userId} ${n}`, store: 'shopee',
    imageUrl: 'https://cdn.test/x.jpg', priceCurrent: 50 + n, priceOriginal: 100, discountPct: 40, coupon: null,
    affiliateUrl: `https://s.shopee.com.br/${userId}${n}`, createdAt };
}
function post(userId: string, n: number, status = 'publicado') {
  return { id: `p-${userId}-${n}-${status}`, userId, socialOfferId: `${userId}-${n}`, channel: 'instagram_story', status, origin: 'manual', createdAt: hoursAgo(1) };
}

function seed() {
  fs.writeFileSync(`${dbPath}.social.json`, JSON.stringify({
    offers: [offer('userA', 1, hoursAgo(60)), offer('userA', 2, hoursAgo(2)), offer('userA', 3, hoursAgo(24 * 9)), offer('userA', 4, hoursAgo(1)), offer('userB', 1, hoursAgo(1))],
    posts: [post('userA', 1), post('userA', 2), post('userA', 3), post('userA', 4, 'falha'), post('userB', 1)],
    settings: {},
  }));
}

test('bio mostra só ofertas postadas com sucesso do próprio cliente, nos últimos 7 dias', async () => {
  seed();
  const { getBioOffers } = await import('../src/lib/server/social-posts');
  const view = await getBioOffers('userA');
  assert.deepEqual(view.offers.map(o => o.offerNumber), [2, 1]);
  assert.ok(view.offers.every(o => o.href.startsWith('/r/')), 'links passam pelo redirecionador rastreado');
});

test('oferta com mais de 48h tem aviso de disponibilidade', async () => {
  seed();
  const { getBioOffers } = await import('../src/lib/server/social-posts');
  const view = await getBioOffers('userA');
  assert.equal(view.offers.find(o => o.offerNumber === 1)!.stale, true);
  assert.equal(view.offers.find(o => o.offerNumber === 2)!.stale, false);
});

test('busca pelo número destaca a oferta; número inexistente avisa', async () => {
  seed();
  const { getBioOffers } = await import('../src/lib/server/social-posts');
  const found = await getBioOffers('userA', 2);
  assert.equal(found.highlighted?.offerNumber, 2);
  assert.equal(found.notFoundNumber, null);
  const missing = await getBioOffers('userA', 3); // tem mais de 7 dias
  assert.equal(missing.highlighted, null);
  assert.equal(missing.notFoundNumber, 3);
});

test('endereço da bio leva à loja certa; o endereço antigo continua sendo da conta dona', async () => {
  const { savePublicStorefrontConfig, resolveStorefrontUserId } = await import('../src/lib/server/public-storefront');
  const { ADMIN_UUID } = await import('../src/lib/server/auth');
  await savePublicStorefrontConfig('userB', { slug: 'baratinhosdaju' });
  assert.equal(await resolveStorefrontUserId('baratinhosdaju'), 'userB');
  assert.equal(await resolveStorefrontUserId('@BaratinhosDaJu'), 'userB');
  assert.equal(await resolveStorefrontUserId('radar-ofertas'), ADMIN_UUID);
  assert.equal(await resolveStorefrontUserId('nao-existe-xyz'), null);
});
