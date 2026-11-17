// Prévia local do redesenho: sobe o painel em http://localhost:3100 SEM nenhuma chave de produção.
// Todas as variáveis do .env.local são zeradas; o banco é um arquivo de demonstração em .previa/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const env = { ...process.env };
const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const key = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (key) env[key] = '';
  }
}
Object.assign(env, {
  RADAR_DB_PATH: path.join(root, '.previa', 'radar_db.json'),
  REQUIRE_AUTH: 'false',
  NEXT_PUBLIC_REQUIRE_AUTH: 'false',
  NEXT_PUBLIC_PREVIA: '1',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3100',
  SESSION_SECRET: 'previa-local-sem-valor-em-producao',
  ENCRYPTION_KEY: 'previa-local-sem-valor-em-producao-32b',
});
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'dev', '-p', '3100', '-H', '127.0.0.1'], { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', code => process.exit(code ?? 0));
