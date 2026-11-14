import test from 'node:test';
import assert from 'node:assert/strict';
import { storeStatusLabel } from '../src/lib/store-status-labels';

const NOW = new Date('2026-11-14T15:00:00Z'); // 12:00 em Brasília

test('ok testado hoje mostra a hora de Brasília', () => {
  const l = storeStatusLabel({ store: 'mercadolivre', status: 'ok', reason: null, lastCheckedAt: '2026-11-14T11:05:00Z', hint: null }, NOW);
  assert.deepEqual(l, { emoji: '✅', title: 'Conectado', detail: 'Testado hoje às 08:05' });
});

test('ok testado em outro dia mostra a data', () => {
  const l = storeStatusLabel({ store: 'shopee', status: 'ok', reason: null, lastCheckedAt: '2026-11-13T22:30:00Z', hint: null }, NOW);
  assert.equal(l.detail, 'Testado em 13/11 às 19:30');
});

test('falhou mostra o motivo', () => {
  const l = storeStatusLabel({ store: 'mercadolivre', status: 'falhou', reason: 'Sessão do Mercado Livre expirou. Reconecte pela extensão.', lastCheckedAt: null, hint: null }, NOW);
  assert.deepEqual(l, { emoji: '❌', title: 'Falhou', detail: 'Sessão do Mercado Livre expirou. Reconecte pela extensão.' });
});

test('Amazon sem API e loja não configurada', () => {
  assert.deepEqual(storeStatusLabel({ store: 'amazon', status: 'sem_teste', reason: null, lastCheckedAt: null, hint: null }, NOW),
    { emoji: '🟡', title: 'Tag salva', detail: 'A Amazon não permite teste sem API' });
  assert.deepEqual(storeStatusLabel({ store: 'shopee', status: 'nao_configurado', reason: null, lastCheckedAt: null, hint: null }, NOW),
    { emoji: '⚪', title: 'Não configurado', detail: 'Conecte pela extensão' });
});
