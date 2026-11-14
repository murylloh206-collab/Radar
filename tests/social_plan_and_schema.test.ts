import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.RADAR_DB_PATH = path.join(os.tmpdir(), `radar_social_schema_${Date.now()}.json`);

test('limites diários de posts sociais por plano', async () => {
  const { PLANS_CONFIG } = await import('../src/lib/plans-config');
  assert.equal(PLANS_CONFIG.impulse.socialDailyPostLimit, 0);
  assert.equal(PLANS_CONFIG.plus.socialDailyPostLimit, 5);
  assert.equal(PLANS_CONFIG.ultimate.socialDailyPostLimit, null);
  assert.ok(!PLANS_CONFIG.impulse.features.includes('instagram_pro'));
  assert.ok(PLANS_CONFIG.plus.features.includes('instagram_pro'));
  assert.ok(PLANS_CONFIG.ultimate.features.includes('instagram_pro'));
});

test('fundo da arte padrão é escuro e aceita claro', async () => {
  const { getDefaultBrandSettings, saveBrandSettings, getBrandSettings } = await import('../src/lib/server/brand-settings');
  assert.equal(getDefaultBrandSettings('u-art').artBackground, 'dark');
  await saveBrandSettings('u-art', { artBackground: 'light' } as any);
  assert.equal((await getBrandSettings('u-art')).artBackground, 'light');
  await saveBrandSettings('u-art', { artBackground: 'roxo' } as any);
  assert.equal((await getBrandSettings('u-art')).artBackground, 'light', 'valor inválido é ignorado');
});

test('migração 09 cria tabelas sociais com isolamento', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '..', 'supabase', 'migrations', '09_social_posts.sql'), 'utf-8').toLowerCase();
  for (const table of ['social_offers', 'social_posts', 'social_autopost_settings']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /social_next_offer_number/);
  assert.match(sql, /unique\s*\(user_id,\s*offer_number\)/);
  assert.match(sql, /unique\s*\(user_id,\s*source_job_id\)/);
  assert.match(sql, /add column if not exists art_background/);
});
