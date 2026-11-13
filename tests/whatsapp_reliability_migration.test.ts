import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const file = path.resolve(__dirname, '..', 'supabase', 'migrations', '08_cron_keepalive.sql');

test('migração do agendador habilita pg_cron e pg_net', () => {
  const sql = fs.readFileSync(file, 'utf-8').toLowerCase();
  assert.match(sql, /create extension if not exists pg_cron/);
  assert.match(sql, /create extension if not exists pg_net/);
});

test('migração agenda fila (1 min), gateway e watchdog (5 min)', () => {
  const sql = fs.readFileSync(file, 'utf-8');
  assert.match(sql, /'radar-fila',\s*'\* \* \* \* \*'/);
  assert.match(sql, /'radar-gateway-acordar',\s*'\*\/5 \* \* \* \*'/);
  assert.match(sql, /'radar-watchdog',\s*'\*\/5 \* \* \* \*'/);
  assert.match(sql, /\/api\/worker\/poll/);
  assert.match(sql, /\/api\/cron\/process-scheduled/);
});

test('migração é idempotente e lê segredos do Vault, sem segredo literal', () => {
  const sql = fs.readFileSync(file, 'utf-8');
  assert.match(sql, /cron\.unschedule/);
  assert.match(sql, /vault\.decrypted_secrets/);
  for (const name of ['radar_app_url', 'radar_gateway_url', 'radar_cron_secret']) assert.ok(sql.includes(name), name);
  const withoutComments = sql.replace(/--.*$/gm, '');
  assert.ok(!/[A-Za-z0-9_]{32,}/.test(withoutComments.replace(/radar[a-z_-]+/g, '')), 'parece haver um segredo literal no SQL');
  assert.ok(!sql.includes('radar_wa_key_88392104'));
});
