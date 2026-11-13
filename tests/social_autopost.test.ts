import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const dbPath = path.join(os.tmpdir(), `radar_autopost_${Date.now()}.json`);
process.env.RADAR_DB_PATH = dbPath;
process.env.APP_URL = 'https://painel.test';
const originalFetch = global.fetch;
let statusCalls = 0;
test.after(() => { global.fetch = originalFetch; fs.rmSync(dbPath, { force: true }); fs.rmSync(`${dbPath}.social.json`, { force: true }); });

const minutesAgo = (m: number) => new Date(Date.now() - m * 60e3).toISOString();

async function seed(opts: { discount?: number; settings?: Record<string, unknown>; lastPostMinutesAgo?: number } = {}) {
  const image = path.join(os.tmpdir(), `auto_${Date.now()}.png`);
  await sharp({ create: { width: 300, height: 300, channels: 3, background: '#FFFFFF' } }).png().toFile(image);
  const { getInitialDatabase } = await import('../src/lib/server/storage');
  const db = getInitialDatabase();
  const original = 100;
  const current = original * (1 - (opts.discount ?? 50) / 100);
  db.jobs = [{ id: 'job1', userId: 'userA', originType: 'copiador', status: 'enviado', sentAt: minutesAgo(5), createdAt: minutesAgo(5), targetJid: '1@g.us',
    affiliateUrl: 'https://s.shopee.com.br/job1', mediaUrl: image, mediaType: 'image',
    socialOffer: { title: 'Fone Bluetooth JBL', imageUrl: image, currentPrice: current, originalPrice: original, discountPct: opts.discount ?? 50 } }] as any;
  db.connections = [{ id: 'connA', userId: 'userA', instanceName: 'inst_a', baseUrl: 'https://gw.test', apiKey: 'k', status: 'connected', label: 'A', isDefault: true, createdAt: '', updatedAt: '' }] as any;
  fs.writeFileSync(dbPath, JSON.stringify(db));
  const social: any = { offers: [], posts: [], settings: { userA: { enabled: true, channels: ['whatsapp_status'], minIntervalMinutes: 60, windowStart: '00:00', windowEnd: '23:59', minDiscountPct: 30, connectionId: null, ...opts.settings } } };
  if (opts.lastPostMinutesAgo !== undefined) {
    social.offers.push({ id: 'old', userId: 'userA', offerNumber: 1, sourceJobId: 'antigo', title: 'x', priceCurrent: 1, affiliateUrl: 'x', createdAt: minutesAgo(opts.lastPostMinutesAgo) });
    social.posts.push({ id: 'p0', userId: 'userA', socialOfferId: 'old', channel: 'whatsapp_status', status: 'publicado', origin: 'automatico', createdAt: minutesAgo(opts.lastPostMinutesAgo) });
  }
  fs.writeFileSync(`${dbPath}.social.json`, JSON.stringify(social));
  const { setDevTestPlan } = await import('../src/lib/server/plan-guard');
  await setDevTestPlan('userA', 'plus', { ciclo: 'mensal' } as any);
  statusCalls = 0;
  global.fetch = (async (url: string) => {
    if (String(url).includes('/message/sendStatus/')) { statusCalls++; return new Response(JSON.stringify({ key: { id: 'S1' } }), { status: 201 }); }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

test('desligado: não publica nada', async () => {
  await seed({ settings: { enabled: false } });
  const { runSocialAutopostCycle } = await import('../src/lib/server/social-posts');
  const report = await runSocialAutopostCycle();
  assert.equal(statusCalls, 0);
  assert.equal(report.published, 0);
});

test('fora do horário configurado: não publica', async () => {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(now));
  const start = `${String((hour + 2) % 24).padStart(2, '0')}:00`;
  const end = `${String((hour + 3) % 24).padStart(2, '0')}:00`;
  await seed({ settings: { windowStart: start, windowEnd: end } });
  const { runSocialAutopostCycle } = await import('../src/lib/server/social-posts');
  await runSocialAutopostCycle();
  assert.equal(statusCalls, 0);
});

test('respeita o intervalo mínimo desde o último post', async () => {
  await seed({ lastPostMinutesAgo: 20 });
  const { runSocialAutopostCycle } = await import('../src/lib/server/social-posts');
  await runSocialAutopostCycle();
  assert.equal(statusCalls, 0);
});

test('ignora oferta com desconto abaixo do mínimo', async () => {
  await seed({ discount: 10 });
  const { runSocialAutopostCycle } = await import('../src/lib/server/social-posts');
  await runSocialAutopostCycle();
  assert.equal(statusCalls, 0);
});

test('oferta boa dentro das regras: publica uma vez e não repete', async () => {
  await seed({ lastPostMinutesAgo: 90 });
  const { runSocialAutopostCycle } = await import('../src/lib/server/social-posts');
  const first = await runSocialAutopostCycle();
  assert.equal(statusCalls, 1);
  assert.equal(first.published, 1);
  await runSocialAutopostCycle();
  assert.equal(statusCalls, 1, 'mesma oferta não é postada de novo (e o intervalo ainda não passou)');
});

test('erro inesperado em um cliente não derruba o ciclo', async () => {
  await seed();
  global.fetch = (async () => { throw new Error('gateway fora do ar'); }) as typeof fetch;
  const { runSocialAutopostCycle } = await import('../src/lib/server/social-posts');
  const report = await runSocialAutopostCycle();
  assert.equal(report.published, 0);
  assert.ok(report.errors >= 0);
});
