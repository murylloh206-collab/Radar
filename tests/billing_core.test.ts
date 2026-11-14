import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  startCheckout,
  syncSubscription,
  handleNotification,
  cancelForUser,
  getStatusForUser,
  memoryBillingRepo,
  BillingError,
  type BillingDeps,
  type MpApi,
} from '../src/lib/server/billing/billing-core';
import { verifyMercadoPagoSignature } from '../src/lib/server/billing/mp-signature';

const U1 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const U2 = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';

type Fake = { pre: Record<string, any>; payments: Record<string, any[]>; created: any[]; updates: any[] };

function setup(over: Partial<BillingDeps> = {}) {
  const fake: Fake = { pre: {}, payments: {}, created: [], updates: [] };
  let n = 0;
  const mp: MpApi = {
    async createPreapproval(body) {
      n++;
      const id = `pre_${n}`;
      fake.created.push(body);
      fake.pre[id] = { id, status: 'pending', external_reference: body.external_reference, auto_recurring: body.auto_recurring, next_payment_date: null };
      return { id, init_point: `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=${id}`, status: 'pending' };
    },
    async getPreapproval(id) { return fake.pre[id]; },
    async searchAuthorizedPayments(id) { return fake.payments[id] || []; },
    async getAuthorizedPayment(id) {
      for (const [pre, list] of Object.entries(fake.payments)) if (list.some(p => String(p.id) === String(id))) return { id, preapproval_id: pre };
      return null;
    },
    async getPayment() { return null; },
    async updatePreapproval(id, body) { fake.updates.push({ id, body }); Object.assign(fake.pre[id], body); return fake.pre[id]; },
  };
  const access: Record<string, any> = {};
  const sales: any[] = [];
  const deps: BillingDeps = {
    env: 'test',
    appUrl: 'https://painel-de-ofertas.vercel.app',
    payerEmailOverride: 'test_user_buyer@testuser.com',
    mp,
    repo: memoryBillingRepo(),
    applyAccess: async (userId, a) => { access[userId] = a; },
    notifySale: async s => { sales.push(s); },
    now: () => new Date('2026-11-14T12:00:00Z'),
    ...over,
  };
  return { deps, fake, access, sales };
}

