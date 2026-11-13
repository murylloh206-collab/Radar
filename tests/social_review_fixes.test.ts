import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const dbPath = path.join(os.tmpdir(), `radar_social_fix_${Date.now()}.json`);
process.env.RADAR_DB_PATH = dbPath;
process.env.APP_URL = 'https://painel.test';
const originalFetch = global.fetch;
test.after(() => { global.fetch = originalFetch; fs.rmSync(dbPath, { force: true }); fs.rmSync(`${dbPath}.social.json`, { force: true }); });

// ---- C1: o endereço reservado é sempre da conta dona; endereços são exatos e únicos
test('endereço reservado radar-ofertas é sempre da conta dona, mesmo se um cliente salvou igual', async () => {
  const { savePublicStorefrontConfig, resolveStorefrontUserId, validateStorefrontSlug } = await import('../src/lib/server/public-storefront');
  const { ADMIN_UUID } = await import('../src/lib/server/auth');
  await savePublicStorefrontConfig('cliente-x', { slug: 'radar-ofertas' });
  assert.equal(await resolveStorefrontUserId('radar-ofertas'), ADMIN_UUID);
  assert.match((await validateStorefrontSlug('cliente-y', 'radar-ofertas')) || '', /reservado/i);
  await savePublicStorefrontConfig('cliente-z', { slug: 'loja_x' });
  assert.equal(await resolveStorefrontUserId('lojaAx'), null, 'sem curinga: _ não casa com outra letra');
  assert.match((await validateStorefrontSlug('cliente-w', 'loja_x')) || '', /uso/i);
  assert.equal(await validateStorefrontSlug('cliente-z', 'loja_x'), null, 'o próprio dono pode manter o endereço');
});

// ---- I2: layout não se sobrepõe com título de 3 linhas, preço original e cupom longo
test('layout do story e do feed não sobrepõe preço, cupom e rodapé', async () => {
  const { computeArtLayout } = await import('../src/lib/server/offer-art/render');
  const longTitle = 'Kit Completo de Panelas Antiaderentes Tramontina Paris com 10 Peças Revestimento Starflon Max Tampas de Vidro';
  for (const format of ['story', 'feed'] as const) {
    for (const coupon of [undefined, 'RADAR10', 'SUPERDESCONTO2026BLACKFRIDAYMEGA']) {
      const l = computeArtLayout({ format, title: longTitle, current: 1299.9, original: 2599.9, coupon });
      assert.ok(l.priceBottom < l.dividerY, `${format}/${coupon}: preço atravessa o rodapé`);
      if (l.coupon) {
        assert.ok(l.coupon.bottom < l.dividerY, `${format}/${coupon}: cupom invade o rodapé`);
        assert.ok(l.coupon.right <= 1080 - 72 + 1, `${format}/${coupon}: cupom sai da arte`);
      }
      assert.ok(l.footerY <= (format === 'story' ? 1920 - 200 : 1350 - 40), `${format}: rodapé fora da área segura`);
      assert.ok(l.stageH >= (format === 'story' ? 520 : 360), `${format}: foto pequena demais`);
    }
  }
});

// ---- I7: busca da foto
test('busca da foto recusa nome que resolve para IP interno e corta download sem tamanho declarado', async () => {
  const { fetchProductImage } = await import('../src/lib/server/offer-art/fetch-image');
  await assert.rejects(fetchProductImage('http://localtest.me/x.jpg', { lookup: async () => ['127.0.0.1'] }), /não permitido/i);
  global.fetch = (async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
  }), { status: 200 })) as typeof fetch;
  try {
    await assert.rejects(fetchProductImage('https://cdn.test/x.jpg', { lookup: async () => ['93.184.216.34'] }), /grande/i);
  } finally { global.fetch = originalFetch; }
});

test('redirecionamento para endereço interno é recusado', async () => {
  const { fetchProductImage } = await import('../src/lib/server/offer-art/fetch-image');
  global.fetch = (async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } })) as typeof fetch;
  try {
    await assert.rejects(fetchProductImage('https://cdn.test/x.jpg', { lookup: async (h: string) => h === 'cdn.test' ? ['93.184.216.34'] : ['169.254.169.254'] }), /não permitido/i);
  } finally { global.fetch = originalFetch; }
});

// ---- M9: contraste contra todas as faixas do fundo
test('textos legíveis em todo o fundo (topo, meio e base)', async () => {
  const { buildArtTheme, contrastRatio } = await import('../src/lib/server/offer-art/theme');
  for (const mode of ['dark', 'light'] as const) {
    for (const accent of ['#1CCAF2', '#FFFF66', '#FF7A1A', '#16A34A']) {
      const t = buildArtTheme(accent, mode);
      for (const stop of [t.background.top, t.background.mid, t.background.bottom]) {
        assert.ok(contrastRatio(t.accentText, stop) >= 3, `${mode} ${accent} destaque`);
        assert.ok(contrastRatio(t.textMuted, stop) >= 4.5, `${mode} ${accent} texto secundário`);
        assert.ok(contrastRatio(t.text, stop) >= 4.5, `${mode} ${accent} texto`);
      }
    }
  }
});

