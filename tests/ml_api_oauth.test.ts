import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ML_APP_CLIENT_ID = '1600259388403721';
process.env.ML_APP_CLIENT_SECRET = 'segredo-de-teste-123';

test('autorização: endereço oficial com PKCE e state cifrado que volta íntegro', async () => {
  const { buildAuthorization, readState, ML_REDIRECT_URI } = await import('../src/lib/server/ml-api');
  const auth = buildAuthorization('00000000-0000-0000-0000-000000000001')!;
  const url = new URL(auth.url);
  assert.equal(url.origin + url.pathname, 'https://auth.mercadolivre.com.br/authorization');
  assert.equal(url.searchParams.get('redirect_uri'), ML_REDIRECT_URI);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok((url.searchParams.get('code_challenge') || '').length >= 43);
  const state = url.searchParams.get('state')!;
  assert.doesNotMatch(state, /00000000-0000-0000-0000-000000000001/, 'a conta não aparece aberta no endereço');
  const read = readState(state)!;
  assert.equal(read.userId, '00000000-0000-0000-0000-000000000001');
  assert.ok(read.verifier.length >= 43);
});

test('state adulterado ou inválido é recusado', async () => {
  const { buildAuthorization, readState } = await import('../src/lib/server/ml-api');
  const state = new URL(buildAuthorization('u1')!.url).searchParams.get('state')!;
  const tampered = state.slice(0, -4) + (state.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.equal(readState(tampered), null);
  assert.equal(readState('qualquer-coisa'), null);
  assert.equal(readState(''), null);
});

test('state vencido é recusado', async () => {
  const { readState } = await import('../src/lib/server/ml-api');
  const { encryptJson } = await import('../src/lib/server/crypto-vault');
  assert.equal(readState(encryptJson({ u: 'u1', v: 'x'.repeat(50), e: Date.now() - 1000 })), null);
});
