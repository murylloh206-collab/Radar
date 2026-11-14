import test from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionAllowsSending } from '../src/lib/server/plan-guard';

const NOW = new Date('2026-11-14T12:00:00Z');
const OWNER = '00000000-0000-0000-0000-000000000001';
const C = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';

test('conta criada sem pagamento (canceled) não envia automático', () => {
  assert.equal(subscriptionAllowsSending(C, { status: 'canceled', expiraEm: null }, NOW), false);
});

test('pago e dentro do prazo (incluindo tolerância) envia', () => {
  assert.equal(subscriptionAllowsSending(C, { status: 'active', expiraEm: '2026-11-15T00:00:00Z' }, NOW), true);
});

test('vencido depois da tolerância não envia; nada é apagado (só bloqueio)', () => {
  assert.equal(subscriptionAllowsSending(C, { status: 'active', expiraEm: '2026-11-14T11:59:00Z' }, NOW), false);
});

test('cancelado mas ainda dentro do período pago continua enviando', () => {
  assert.equal(subscriptionAllowsSending(C, { status: 'canceled', expiraEm: '2026-12-01T00:00:00Z' }, NOW), true);
});

test('conta do dono nunca é bloqueada', () => {
  assert.equal(subscriptionAllowsSending(OWNER, { status: 'canceled', expiraEm: null }, NOW), true);
});
