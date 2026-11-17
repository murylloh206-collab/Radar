import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutGate } from '../src/lib/server/billing/checkout-gate';

test('modo teste: só o administrador abre o checkout', () => {
  assert.equal(checkoutGate('test', 'admin', true), null);
  assert.match(checkoutGate('test', 'user', false) || '', /em breve/);
});

test('modo produção: todos assinam, mas só com os dados do prestador preenchidos', () => {
  assert.equal(checkoutGate('production', 'user', false), null);
  assert.equal(checkoutGate('production', 'admin', false), null);
  assert.match(checkoutGate('production', 'user', true) || '', /em breve/);
  assert.match(checkoutGate('production', 'admin', true) || '', /em breve/);
});
