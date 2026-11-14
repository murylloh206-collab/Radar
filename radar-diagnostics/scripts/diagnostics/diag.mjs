#!/usr/bin/env node
// No dotenv, application imports, RPCs, arbitrary SQL or automatic credential fallback.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TABLES = Object.freeze([
  'products_catalog', 'offer_evaluations', 'offer_deduplication',
  'incoming_messages', 'publication_jobs', 'copier_inbox',
]);
const STATUSES = Object.freeze([
  'rascunho', 'agendado', 'aguardando_aprovacao', 'enviando', 'enviado',
  'falha', 'cancelado', 'recebida', 'received', 'pending', 'processing',
  'processed', 'failed', 'sent', 'approved', 'rejected',
]);
const OPTIONS = '-c default_transaction_read_only=on -c statement_timeout=5000'
  + ' -c lock_timeout=1000 -c idle_in_transaction_session_timeout=10000'
  + ' -c search_path=pg_catalog -c row_security=on';
const HELP = `Radar de Ofertas: diagnostico PostgreSQL somente leitura
Uso: node scripts/diagnostics/diag.mjs --authorize-production-read
Obrigatorio: DIAG_READONLY_DATABASE_URL e DIAG_EXPECTED_HOST.
Opcional: DIAG_CA_FILE (certificado CA PEM), DIAG_ROW_LIMIT (1..10000).
Sem a flag, nenhuma conexao e aberta. Consulte README.md antes de executar.`;

function demand(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { safeCode: code });
}

export function configuration(args, env) {
  demand(args.length === 1 && args[0] === '--authorize-production-read', 'AUTHORIZATION_REQUIRED');
  demand(env.DIAG_READONLY_DATABASE_URL && env.DIAG_EXPECTED_HOST, 'CONFIG_REQUIRED');
  const url = new URL(env.DIAG_READONLY_DATABASE_URL);
  demand(['postgres:', 'postgresql:'].includes(url.protocol), 'INVALID_DATABASE_URL');
  demand(!url.search && !url.hash, 'URL_OPTIONS_FORBIDDEN');
  demand(url.hostname === env.DIAG_EXPECTED_HOST, 'HOST_MISMATCH');
  demand(url.username && url.password && url.pathname.length > 1, 'INCOMPLETE_DATABASE_URL');
  demand(env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'UNSAFE_TLS_ENVIRONMENT');
  const rowLimit = Number(env.DIAG_ROW_LIMIT ?? 10000);
  demand(Number.isInteger(rowLimit) && rowLimit >= 1 && rowLimit <= 10000, 'INVALID_ROW_LIMIT');
  return { rowLimit, connection: connectionOptions(url, env) };
}

function connectionOptions(url, env) {
  return {
    host: url.hostname, port: Number(url.port || 5432),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: { rejectUnauthorized: true,
      ...(env.DIAG_CA_FILE ? { ca: readFileSync(env.DIAG_CA_FILE, 'utf8') } : {}) },
    options: OPTIONS, application_name: 'radar_readonly_diagnostics',
    connectionTimeoutMillis: 5000, query_timeout: 7000, keepAlive: true,
  };
}

// This is a closed query set, not a SQL sandbox. Never accept SQL from input.
async function select(client, sql, parameters = []) {
  demand(/^SELECT\s/i.test(sql.trim()) && !sql.includes(';'), 'NON_SELECT_REJECTED');
  return (await client.query({ text: sql, values: parameters })).rows;
}

export async function verifySession(client) {
  const [session] = await select(client, `SELECT
    current_setting('transaction_read_only') = 'on' AS readonly,
    current_setting('default_transaction_read_only') = 'on' AS default_readonly,
    current_setting('statement_timeout') = '5s' AS timeout_ok,
    current_setting('lock_timeout') = '1s' AS lock_ok,
    current_setting('search_path') = 'pg_catalog' AS path_ok,
    current_setting('row_security') = 'on' AS rls_ok`);
  demand(session && Object.values(session).every(flag => flag === true), 'SESSION_NOT_SAFE');
  const [privileges] = await select(client, PRIVILEGES_SQL);
  demand(privileges && privileges.unsafe === false, 'READONLY_ROLE_REQUIRED');
}

