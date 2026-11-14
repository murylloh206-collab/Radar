import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(os.tmpdir(), `radar_social_service_${Date.now()}.json`);
process.env.RADAR_DB_PATH = dbPath;
test.after(() => { fs.rmSync(dbPath, { force: true }); fs.rmSync(`${dbPath}.social.json`, { force: true }); });

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();

function job(id: string, userId: string, over: Record<string, unknown> = {}) {
  return {
    id, userId, originType: 'copiador', status: 'enviado', sentAt: hoursAgo(1), createdAt: hoursAgo(1),
    targetJid: '1203@g.us', affiliateUrl: `https://s.shopee.com.br/${id}`, mediaUrl: `https://cdn.test/${id}-marcadagua.jpg`, mediaType: 'image',
    messageText: `OFERTA DO DIA! 🔥\n\n*Fone Bluetooth ${id}*\n\nDe: ~R$ 199,90~\n🔥 *Por R$ 99,90* (50% OFF)\n🎟️ Cupom: *FONE10*\n\n🛒 *Compre aqui:*\nhttps://s.shopee.com.br/${id}`,
    ...over,
  };
}

async function seed(jobs: unknown[], plans: Record<string, string> = {}) {
  const { getInitialDatabase } = await import('../src/lib/server/storage');
  const db = getInitialDatabase();
  db.jobs = jobs as any;
  fs.writeFileSync(dbPath, JSON.stringify(db));
  fs.rmSync(`${dbPath}.social.json`, { force: true });
  const { setDevTestPlan } = await import('../src/lib/server/plan-guard');
  for (const [user, plan] of Object.entries(plans)) await setDevTestPlan(user, plan as any, { ciclo: 'mensal' } as any);
}

test('só ofertas do próprio cliente, enviadas pelo copiador nas últimas 48h, sem repetir', async () => {
  await seed([
    job('a1', 'userA'),
    job('a1-grupo2', 'userA', { affiliateUrl: 'https://s.shopee.com.br/a1', sentAt: hoursAgo(1.5) }), // mesma oferta em outro grupo
    job('a2', 'userA', { sentAt: hoursAgo(50) }), // velha demais
    job('a3', 'userA', { originType: 'fila' }), // não é do copiador
    job('a4', 'userA', { status: 'falha' }),
    job('b1', 'userB'),
  ]);
  const { listEligibleOffers } = await import('../src/lib/server/social-posts');
  const offers = await listEligibleOffers('userA');
  assert.deepEqual(offers.map(o => o.jobId), ['a1']);
  assert.equal(offers[0].title, 'Fone Bluetooth a1');
  assert.equal(offers[0].priceCurrent, 99.9);
  assert.equal(offers[0].priceOriginal, 199.9);
  assert.equal(offers[0].coupon, 'FONE10');
});

test('resumo estruturado do copiador tem prioridade (foto limpa, sem marca d\'água)', async () => {
  await seed([job('s1', 'userA', { socialOffer: { title: 'Air Fryer Mondial 4L', imageUrl: 'https://cdn.test/limpa.jpg', currentPrice: 279.9, originalPrice: 399.9, discountPct: 30, coupon: null, store: 'mercadolivre' } })]);
  const { listEligibleOffers } = await import('../src/lib/server/social-posts');
  const [offer] = await listEligibleOffers('userA');
  assert.equal(offer.title, 'Air Fryer Mondial 4L');
  assert.equal(offer.imageUrl, 'https://cdn.test/limpa.jpg');
  assert.equal(offer.priceCurrent, 279.9);
});

test('número da oferta é sequencial por cliente e não se repete para a mesma oferta', async () => {
  await seed([job('a1', 'userA'), job('a2', 'userA'), job('b1', 'userB')]);
  const { ensureSocialOffer } = await import('../src/lib/server/social-posts');
  assert.equal((await ensureSocialOffer('userA', 'a1')).offerNumber, 1);
  assert.equal((await ensureSocialOffer('userA', 'a2')).offerNumber, 2);
  assert.equal((await ensureSocialOffer('userA', 'a1')).offerNumber, 1);
  assert.equal((await ensureSocialOffer('userB', 'b1')).offerNumber, 1);
});

test('cliente não registra oferta de outro cliente', async () => {
  await seed([job('b1', 'userB')]);
  const { ensureSocialOffer } = await import('../src/lib/server/social-posts');
  await assert.rejects(ensureSocialOffer('userA', 'b1'), /não encontrada/i);
});

test('cota diária: Impulse bloqueado, Plus 5 por dia, Ultimate ilimitado', async () => {
  await seed([job('a1', 'userImpulse'), job('p1', 'userPlus'), job('u1', 'userUlt')], { userImpulse: 'impulse', userPlus: 'plus', userUlt: 'ultimate' });
  const { getSocialQuota, ensureSocialOffer, recordSocialPost } = await import('../src/lib/server/social-posts');
  const impulse = await getSocialQuota('userImpulse');
  assert.equal(impulse.allowed, false);
  assert.match(impulse.reason || '', /Plus/);

  const plusOffer = await ensureSocialOffer('userPlus', 'p1');
  for (let i = 0; i < 5; i++) await recordSocialPost('userPlus', { socialOfferId: plusOffer.id, channel: 'instagram_story', status: 'publicado', origin: 'manual' });
  const plus = await getSocialQuota('userPlus');
  assert.deepEqual([plus.limit, plus.usedToday, plus.allowed], [5, 5, false]);

  const ultOffer = await ensureSocialOffer('userUlt', 'u1');
  for (let i = 0; i < 30; i++) await recordSocialPost('userUlt', { socialOfferId: ultOffer.id, channel: 'instagram_feed', status: 'publicado', origin: 'manual' });
  const ult = await getSocialQuota('userUlt');
  assert.deepEqual([ult.limit, ult.allowed], [null, true]);
});

test('post com falha não consome a cota', async () => {
  await seed([job('p1', 'userPlus')], { userPlus: 'plus' });
  const { getSocialQuota, ensureSocialOffer, recordSocialPost } = await import('../src/lib/server/social-posts');
  const offer = await ensureSocialOffer('userPlus', 'p1');
  for (let i = 0; i < 6; i++) await recordSocialPost('userPlus', { socialOfferId: offer.id, channel: 'instagram_story', status: 'falha', origin: 'manual', error: 'x' });
  assert.equal((await getSocialQuota('userPlus')).usedToday, 0);
});