test('checkout usa o preço do catálogo do servidor, mensal, em BRL, e vincula ao cliente por ID interno', async () => {
  const { deps, fake } = setup();
  const r = await startCheckout(deps, { userId: U1, email: 'cliente@x.com', planId: 'plus', clientAmount: 1 } as any);
  assert.match(r.checkoutUrl, /^https:\/\/www\.mercadopago\.com\.br\//);
  const body = fake.created[0];
  assert.equal(body.auto_recurring.transaction_amount, 59.9);
  assert.equal(body.auto_recurring.currency_id, 'BRL');
  assert.equal(body.auto_recurring.frequency, 1);
  assert.equal(body.auto_recurring.frequency_type, 'months');
  assert.equal(body.status, 'pending');
  assert.equal(body.back_url, 'https://painel-de-ofertas.vercel.app/assinatura/retorno');
  assert.equal(body.payer_email, 'test_user_buyer@testuser.com');
  assert.ok(!JSON.stringify(body).includes(U1), 'ID do cliente não vai para o Mercado Pago');
  const row = await deps.repo.findByExternalReference(body.external_reference);
  assert.equal(row?.userId, U1);
  assert.equal(row?.planId, 'plus');
});

test('plano inexistente é recusado', async () => {
  const { deps } = setup();
  await assert.rejects(startCheckout(deps, { userId: U1, email: 'a@b.com', planId: 'gold' as any }), BillingError);
});

test('assinatura só autorizada, sem pagamento aprovado, NÃO libera o plano', async () => {
  const { deps, fake, access } = setup();
  await startCheckout(deps, { userId: U1, email: 'a@b.com', planId: 'plus' });
  fake.pre.pre_1.status = 'authorized';
  fake.payments.pre_1 = [{ id: 'ap1', status: 'scheduled', payment: { id: 'p1', status: 'pending' }, transaction_amount: 59.9, date_created: '2026-11-14T11:00:00Z' }];
  await syncSubscription(deps, 'pre_1');
  assert.equal(access[U1], undefined);
  fake.payments.pre_1[0].payment.status = 'rejected';
  await syncSubscription(deps, 'pre_1');
  assert.equal(access[U1], undefined);
});

test('pagamento aprovado libera o plano por 1 mês + 2 dias de tolerância e avisa a venda uma vez', async () => {
  const { deps, fake, access, sales } = setup();
  await startCheckout(deps, { userId: U1, email: 'a@b.com', planId: 'plus' });
  fake.pre.pre_1.status = 'authorized';
  fake.payments.pre_1 = [{ id: 'ap1', status: 'processed', payment: { id: 'p1', status: 'approved' }, transaction_amount: 59.9, debit_date: '2026-11-14T11:00:00Z' }];
  await syncSubscription(deps, 'pre_1');
  assert.equal(access[U1].planId, 'plus');
  assert.equal(access[U1].paidUntil, '2026-12-14T11:00:00.000Z');
  assert.equal(access[U1].accessUntil, '2026-12-16T11:00:00.000Z');
  assert.equal(sales.length, 1);
  assert.equal(sales[0].amount, 59.9);
  assert.equal(sales[0].planName, 'Plus');
});

test('notificações repetidas e fora de ordem não duplicam pagamento nem aviso', async () => {
  const { deps, fake, sales, access } = setup();
  await startCheckout(deps, { userId: U1, email: 'a@b.com', planId: 'ultimate' });
  fake.pre.pre_1.status = 'authorized';
  fake.payments.pre_1 = [{ id: 'ap1', status: 'processed', payment: { id: 'p1', status: 'approved' }, transaction_amount: 119.9, debit_date: '2026-11-14T11:00:00Z' }];
  await handleNotification(deps, { type: 'subscription_authorized_payment', dataId: 'ap1' });
  await handleNotification(deps, { type: 'subscription_authorized_payment', dataId: 'ap1' });
  await handleNotification(deps, { type: 'subscription_preapproval', dataId: 'pre_1' });
  assert.equal(sales.length, 1);
  assert.equal(access[U1].paidUntil, '2026-12-14T11:00:00.000Z');
});

test('notificação de assinatura que não é nossa é ignorada sem erro', async () => {
  const { deps, access } = setup();
  await handleNotification(deps, { type: 'subscription_preapproval', dataId: 'desconhecida' });
  assert.deepEqual(access, {});
});

test('cancelar mantém o acesso só até o fim do período pago (sem tolerância)', async () => {
  const { deps, fake, access } = setup();
  await startCheckout(deps, { userId: U1, email: 'a@b.com', planId: 'plus' });
  fake.pre.pre_1.status = 'authorized';
  fake.payments.pre_1 = [{ id: 'ap1', status: 'processed', payment: { id: 'p1', status: 'approved' }, transaction_amount: 59.9, debit_date: '2026-11-14T11:00:00Z' }];
  await syncSubscription(deps, 'pre_1');
  await cancelForUser(deps, U1);
  assert.deepEqual(fake.updates[0], { id: 'pre_1', body: { status: 'cancelled' } });
  assert.equal(access[U1].accessUntil, '2026-12-14T11:00:00.000Z');
  assert.equal(access[U1].cancelled, true);
});

test('um cliente não vê nem cancela a assinatura de outro', async () => {
  const { deps, fake } = setup();
  await startCheckout(deps, { userId: U1, email: 'a@b.com', planId: 'plus' });
  fake.pre.pre_1.status = 'authorized';
  const st2 = await getStatusForUser(deps, U2);
  assert.equal(st2.hasSubscription, false);
  await assert.rejects(cancelForUser(deps, U2), BillingError);
  assert.equal(fake.updates.length, 0);
});

test('status do cliente traz dados reais (sem datas inventadas)', async () => {
  const { deps, fake } = setup();
  await startCheckout(deps, { userId: U1, email: 'a@b.com', planId: 'impulse' });
  const s1 = await getStatusForUser(deps, U1, { refresh: true });
  assert.equal(s1.hasSubscription, true);
  assert.equal(s1.planName, 'Impulse');
  assert.equal(s1.amount, 29.9);
  assert.equal(s1.paidUntil, null);
  assert.equal(s1.nextPaymentDate, null);
  fake.pre.pre_1.status = 'authorized';
  fake.pre.pre_1.next_payment_date = '2026-12-14T11:00:00Z';
  const s2 = await getStatusForUser(deps, U1, { refresh: true });
  assert.equal(s2.status, 'authorized');
  assert.equal(s2.nextPaymentDate, '2026-12-14T11:00:00Z');
});

test('assinatura do webhook: aceita a correta e recusa adulterada ou sem segredo', () => {
  const secret = 'segredo-webhook';
  const ts = '1731585600';
  const manifest = `id:ap1;request-id:req-9;ts:${ts};`;
  const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  assert.equal(verifyMercadoPagoSignature({ signature: `ts=${ts},v1=${v1}`, requestId: 'req-9', dataId: 'AP1', secret }), true);
  assert.equal(verifyMercadoPagoSignature({ signature: `ts=${ts},v1=${v1.replace(/.$/, '0')}`, requestId: 'req-9', dataId: 'ap1', secret }), false);
  assert.equal(verifyMercadoPagoSignature({ signature: `ts=${ts},v1=${v1}`, requestId: 'req-9', dataId: 'ap1', secret: '' }), false);
  assert.equal(verifyMercadoPagoSignature({ signature: null, requestId: 'req-9', dataId: 'ap1', secret }), false);
});