// MEMBER deliberately rejects dangerous reachable roles even without INHERIT.
// Function EXECUTE privileges and RLS policy code still require DBA review.
const PRIVILEGES_SQL = `SELECT (
  EXISTS (SELECT 1 FROM pg_roles r
    WHERE pg_has_role(current_user, r.oid, 'MEMBER')
      AND (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls
        OR r.rolname IN ('service_role','postgres','supabase_admin','pg_write_all_data',
          'pg_execute_server_program','pg_write_server_files','pg_read_server_files')))
  OR EXISTS (SELECT 1 FROM pg_roles r CROSS JOIN pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pg_has_role(current_user, r.oid, 'MEMBER')
      AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
      AND ((c.relkind IN ('r','p','v','m','f') AND
        (c.relowner = r.oid OR has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE,REFERENCES')))
        OR (c.relkind = 'S' AND has_sequence_privilege(r.oid,c.oid,'USAGE,UPDATE'))))
  OR EXISTS (SELECT 1 FROM pg_roles r CROSS JOIN pg_namespace n
    WHERE pg_has_role(current_user,r.oid,'MEMBER') AND has_schema_privilege(r.oid,n.oid,'CREATE'))
  OR has_database_privilege(current_database(),'CREATE')
) AS unsafe`;

const METADATA_SQL = `SELECT c.relname AS table_name, c.relkind,
  c.relrowsecurity AS rls_enabled, row_security_active(c.oid) AS rls_active,
  has_table_privilege(c.oid,'SELECT') AS can_select,
  c.reltuples::bigint::text AS estimated_rows_global,
  s.n_live_tup::text AS estimated_live_rows_global,
  s.n_dead_tup::text AS estimated_dead_rows_global,
  s.last_analyze, s.last_autoanalyze, s.last_autovacuum,
  (SELECT count(*)::int FROM pg_index i WHERE i.indrelid=c.oid) AS index_count,
  (SELECT count(*)::int FROM pg_index i WHERE i.indrelid=c.oid AND NOT i.indisvalid) AS invalid_indexes
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_stat_all_tables s ON s.relid=c.oid
  WHERE n.nspname='public' AND c.relname=ANY($1::text[])
  ORDER BY c.relname LIMIT 6`;

async function columnsFor(client, tableName) {
  const columns = await select(client, `SELECT a.attname, t.typname
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace
    WHERE n.nspname='public' AND c.relname=$1 AND a.attnum>0 AND NOT a.attisdropped
      AND tn.nspname='pg_catalog'
      AND a.attname=ANY($2::text[]) LIMIT 6`,
  [tableName, ['status', 'created_at', 'received_at', 'sent_at', 'is_approved', 'is_demo']]);
  return new Map(columns.map(column => [column.attname, column.typname]));
}

function counterExpressions(columns) {
  const expressions = ['count(*)::text AS observed_rows'];
  for (const column of ['created_at', 'received_at', 'sent_at']) {
    if (columns.get(column) === 'timestamptz') {
      expressions.push(`count(*) FILTER (WHERE "${column}" >= now() - interval '24 hours'
        AND "${column}" <= now())::text AS "${column}_last_24h"`);
    }
  }
  for (const column of ['is_approved', 'is_demo']) {
    if (columns.get(column) === 'bool') {
      expressions.push(`count(*) FILTER (WHERE "${column}" IS TRUE)::text AS "${column}_true"`);
    }
  }
  return expressions;
}

export function counterQuery(tableName, columns) {
  demand(TABLES.includes(tableName), 'TABLE_NOT_ALLOWED');
  const expressions = counterExpressions(columns);
  const hasStatus = ['text', 'varchar'].includes(columns.get('status'));
  const projection = [...columns.keys()].map(column => `"${column}"`).join(', ') || '1';
  if (hasStatus) expressions.push(`CASE WHEN status=ANY($2::text[]) THEN status
    WHEN status IS NULL THEN '__null__' ELSE '__other__' END AS status_bucket`);
  return { text: `SELECT ${expressions.join(', ')}
    FROM (SELECT ${projection} FROM public."${tableName}" LIMIT $1) AS bounded
    ${hasStatus ? 'GROUP BY status_bucket' : ''} LIMIT 32`, hasStatus };
}

