import test from 'node:test';
import assert from 'node:assert/strict';
import { countDistinctOffers, offerKey } from '../src/lib/server/daily-sent-counter';

test('1 oferta enviada a 5 grupos conta como 1 post', () => {
  const copies = ['g1', 'g2', 'g3', 'g4', 'g5'].map((g, i) => ({ id: `job-${i}`, runtime_inbox_id: 'oferta-A' }));
  assert.equal(countDistinctOffers(copies), 1);
  assert.equal(countDistinctOffers([...copies, { id: 'x', runtimeInboxId: 'oferta-B' }]), 2);
});

test('sem evento do copiador usa a mensagem de origem e, por último, o próprio envio', () => {
  assert.equal(offerKey({ id: 'j1', incomingMessageId: 'm1' }), 'm1');
  assert.equal(offerKey({ id: 'j2' }), 'j2');
  assert.equal(countDistinctOffers([{ id: 'a' }, { id: 'b' }, { id: 'c', incoming_message_id: 'm' }, { id: 'd', incoming_message_id: 'm' }]), 3);
});
