import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPairingCode,
  exchangePairingCode,
  resolveExtensionUser,
  revokeExtensionToken,
  memoryExtensionAuthRepo,
} from '../src/lib/server/extension-auth';

const U1 = '66666666-6666-4666-8666-666666666666';
const U2 = '77777777-7777-4777-8777-777777777777';
const req = (token?: string) =>
  new Request('http://localhost/api/extension/status', { headers: token ? { authorization: `Bearer ${token}` } : {} });

test('código tem 8 caracteres sem letras ambíguas e troca por token uma única vez', async () => {
  const repo = memoryExtensionAuthRepo();
  const { code } = await createPairingCode(U1, repo);
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
  const first = await exchangePairingCode(code, repo);
  assert.equal(first?.userId, U1);
  assert.ok(first && first.token.length >= 40);
  assert.equal(await exchangePairingCode(code, repo), null);
});

test('aceita o código digitado em minúsculas e com espaços', async () => {
  const repo = memoryExtensionAuthRepo();
  const { code } = await createPairingCode(U1, repo);
  const r = await exchangePairingCode(` ${code.toLowerCase().slice(0, 4)} ${code.toLowerCase().slice(4)} `, repo);
  assert.equal(r?.userId, U1);
});

test('código expirado não vale', async () => {
  const repo = memoryExtensionAuthRepo();
  let now = Date.now();
  const { code } = await createPairingCode(U1, repo, () => now);
  now += 11 * 60_000;
  assert.equal(await exchangePairingCode(code, repo, () => now), null);
});

test('o banco guarda só hashes, nunca o código nem o token', async () => {
  const repo = memoryExtensionAuthRepo();
  const { code } = await createPairingCode(U1, repo);
  const r = await exchangePairingCode(code, repo);
  const dump = JSON.stringify(repo.dump());
  assert.ok(!dump.includes(code));
  assert.ok(!dump.includes(r!.token));
});

test('token resolve para o próprio dono; revogado ou inválido não resolve', async () => {
  const repo = memoryExtensionAuthRepo();
  const a = await exchangePairingCode((await createPairingCode(U1, repo)).code, repo);
  const b = await exchangePairingCode((await createPairingCode(U2, repo)).code, repo);
  assert.equal(await resolveExtensionUser(req(a!.token), repo), U1);
  assert.equal(await resolveExtensionUser(req(b!.token), repo), U2);
  assert.equal(await resolveExtensionUser(req('token-inventado'), repo), null);
  assert.equal(await resolveExtensionUser(req(), repo), null);
  await revokeExtensionToken(a!.token, repo);
  assert.equal(await resolveExtensionUser(req(a!.token), repo), null);
});