async function tableCounters(client, table, rowLimit) {
  if (table.relkind !== 'r' || !table.can_select) {
    return { state: 'skipped', reason: 'Requires ordinary table and table-level SELECT' };
  }
  const columns = await columnsFor(client, table.table_name);
  const query = counterQuery(table.table_name, columns);
  const parameters = query.hasStatus ? [rowLimit + 1, STATUSES] : [rowLimit + 1];
  const counts = await select(client, query.text, parameters);
  const observed = counts.reduce((total, bucket) => total + Number(bucket.observed_rows), 0);
  return { state: 'ok', scope: 'rows_visible_to_current_role', observed_rows: observed,
    truncated: observed > rowLimit, exact_for_visible_rows: observed <= rowLimit,
    ordering: 'unspecified; bounded prefix, not representative sample', counters: counts };
}

async function collectTables(client, rowLimit) {
  const metadata = await select(client, METADATA_SQL, [TABLES]);
  const tables = [];
  for (const tableName of TABLES) {
    const table = metadata.find(candidate => candidate.table_name === tableName);
    if (!table) { tables.push({ table_name: tableName, state: 'missing' }); continue; }
    tables.push({ ...table, counts: await tableCounters(client, table, rowLimit) });
  }
  return tables;
}

export async function diagnose(client, rowLimit) {
  await verifySession(client);
  return {
    generated_at: new Date().toISOString(), source: 'radar_readonly_diagnostics',
    limits: { statement_ms: 5000, lock_ms: 1000, row_limit: rowLimit, probe_rows: 1 },
    notes: ['Estimates are global, approximate and may be stale; -1 means unknown.',
      'Counts obey RLS and are not necessarily production totals.',
      'Each SELECT has its own snapshot. Counts include demo records; is_demo_true separates them.',
      'A truncated table has partial counters across at most row_limit + 1 rows.',
      'Products, evaluations, deduplication keys and jobs are different entities; do not sum them.'],
    tables: await collectTables(client, rowLimit),
  };
}

export function safeFailure(error) {
  const knownCodes = new Set(['AUTHORIZATION_REQUIRED', 'CONFIG_REQUIRED', 'INVALID_DATABASE_URL',
    'URL_OPTIONS_FORBIDDEN', 'HOST_MISMATCH', 'INCOMPLETE_DATABASE_URL', 'UNSAFE_TLS_ENVIRONMENT',
    'INVALID_ROW_LIMIT', 'NON_SELECT_REJECTED', 'SESSION_NOT_SAFE', 'READONLY_ROLE_REQUIRED',
    'TABLE_NOT_ALLOWED', 'DRIVER_NOT_INSTALLED']);
  if (knownCodes.has(error?.safeCode)) return error.safeCode;
  const knownDatabaseCodes = new Set(['57014', '42501', '42P01', '42703', '28P01', '25006', '53300']);
  if (knownDatabaseCodes.has(error?.code)) return `DATABASE_${error.code}`;
  return 'DIAGNOSTIC_FAILED_DETAILS_REDACTED';
}

async function loadClient() {
  try { return (await import('pg')).default.Client; }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') demand(false, 'DRIVER_NOT_INSTALLED');
    throw error;
  }
}

async function runConnection(config) {
  const Client = await loadClient();
  const client = new Client(config.connection);
  client.on('error', () => {
    console.error('CONNECTION_LOST_DETAILS_REDACTED');
    process.exit(1);
  });
  try {
    await client.connect();
    const report = await diagnose(client, config.rowLimit);
    console.log(JSON.stringify(report, null, 2));
    if (report.tables.some(table => table.state === 'missing' || table.counts?.state === 'skipped')) {
      process.exitCode = 2;
    }
  } finally { await client.end(); }
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--help') { console.log(HELP); return; }
  const config = configuration(process.argv.slice(2), process.env);
  const deadline = setTimeout(() => {
    console.error('TOTAL_TIMEOUT_60000MS');
    process.exit(1); // Closing the process closes the socket; server timeout remains enforced.
  }, 60000);
  try { await runConnection(config); }
  finally { clearTimeout(deadline); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // The boundary intentionally suppresses messages, detail, stacks, URLs and server notices.
  main().catch(error => { console.error(safeFailure(error)); process.exitCode = 1; });
}