// ---- I3/I4/I5/I6: reserva atômica, oferta identificada pelo link, falhas não viram rajada
const minutesAgo = (m: number) => new Date(Date.now() - m * 60e3).toISOString();
async function seedSocial(jobs: Array<{ id: string; affiliate: string; minutes: number }>, plan = 'plus') {
  const image = path.join(os.tmpdir(), `fix_${Date.now()}.png`);
  await sharp({ create: { width: 200, height: 200, channels: 3, background: '#FFFFFF' } }).png().toFile(image);
  const { getInitialDatabase } = await import('../src/lib/server/storage');
  const db = getInitialDatabase();
  db.jobs = jobs.map(j => ({ id: j.id, userId: 'userA', originType: 'copiador', status: 'enviado', sentAt: minutesAgo(j.minutes), createdAt: minutesAgo(j.minutes),
    targetJid: '1@g.us', affiliateUrl: j.affiliate, mediaUrl: image, mediaType: 'image',
    socialOffer: { title: 'Fone Bluetooth JBL Tune', imageUrl: image, currentPrice: 99.9, originalPrice: 199.9, discountPct: 50.4 } })) as any;
  db.connections = [{ id: 'connA', userId: 'userA', instanceName: 'inst_a', baseUrl: 'https://gw.test', apiKey: 'k', status: 'connected', label: 'A', isDefault: true, createdAt: '', updatedAt: '' }] as any;
  fs.writeFileSync(dbPath, JSON.stringify(db));
  fs.writeFileSync(`${dbPath}.social.json`, JSON.stringify({ offers: [], posts: [], settings: { userA: { enabled: true, channels: ['whatsapp_status'], minIntervalMinutes: 15, windowStart: '00:00', windowEnd: '23:59', minDiscountPct: 10, connectionId: null } } }));
  const { setDevTestPlan } = await import('../src/lib/server/plan-guard');
  await setDevTestPlan('userA', plan as any, { ciclo: 'mensal' } as any);
}

test('publicações simultâneas não passam do limite diário do plano', async () => {
  await seedSocial([{ id: 'j1', affiliate: 'https://s.shopee.com.br/a', minutes: 5 }]);
  let calls = 0;
  global.fetch = (async (url: string) => {
    if (String(url).includes('sendStatus')) { calls++; await new Promise(r => setTimeout(r, 30)); return new Response(JSON.stringify({ key: { id: 'S' } }), { status: 201 }); }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  try {
    const { publishSocialPost } = await import('../src/lib/server/social-posts');
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => publishSocialPost('userA', { jobId: 'j1', channel: 'whatsapp_status' })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 5);
    assert.equal(calls, 5);
  } finally { global.fetch = originalFetch; }
});

test('a mesma oferta enviada a vários grupos tem um número só e não é repostada pelo automático', async () => {
  await seedSocial([{ id: 'j1', affiliate: 'https://s.shopee.com.br/a', minutes: 40 }, { id: 'j5', affiliate: 'https://s.shopee.com.br/a', minutes: 2 }]);
  let calls = 0;
  global.fetch = (async (url: string) => {
    if (String(url).includes('sendStatus')) { calls++; return new Response(JSON.stringify({ key: { id: 'S' } }), { status: 201 }); }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  try {
    const { ensureSocialOffer, publishSocialPost, runSocialAutopostCycle, readLocalSocial, writeLocalSocial } = await import('../src/lib/server/social-posts');
    assert.equal((await ensureSocialOffer('userA', 'j1')).offerNumber, (await ensureSocialOffer('userA', 'j5')).offerNumber);
    await publishSocialPost('userA', { jobId: 'j1', channel: 'whatsapp_status', origin: 'automatico' });
    // simula que o intervalo já passou
    const local = readLocalSocial();
    local.posts.forEach(p => { p.createdAt = minutesAgo(60); });
    writeLocalSocial(local);
    await runSocialAutopostCycle();
    assert.equal(calls, 1, 'oferta já postada (via outro grupo) não pode ser postada de novo');
  } finally { global.fetch = originalFetch; }
});

test('falha de publicação respeita o intervalo do automático (sem rajada)', async () => {
  await seedSocial([{ id: 'j1', affiliate: 'https://s.shopee.com.br/a', minutes: 5 }]);
  let calls = 0;
  global.fetch = (async (url: string) => {
    if (String(url).includes('sendStatus')) { calls++; return new Response('erro', { status: 500 }); }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  try {
    const { runSocialAutopostCycle } = await import('../src/lib/server/social-posts');
    await runSocialAutopostCycle();
    await runSocialAutopostCycle();
    await runSocialAutopostCycle();
    assert.equal(calls, 1);
  } finally { global.fetch = originalFetch; }
});

test('automático não começa uma publicação sem tempo suficiente', async () => {
  await seedSocial([{ id: 'j1', affiliate: 'https://s.shopee.com.br/a', minutes: 5 }]);
  let calls = 0;
  global.fetch = (async (url: string) => { if (String(url).includes('sendStatus')) calls++; return new Response(JSON.stringify({ key: { id: 'S' } }), { status: 201 }); }) as typeof fetch;
  try {
    const { runSocialAutopostCycle } = await import('../src/lib/server/social-posts');
    await runSocialAutopostCycle({ deadlineAt: Date.now() + 10000 });
    assert.equal(calls, 0);
  } finally { global.fetch = originalFetch; }
});
