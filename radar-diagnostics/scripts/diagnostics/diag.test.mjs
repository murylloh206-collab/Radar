import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configuration, verifySession, diagnose, counterQuery, safeFailure } from './diag.mjs';

const env = {
  DIAG_READONLY_DATABASE_URL: 'postgresql://reader:fake-password@example.invalid/db',
  DIAG_EXPECTED_HOST: 'example.invalid',
};
const args = ['--authorize-production-read'];
const safeSession = { readonly: true, default_readonly: true, timeout_ok: true,
  lock_ok: true, path_ok: true, rls_ok: true };

test('authorization is required before credentials or driver are read', () => {
  assert.throws(() => configuration([], {}), /AUTHORIZATION_REQUIRED/);
  const execution = spawnSync(process.execPath, [fileURLToPath(new URL('./diag.mjs', import.meta.url))],
    { encoding: 'utf8', env: {} });
  assert.equal(execution.status, 1);
  assert.match(execution.stderr, /AUTHORIZATION_REQUIRED/);
});

test('TLS and server limits cannot be overridden by URL parameters', () => {
  const config = configuration(args, env);
  assert.equal(config.connection.ssl.rejectUnauthorized, true);
  assert.match(config.connection.options, /default_transaction_read_only=on/);
  assert.match(config.connection.options, /statement_timeout=5000/);
  assert.throws(() => configuration(args, { ...env,
    DIAG_READONLY_DATABASE_URL: env.DIAG_READONLY_DATABASE_URL + '?sslmode=disable' }), /URL_OPTIONS_FORBIDDEN/);
  assert.throws(() => configuration(args, { ...env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }), /UNSAFE_TLS/);
});

test('target and row limit validation fail closed', () => {
  assert.throws(() => configuration(args, { ...env, DIAG_EXPECTED_HOST: 'other.invalid' }), /HOST_MISMATCH/);
  for (const limit of ['0', '10001', 'NaN', '1.5']) {
    assert.throws(() => configuration(args, { ...env, DIAG_ROW_LIMIT: limit }), /INVALID_ROW_LIMIT/);
  }
});

test('unsafe session and writable role stop before business queries', async () => {
  let calls = 0;
  const unsafeClient = { query: async () => { calls++; return { rows: [{ ...safeSession, readonly: false }] }; } };
  await assert.rejects(verifySession(unsafeClient), /SESSION_NOT_SAFE/);
  assert.equal(calls, 1);
  const writableClient = { query: async () => ({ rows: [++calls === 2 ? safeSession : { unsafe: true }] }) };
  await assert.rejects(verifySession(writableClient), /READONLY_ROLE_REQUIRED/);
});

test('bounded counters redact unknown status values inside SQL', () => {
  const query = counterQuery('publication_jobs', new Map([['status', 'text'], ['sent_at', 'timestamptz']]));
  assert.match(query.text, /ELSE '__other__'/);
  assert.match(query.text, /LIMIT \$1/);
  assert.match(query.text, /sent_at_last_24h/);
  assert.doesNotMatch(query.text, /target_jid|message_text|runtime_payload|error_details/);
  assert.throws(() => counterQuery('store_credentials', new Map()), /TABLE_NOT_ALLOWED/);
});

test('mocked report distinguishes truncated, missing and skipped tables', async () => {
  const replies = [
    [safeSession], [{ unsafe: false }],
    [{ table_name: 'publication_jobs', relkind: 'r', can_select: true },
      { table_name: 'copier_inbox', relkind: 'r', can_select: false }],
    [{ attname: 'status', typname: 'text' }],
    [{ observed_rows: '3', status_bucket: '__other__' }],
  ];
  const queries = [];
  const client = { query: async query => { queries.push(query); return { rows: replies.shift() }; } };
  const report = await diagnose(client, 2);
  assert.ok(queries.every(query => /^SELECT\s/.test(query.text) && !query.text.includes(';')));
  assert.equal(queries.at(-1).values[0], 3);
  assert.equal(report.tables.find(table => table.table_name === 'publication_jobs').counts.truncated, true);
  assert.equal(report.tables.find(table => table.table_name === 'copier_inbox').counts.state, 'skipped');
  assert.equal(report.tables[0].state, 'missing');
  assert.equal(replies.length, 0);
});

test('driver error text, stack and details never reach diagnostics output', () => {
  assert.equal(safeFailure({ message: 'secret token', detail: 'personal email', code: 'unknown' }),
    'DIAGNOSTIC_FAILED_DETAILS_REDACTED');
  assert.equal(safeFailure({ message: 'secret', code: '57014' }), 'DATABASE_57014');
});
