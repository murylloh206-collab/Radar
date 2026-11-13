import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJobForDispatch } from '../src/lib/server/job-validator';
import type { PublicationJob } from '../src/lib/types';

const goodText = '*Tênis Nike Flex*\n\n🔥 *Por R$ 99,90* (30% OFF)\n\n🛒 *Compre aqui:*\nhttps://s.shopee.com.br/abc123';

test('título "Shopping Cart Icon" é reconhecido como título inválido', async () => {
  const { isJunkProductTitle } = await import('../src/lib/server/offer-content-guard');
  assert.equal(isJunkProductTitle('Shopping Cart Icon'), true);
  assert.equal(isJunkProductTitle(''), true);
  assert.equal(isJunkProductTitle(undefined), true);
  assert.equal(isJunkProductTitle('Kit 10 Cuecas Boxer Lisa Polo Wear'), false);
});

test('mensagem completa (título, preço e link exibido) é aprovada', async () => {
  const { checkOfferContent } = await import('../src/lib/server/offer-content-guard');
  assert.deepEqual(checkOfferContent({ messageText: goodText, displayUrl: 'https://s.shopee.com.br/abc123', title: 'Tênis Nike Flex' }), { ok: true });
});

test('template sem {link} gera mensagem sem link e é bloqueada', async () => {
  const { checkOfferContent } = await import('../src/lib/server/offer-content-guard');
  const result = checkOfferContent({ messageText: '*Tênis Nike Flex*\n🔥 *Por R$ 99,90*\n\n🛒 *Compre aqui:*\n', displayUrl: 'https://s.shopee.com.br/abc123', title: 'Tênis Nike Flex' });
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /link/i);
});

test('link exibido diferente do convertido é bloqueado', async () => {
  const { checkOfferContent } = await import('../src/lib/server/offer-content-guard');
  const result = checkOfferContent({ messageText: goodText, displayUrl: 'https://meli.la/OUTRO', title: 'Tênis Nike Flex' });
  assert.equal(result.ok, false);
});

test('preço vazio ("Por *") é bloqueado', async () => {
  const { checkOfferContent } = await import('../src/lib/server/offer-content-guard');
  const result = checkOfferContent({ messageText: '*Tênis Nike Flex*\n🔥 *Por * \nhttps://s.shopee.com.br/abc123', title: 'Tênis Nike Flex' });
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /preço/i);
});

test('título lixo é bloqueado', async () => {
  const { checkOfferContent } = await import('../src/lib/server/offer-content-guard');
  const result = checkOfferContent({ messageText: goodText, title: 'Shopping Cart Icon' });
  assert.equal(result.ok, false);
  assert.match((result as { reason: string }).reason, /título/i);
});

test('validador bloqueia envio de publicação sem link no texto', () => {
  const db: any = {
    groups: [{ id: 'g', groupJid: '120363000@g.us', name: 'Grupo', permissionStatus: 'verified_admin', canPost: true }],
    stores: [{ id: 's', storeName: 'shopee', affiliateTag: 'radar', isActive: true }],
    credentials: [], jobs: [], history: [], scheduledMessages: [],
  };
  const job = {
    id: 'job-sem-link', userId: 'u', originType: 'copiador', targetJid: '120363000@g.us',
    messageText: '*Tênis Nike Flex*\n🔥 *Por R$ 99,90*\n\n🛒 *Compre aqui com segurança:*\n',
    mediaUrl: 'https://cf.shopee.com.br/file/x.jpg', mediaType: 'image',
    affiliateUrl: 'https://s.shopee.com.br/abc123', status: 'agendado', scheduledFor: new Date().toISOString(),
    attempts: 0, maxAttempts: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isDemo: false,
  } as unknown as PublicationJob;
  const result = validateJobForDispatch(job, db);
  assert.equal(result.valid, false);
  assert.match(result.error || '', /link/i);
});
