import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptSecret, decryptSecret } from '../src/lib/server/crypto-vault';
import { resolveCurrentUserId } from '../src/lib/server/plan-guard';
import { signSession } from '../src/lib/server/auth';
import { appendChannelSrcParam } from '../src/lib/offer-format';

test('Fase 5 (Bloco A): Criptografia isolada e derivação estrita', () => {
  const secret = 'minha_chave_api_super_secreta_shopee_123';
  const encrypted = encryptSecret(secret);
  assert.ok(encrypted.startsWith('enc:v1:'), 'Payload criptografado deve ter formato enc:v1:');
  const decrypted = decryptSecret(encrypted);
  assert.equal(decrypted, secret, 'Deve recuperar exatamente a chave descriptografada');
});

test('Fase 5 (Bloco A): resolveCurrentUserId com isolamento por sessão em cookie', () => {
  const userA = '11111111-1111-1111-1111-111111111111';
  const userB = '22222222-2222-2222-2222-222222222222';

  const tokenA = signSession({ userId: userA, email: 'usera@exemplo.com', role: 'user' });
  const tokenB = signSession({ userId: userB, email: 'userb@exemplo.com', role: 'user' });

  const reqA = new Request('http://localhost:3000/api/brand-settings', {
    headers: { cookie: `radar_session=${tokenA}` },
  });

  const reqB = new Request('http://localhost:3000/api/brand-settings', {
    headers: { cookie: `radar_session=${tokenB}` },
  });

  assert.equal(resolveCurrentUserId(reqA), userA, 'Deve resolver estritamente o usuário A');
  assert.equal(resolveCurrentUserId(reqB), userB, 'Deve resolver estritamente o usuário B');
  assert.notEqual(resolveCurrentUserId(reqA), resolveCurrentUserId(reqB), 'Usuários nunca podem coincidir');
});

test('Fase 5 (Bloco A): Rotas públicas mantêm parâmetros limpos e sem expor dados internos', () => {
  const urlWithTrack = appendChannelSrcParam('https://shopee.com.br/product/123', 'whatsapp');
  assert.ok(urlWithTrack.includes('src=whatsapp'));
  assert.ok(!urlWithTrack.includes('user_id'), 'Nunca pode expor user_id na URL pública');
});

