import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { NextRequest } from 'next/server';

const dbPath = path.join(os.tmpdir(), `radar_social_routes_${Date.now()}.json`);
process.env.RADAR_DB_PATH = dbPath;
process.env.REQUIRE_AUTH = 'true';
process.env.APP_URL = 'https://painel.test';
const originalFetch = global.fetch;
let calls: Array<{ url: string; body?: any }> = [];

test.after(() => {
  global.fetch = originalFetch;
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(`${dbPath}.social.json`, { force: true });
});

async function seed() {
  const imageFile = path.join(os.tmpdir(), `prod_routes_${Date.now()}.png`);
  await sharp({ create: { width: 400, height: 400, channels: 3, background: '#FFFFFF' } }).png().toFile(imageFile);
  const { getInitialDatabase } = await import('../src/lib/server/storage');
  const db = getInitialDatabase();
  const now = new Date().toISOString();
  const job = (id: string, userId: string) => ({ id, userId, originType: 'copiador', status: 'enviado', sentAt: now, createdAt: now, targetJid: '1@g.us',
    affiliateUrl: `https://s.shopee.com.br/${id}`, mediaUrl: imageFile, mediaType: 'image',
    messageText: `*Fone ${id}*\nDe: ~R$ 199,90~\n🔥 *Por R$ 99,90*\nhttps://s.shopee.com.br/${id}` });
  db.jobs = [job('jobA', 'userA'), job('jobB', 'userB')] as any;
  db.connections = [{ id: 'connA', userId: 'userA', instanceName: 'inst_a', baseUrl: 'https://gw.test', apiKey: 'k', status: 'connected', label: 'A', isDefault: true, createdAt: now, updatedAt: now }] as any;
  fs.writeFileSync(dbPath, JSON.stringify(db));
  fs.rmSync(`${dbPath}.social.json`, { force: true });
  const { setDevTestPlan } = await import('../src/lib/server/plan-guard');
  await setDevTestPlan('userA', 'plus', { ciclo: 'mensal' } as any);
  await setDevTestPlan('userB', 'impulse', { ciclo: 'mensal' } as any);
  calls = [];
  global.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (String(url).includes('/message/sendStatus/')) return new Response(JSON.stringify({ key: { id: 'STATUS123' } }), { status: 201 });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

async function request(route: 'publish' | 'offers', userId: string | null, body?: unknown) {
  const auth = await import('../src/lib/server/auth');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (userId) headers.cookie = `${auth.SESSION_COOKIE_NAME}=${auth.signSession({ userId, email: `${userId}@t.com`, role: 'user' })}`;
  const url = `https://painel.test/api/social/${route}`;
  if (route === 'offers') {
    const { GET } = await import('../src/app/api/social/offers/route');
    return GET(new NextRequest(url, { headers }));
  }
  const { POST } = await import('../src/app/api/social/publish/route');
  return POST(new NextRequest(url, { method: 'POST', headers, body: JSON.stringify(body) }));
}

test('sem login → 401', async () => {
  await seed();
  assert.equal((await request('offers', null)).status, 401);
  assert.equal((await request('publish', null, { jobId: 'jobA', channel: 'whatsapp_status' })).status, 401);
});

test('lista só as ofertas do próprio cliente, com a cota', async () => {
  await seed();
  const res = await request('offers', 'userA');
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(data.offers.map((o: any) => o.jobId), ['jobA']);
  assert.equal(data.quota.limit, 5);
});

test('publicar oferta de outro cliente → 404', async () => {
  await seed();
  const res = await request('publish', 'userA', { jobId: 'jobB', channel: 'whatsapp_status' });
  assert.equal(res.status, 404);
  assert.equal(calls.filter(c => c.url.includes('sendStatus')).length, 0);
});

test('plano Impulse não publica (403) e nada é enviado', async () => {
  await seed();
  const res = await request('publish', 'userB', { jobId: 'jobB', channel: 'instagram_story' });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /Plus/);
});

test('status do WhatsApp usa a conexão do próprio cliente e registra o número da oferta', async () => {
  await seed();
  const res = await request('publish', 'userA', { jobId: 'jobA', channel: 'whatsapp_status' });
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.equal(data.post.status, 'publicado');
  assert.equal(data.offer.offerNumber, 1);
  const call = calls.find(c => c.url.includes('/message/sendStatus/'))!;
  assert.equal(call.url, 'https://gw.test/message/sendStatus/inst_a');
  assert.equal(call.body.type, 'image');
  assert.match(call.body.caption, /Oferta #1/);
  assert.match(call.body.caption, /s\.shopee\.com\.br\/jobA/);
});

test('falha do Instagram fica registrada e não consome cota', async () => {
  await seed();
  const res = await request('publish', 'userA', { jobId: 'jobA', channel: 'instagram_feed' });
  const data = await res.json();
  assert.equal(res.status, 502);
  assert.equal(data.post.status, 'falha');
  const offers = await (await request('offers', 'userA')).json();
  assert.equal(offers.quota.usedToday, 0);
});

test('6ª publicação do dia no Plus → 429', async () => {
  await seed();
  for (let i = 0; i < 5; i++) assert.equal((await request('publish', 'userA', { jobId: 'jobA', channel: 'whatsapp_status' })).status, 200);
  const res = await request('publish', 'userA', { jobId: 'jobA', channel: 'whatsapp_status' });
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /Limite diário/);
});
