import test from 'node:test';
import assert from 'node:assert/strict';

test('espera crescente entre tentativas quando a sessão do WhatsApp oscila', async () => {
  const { connectionClosedRetryDelayMs } = await import('../src/lib/server/copier-runtime');
  assert.equal(connectionClosedRetryDelayMs(0), 20000);
  assert.equal(connectionClosedRetryDelayMs(1), 20000);
  assert.equal(connectionClosedRetryDelayMs(2), 60000);
  assert.equal(connectionClosedRetryDelayMs(3), 180000);
  assert.equal(connectionClosedRetryDelayMs(7), 180000);
});
