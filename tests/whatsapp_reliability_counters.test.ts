import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(os.tmpdir(), `radar_counters_${Date.now()}.json`);
process.env.RADAR_DB_PATH = dbPath;
test.after(() => fs.rmSync(dbPath, { force: true }));

test('início do dia é a meia-noite de Brasília mesmo com servidor em UTC', async () => {
  const { startOfTodaySaoPaulo } = await import('@/lib/server/daily-sent-counter');
  assert.equal(startOfTodaySaoPaulo(new Date('2026-11-13T02:30:00Z')).toISOString(), '2026-11-12T03:00:00.000Z');
});

test('envio às 23:30 de Brasília do dia anterior não conta hoje', async () => {
  const { isSentToday } = await import('@/lib/server/daily-sent-counter');
  assert.equal(isSentToday({ status: 'enviado', sentAt: '2026-11-12T02:30:00Z' }, new Date('2026-11-12T15:00:00Z')), false);
});

test('envio logo após a meia-noite de Brasília conta hoje', async () => {
  const { isSentToday } = await import('@/lib/server/daily-sent-counter');
  assert.equal(isSentToday({ status: 'enviado', sentAt: '2026-11-12T03:05:00Z' }, new Date('2026-11-12T15:00:00Z')), true);
});

test('publicação com falha não conta como enviada', async () => {
  const { isSentToday } = await import('@/lib/server/daily-sent-counter');
  assert.equal(isSentToday({ status: 'falha', sentAt: '2026-11-12T12:00:00Z' }, new Date('2026-11-12T15:00:00Z')), false);
});

test('conta dona não tem limite diário de plano', async () => {
  const { getInitialDatabase } = await import('@/lib/server/storage');
  const { ADMIN_UUID } = await import('@/lib/server/auth');
  const initial = getInitialDatabase();
  const now = new Date().toISOString();
  initial.jobs = Array.from({ length: 120 }, (_, i) => ({
    id: `j${i}`, userId: ADMIN_UUID, status: 'enviado', sentAt: now, createdAt: now, targetJid: 'x@g.us', messageText: 'x',
  })) as any;
  fs.writeFileSync(dbPath, JSON.stringify(initial));
  const { getDailyOfferQuotaStatus } = await import('@/lib/server/plan-guard');
  const quota = await getDailyOfferQuotaStatus(ADMIN_UUID);
  assert.equal(quota.dailyLimit, null);
  assert.equal(quota.limitReached, false);
  assert.equal(quota.postedToday, 120);
});
