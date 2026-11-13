import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const secrets = ['radar_wa_key_88392104', 'radar_cron_secret_772819034'];

test('nenhuma chave ou segredo embutido nos arquivos do gateway e das rotas', () => {
  for (const file of ['src/lib/server/copier-watchdog.ts', 'src/lib/server/copier-group-catalog.ts', 'src/app/api/worker/trigger/route.ts']) {
    const content = fs.readFileSync(path.join(root, file), 'utf-8');
    for (const secret of secrets) assert.ok(!content.includes(secret), `${file} ainda contém um segredo embutido`);
  }
});

test('resolveGatewayEnv retorna null sem variáveis de ambiente', async () => {
  const saved = { ...process.env };
  for (const key of ['EVOLUTION_BASE_URL', 'EVOLUTION_API_URL', 'WHATSAPP_GATEWAY_URL', 'EVOLUTION_API_KEY', 'WHATSAPP_GATEWAY_KEY']) delete process.env[key];
  try {
    const { resolveGatewayEnv } = await import('@/lib/server/copier-group-catalog');
    assert.equal(resolveGatewayEnv(), null);
    process.env.EVOLUTION_BASE_URL = ' https://gw.exemplo.test ';
    process.env.EVOLUTION_API_KEY = ' chave-teste ';
    assert.deepEqual(resolveGatewayEnv(), { baseUrl: 'https://gw.exemplo.test', apiKey: 'chave-teste' });
  } finally {
    process.env = saved;
  }
});

test('watchdog verifica todas as conexões do usuário, não só a primeira', async () => {
  const os = await import('os');
  const dbPath = path.join(os.tmpdir(), `radar_watchdog_${Date.now()}.json`);
  process.env.RADAR_DB_PATH = dbPath;
  const { getInitialDatabase } = await import('@/lib/server/storage');
  const initial = getInitialDatabase();
  const base = { baseUrl: 'https://gw.exemplo.test', apiKey: 'k', status: 'connected', isDefault: false, createdAt: '', updatedAt: '', label: 'x' };
  initial.connections = [
    { ...base, id: 'c1', userId: 'u1', instanceName: 'inst_um' },
    { ...base, id: 'c2', userId: 'u1', instanceName: 'inst_dois' },
  ] as any;
  fs.writeFileSync(dbPath, JSON.stringify(initial));
  const called: string[] = [];
  const originalFetch = global.fetch;
  global.fetch = (async (url: string) => {
    called.push(String(url));
    return new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 });
  }) as typeof fetch;
  try {
    const { runCopierWatchdog } = await import('@/lib/server/copier-watchdog');
    const report = await runCopierWatchdog(false, { userId: 'u1' });
    assert.ok(called.some(u => u.includes('/connectionState/inst_um')));
    assert.ok(called.some(u => u.includes('/connectionState/inst_dois')));
    assert.equal(report.connections.length, 2);
    assert.ok(!called.some(u => /restart/.test(u)), 'não deve reiniciar instância aberta');
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(dbPath, { force: true });
  }
});
