import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

test('webhook sem assinatura válida é recusado (401) e não mexe em nada', async () => {
  process.env.MERCADOPAGO_WEBHOOK_SECRET_TEST = 'segredo';
  const { POST } = await import('../src/app/api/webhooks/mercadopago/route');
  const res = await POST(new NextRequest('http://localhost/api/webhooks/mercadopago?data.id=123&type=subscription_preapproval', {
    method: 'POST', body: JSON.stringify({ type: 'subscription_preapproval', data: { id: '123' } }),
    headers: { 'x-signature': 'ts=1,v1=deadbeef', 'x-request-id': 'r1', 'content-type': 'application/json' },
  }));
  assert.equal(res.status, 401);
});

test('checkout exige login (sem sessão → 401) e não aceita plano inventado', async () => {
  const { POST } = await import('../src/app/api/subscription/route');
  const res = await POST(new NextRequest('http://localhost/api/subscription', {
    method: 'POST', body: JSON.stringify({ action: 'checkout', planId: 'plus', amount: 0.01 }), headers: { 'content-type': 'application/json' },
  }));
  assert.equal(res.status, 401);
});

test('status e cancelamento exigem login do próprio cliente', async () => {
  const st = await import('../src/app/api/billing/status/route');
  const ca = await import('../src/app/api/billing/cancel/route');
  assert.equal((await st.GET(new NextRequest('http://localhost/api/billing/status'))).status, 401);
  assert.equal((await ca.POST(new NextRequest('http://localhost/api/billing/cancel', { method: 'POST' }))).status, 401);
});
