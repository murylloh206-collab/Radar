import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { NextRequest } from 'next/server';

// Banco local isolado: nenhum acesso ao Supabase real nem ao gateway real.
const tempDbPath = path.join(os.tmpdir(), `radar_reliability_routes_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
process.env.RADAR_DB_PATH = tempDbPath;

const originalFetch = global.fetch;
const originalEnv = { CRON_SECRET: process.env.CRON_SECRET, REQUIRE_AUTH: process.env.REQUIRE_AUTH };

async function routes() {
  const scheduled = await import('@/app/api/cron/process-scheduled/route');
  const trigger = await import('@/app/api/worker/trigger/route');
  const watchdog = await import('@/app/api/copier/watchdog/route');
  const auth = await import('@/lib/server/auth');
  return { scheduled, trigger, watchdog, auth };
}

test.beforeEach(() => {
  process.env.REQUIRE_AUTH = 'true';
  // Gateway simulado: qualquer chamada externa responde sem enviar nada real.
  global.fetch = (async () => new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 })) as typeof fetch;
});

test.afterEach(() => {
  global.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test.after(() => {
  try { if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath); } catch {}
});

test('process-scheduled sem cabeçalho → 401', async () => {
  process.env.CRON_SECRET = 's3';
  const { scheduled } = await routes();
  const res = await scheduled.POST(new NextRequest('http://localhost/api/cron/process-scheduled', { method: 'POST' }));
  assert.equal(res.status, 401);
});

test('process-scheduled com segredo na URL → 400', async () => {
  process.env.CRON_SECRET = 's3';
  const { scheduled } = await routes();
  const res = await scheduled.POST(new NextRequest('http://localhost/api/cron/process-scheduled?secret=s3', { method: 'POST' }));
  assert.equal(res.status, 400);
});

test('process-scheduled sem CRON_SECRET no servidor → 503', async () => {
  delete process.env.CRON_SECRET;
  const { scheduled } = await routes();
  const res = await scheduled.POST(new NextRequest('http://localhost/api/cron/process-scheduled', {
    method: 'POST', headers: { authorization: 'Bearer qualquer' },
  }));
  assert.equal(res.status, 503);
});

test('process-scheduled com Bearer correto é autorizado', async () => {
  process.env.CRON_SECRET = 's3';
  const { scheduled } = await routes();
  const res = await scheduled.POST(new NextRequest('http://localhost/api/cron/process-scheduled', {
    method: 'POST', headers: { authorization: 'Bearer s3' },
  }));
  assert.ok(![400, 401, 503].includes(res.status), `status inesperado ${res.status}`);
});

test('trigger não aceita o segredo antigo embutido no código', async () => {
  delete process.env.CRON_SECRET;
  const { trigger } = await routes();
  const res = await trigger.POST(new NextRequest('http://localhost/api/worker/trigger', {
    method: 'POST', headers: { authorization: 'Bearer radar_cron_secret_772819034' },
  }));
  assert.ok([401, 503].includes(res.status), `status inesperado ${res.status}`);
});

test('copier/watchdog sem sessão e sem cron → 401', async () => {
  process.env.CRON_SECRET = 's3';
  const { watchdog } = await routes();
  const res = await watchdog.POST(new NextRequest('http://localhost/api/copier/watchdog', { method: 'POST' }));
  assert.equal(res.status, 401);
});

test('copier/watchdog com sessão de usuário logado é autorizado', async () => {
  process.env.CRON_SECRET = 's3';
  const { watchdog, auth } = await routes();
  const token = auth.signSession({ userId: 'user_teste_1', email: 'u@teste.com', role: 'user' });
  const res = await watchdog.POST(new NextRequest('http://localhost/api/copier/watchdog', {
    method: 'POST', headers: { cookie: `${auth.SESSION_COOKIE_NAME}=${token}` },
  }));
  assert.notEqual(res.status, 401);
});
