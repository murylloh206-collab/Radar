import test from 'node:test';
import assert from 'node:assert/strict';
import { alertableSales, runSalesAlerts, salesAlertMessage } from '../src/lib/server/sales-alerts';
import { rakutenTransactionsToSales } from '../src/lib/server/rakuten-sales';
import { encodeNtfyHeader } from '../src/lib/server/owner-notify';
import { shouldWarnOwner, storeDownNotice } from '../src/lib/server/store-health';
import type { ConvertedSaleRecord } from '../src/lib/server/converted-sales';

const OWNER = '00000000-0000-0000-0000-000000000001';
const NOW = Date.parse('2026-11-15T03:00:00Z');
const sale = (id: string, extra: Partial<ConvertedSaleRecord> = {}): ConvertedSaleRecord => ({
  id, userId: OWNER, externalOrderId: id, store: 'shopee', productTitle: `Produto ${id}`, orderValue: 59.9,
  commissionValue: 3.2, quantity: 1, status: 'pending', dataSource: 'api_oficial_shopee',
  saleDate: '2026-11-15T01:00:00Z', createdAt: '2026-11-15T01:00:00Z', ...extra,
});

test('alertableSales: ignora cancelada, teste e antiga (>72h)', () => {
  const list = [sale('a'), sale('b', { status: 'cancelled' }), sale('c', { isTest: true }), sale('d', { saleDate: '2026-11-10T00:00:00Z' })];
  assert.deepEqual(alertableSales(list, NOW).map(s => s.id), ['a']);
});

test('salesAlertMessage: uma venda e várias', () => {
  const one = salesAlertMessage([sale('a')])!;
  assert.match(one.title, /^Venda na Shopee! \+R\$\s?3,20$/);
  assert.match(one.body, /Produto a .*comissão R\$\s?3,20/);
  const many = salesAlertMessage([sale('a'), sale('b', { store: 'netshoes', commissionValue: 10 })])!;
  assert.match(many.title, /^2 vendas novas \(Shopee, Netshoes\) \+R\$\s?13,20$/);
  assert.equal(salesAlertMessage([]), null);
});

test('runSalesAlerts: avisa só as que o banco inseriu agora', async () => {
  const notices: string[] = [];
  const result = await runSalesAlerts({
    fetchSales: async () => [sale('velha'), sale('nova')],
    insertNew: async (_u, sales) => sales.filter(s => s.id === 'nova'),
    saveAll: async () => {},
    notify: async n => { notices.push(n.title); return true; },
    now: () => NOW,
  }, OWNER);
  assert.deepEqual(result, { fetched: 2, alerted: 1 });
  assert.equal(notices.length, 1);
});

test('runSalesAlerts: nada novo → nenhum aviso', async () => {
  let calls = 0;
  await runSalesAlerts({ fetchSales: async () => [sale('x')], insertNew: async () => [], saveAll: async () => {},
    notify: async () => { calls++; return true; }, now: () => NOW }, OWNER);
  assert.equal(calls, 0);
});

test('rakutenTransactionsToSales: converte transação e marca devolução', () => {
  const [ok, back] = rakutenTransactionsToSales(OWNER, [
    { etransaction_id: 'E1', order_id: 'O1', product_name: 'Tênis X', sale_amount: '299.90', commissions: '17.99', quantity: 1, transaction_date: '2026-11-15 01:02:03' },
    { order_id: 'O2', sku_number: 'S9', sale_amount: -100, commissions: -6, transaction_date: '2026-11-15 02:00:00' },
    { foo: 'sem id' },
  ]);
  assert.equal(ok.externalOrderId, 'E1');
  assert.equal(ok.store, 'netshoes');
  assert.equal(ok.commissionValue, 17.99);
  assert.equal(ok.saleDate, '2026-11-15T01:02:03.000Z');
  assert.equal(back.externalOrderId, 'O2-S9');
  assert.equal(back.status, 'cancelada');
});

test('encodeNtfyHeader: ASCII passa direto, acento vai em RFC 2047', () => {
  assert.equal(encodeNtfyHeader('Crie o grupo #19'), 'Crie o grupo #19');
  const enc = encodeNtfyHeader('Sessão caiu');
  assert.match(enc, /^=\?UTF-8\?B\?.+\?=$/);
  assert.equal(Buffer.from(enc.slice(10, -2), 'base64').toString('utf8'), 'Sessão caiu');
});

test('shouldWarnOwner: só o dono, só na passagem para falhou', () => {
  assert.equal(shouldWarnOwner(OWNER, 'ok', 'falhou'), true);
  assert.equal(shouldWarnOwner(OWNER, undefined, 'falhou'), true);
  assert.equal(shouldWarnOwner(OWNER, 'falhou', 'falhou'), false);
  assert.equal(shouldWarnOwner(OWNER, 'falhou', 'ok'), false);
  assert.equal(shouldWarnOwner('outro-cliente', 'ok', 'falhou'), false);
  assert.match(storeDownNotice('mercadolivre', 'Sessão expirada').title, /^Mercado Livre desconectou/);
});
