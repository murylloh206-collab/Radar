import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { NextRequest } from 'next/server';

// ---- Achado 1: o middleware deve deixar o agendador chegar à rota (que valida o CRON_SECRET) ----
test('middleware deixa a chamada do agendador chegar em /api/cron/process-scheduled', async () => {
  const { middleware } = await import('../src/middleware');
  const res = await middleware(new NextRequest('https://painel.test/api/cron/process-scheduled', {
    method: 'POST', headers: { authorization: 'Bearer segredo-do-agendador' },
  }));
  assert.notEqual(res.status, 401);
  assert.equal(res.headers.get('x-middleware-next'), '1');
});

test('middleware continua bloqueando /api/copier/watchdog sem login', async () => {
  const saved = process.env.REQUIRE_AUTH;
  delete process.env.REQUIRE_AUTH;
  try {
    const { middleware } = await import('../src/middleware');
    const res = await middleware(new NextRequest('https://painel.test/api/copier/watchdog?restart=true', { method: 'POST' }));
    assert.equal(res.status, 401);
  } finally {
    if (saved !== undefined) process.env.REQUIRE_AUTH = saved;
  }
});

// ---- Achados 2 e 3: watchdog em paralelo, com orçamento de tempo, e reinício só da conexão escolhida ----
function setupConnections() {
  const dbPath = path.join(os.tmpdir(), `radar_review_fixes_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  process.env.RADAR_DB_PATH = dbPath;
  return dbPath;
}
async function writeConnections(dbPath: string, instances: string[]) {
  const { getInitialDatabase } = await import('../src/lib/server/storage');
  const initial = getInitialDatabase();
  const base = { baseUrl: 'https://gw.exemplo.test', apiKey: 'k', status: 'connected', isDefault: false, createdAt: '', updatedAt: '', label: 'x', userId: 'u1' };
  initial.connections = instances.map((instanceName, i) => ({ ...base, id: `c${i + 1}`, instanceName })) as any;
  fs.writeFileSync(dbPath, JSON.stringify(initial));
}

test('"Reviver conexão" reinicia só a conexão selecionada', async () => {
  const dbPath = setupConnections();
  await writeConnections(dbPath, ['inst_um', 'inst_dois']);
  const called: string[] = [];
  const originalFetch = global.fetch;
  global.fetch = (async (url: string) => {
    called.push(String(url));
    return new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 });
  }) as typeof fetch;
  try {
    const { runCopierWatchdog } = await import('../src/lib/server/copier-watchdog');
    const report = await runCopierWatchdog(true, { userId: 'u1', connectionId: 'c1' });
    assert.ok(called.some(u => u.includes('/restart/inst_um')));
    assert.ok(!called.some(u => u.includes('inst_dois')), 'não deve tocar na outra conexão');
    assert.equal(report.connections.length, 1);
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(dbPath, { force: true });
  }
});

test('watchdog verifica conexões em paralelo e respeita o orçamento de tempo', { timeout: 5000 }, async () => {
  const dbPath = setupConnections();
  await writeConnections(dbPath, ['inst_lenta', 'inst_rapida']);
  const originalFetch = global.fetch;
  global.fetch = ((url: string) => {
    if (String(url).includes('inst_lenta')) return new Promise(() => {}); // gateway que nunca responde
    return Promise.resolve(new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 }));
  }) as typeof fetch;
  try {
    const { runCopierWatchdog } = await import('../src/lib/server/copier-watchdog');
    const started = Date.now();
    const report = await runCopierWatchdog(false, { userId: 'u1', budgetMs: 300 });
    assert.ok(Date.now() - started < 2000, `demorou ${Date.now() - started}ms`);
    const slow = report.connections.find(c => c.instanceName === 'inst_lenta');
    const fast = report.connections.find(c => c.instanceName === 'inst_rapida');
    assert.match(slow?.error || '', /tempo/i);
    assert.equal(fast?.state, 'open');
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(dbPath, { force: true });
  }
});

// ---- Achado 4: link reescrito pelo montador da mensagem não pode ser tratado como "sem link" ----
test('link com lp=aff/src removidos pelo montador continua reconhecido', async () => {
  const { checkOfferContent } = await import('../src/lib/server/offer-content-guard');
  const { stripChannelSrcParam } = await import('../src/lib/offer-format');
  const display = 'https://shopee.com.br/produto-i.1.2?lp=aff&src=whatsapp';
  const text = `*Tênis Nike Flex*\n🔥 *Por R$ 99,90*\n${stripChannelSrcParam(display)}`;
  assert.deepEqual(checkOfferContent({ messageText: text, displayUrl: display, title: 'Tênis Nike Flex' }), { ok: true });
});

// ---- Achado 5: títulos reais com "Imagem"/"Logo" não são lixo ----
test('títulos reais com Imagem, Logo ou Image não são considerados inválidos', async () => {
  const { isJunkProductTitle } = await import('../src/lib/server/offer-content-guard');
  for (const real of ['Smart TV 55 4K Imagem Dolby', 'Camiseta Polo Logo Bordado', 'Câmera Image Stabilizer 4K', 'Lego Icons Buquê de Flores']) {
    assert.equal(isJunkProductTitle(real), false, real);
  }
  for (const junk of ['Shopping Cart Icon', 'Ícone', 'Logo', 'carrinho de compras', 'Image']) {
    assert.equal(isJunkProductTitle(junk), true, junk);
  }
});

// ---- Achado 6: preço ----
test('preço com dois espaços após R$ é aceito', async () => {
  const { checkOfferContent } = await import('../src/lib/server/offer-content-guard');
  assert.deepEqual(checkOfferContent({ messageText: '*Tênis*\n🔥 *Por R$  99,90*\nhttps://s.shopee.com.br/x' }), { ok: true });
});

test('oferta sem preço do produto é bloqueada mesmo com valor de cupom no texto', async () => {
  const { checkOfferContent } = await import('../src/lib/server/offer-content-guard');
  const result = checkOfferContent({ messageText: '*Tênis*\n🎟️ Cupom R$ 20 OFF\nhttps://s.shopee.com.br/x', currentPrice: undefined });
  assert.equal(result.ok, false);
});

// ---- Achado 7: as três esperas (20s, 60s, 180s) precisam realmente acontecer ----
test('Connection Closed permite 3 reenvios antes de desistir', async () => {
  const { shouldRetryConnectionClosed } = await import('../src/lib/server/copier-runtime');
  assert.equal(shouldRetryConnectionClosed(1), true);
  assert.equal(shouldRetryConnectionClosed(2), true);
  assert.equal(shouldRetryConnectionClosed(3), true);
  assert.equal(shouldRetryConnectionClosed(4), false);
});

// ---- Achado 8: limite diário do worker local também em Brasília ----
test('worker local usa a contagem de Brasília e só do próprio usuário', () => {
  const content = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'lib', 'server', 'worker-engine.ts'), 'utf-8');
  assert.ok(!content.includes("now.toISOString().split('T')[0]"), 'ainda conta pelo dia UTC');
  assert.match(content, /isSentToday/);
  assert.ok(!content.includes('now.getHours()'), 'pausa noturna ainda usa o relógio do servidor');
});
