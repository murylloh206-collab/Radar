import test from 'node:test';
import assert from 'node:assert/strict';
import { pickRotationGroup, rotationQueue } from '../src/lib/server/group-rotation';

const g = (name: string, participantCount: number) => ({ groupJid: `${name.length}${participantCount}@g.us`, name, participantCount });

test('rotationQueue: só grupos terminados em #N, ordem numérica', () => {
  const q = rotationQueue([g('Radar #10', 1), g('Radar Ofertas', 5), g('Radar #2', 1), g('Grupo #3 VIP', 1), g('Radar # 1', 1)], 'Radar');
  assert.deepEqual(q.map(x => x.number), [1, 2, 10]);
});

test('rotationQueue: grupos de terceiros com #N ficam fora (prefixo padrão)', () => {
  const q = rotationQueue([g('Radar de Ofertas #14', 8), g('Gaby Garimpou #11', 782), g('Will Garimpou | TCG #52', 566), g('radar de ofertas  #15', 3)]);
  assert.deepEqual(q.map(x => x.number), [14, 15]);
});

test('pickRotationGroup: primeiro com vaga, enche um por vez', () => {
  const q = rotationQueue([g('Radar de Ofertas #1', 800), g('Radar de Ofertas #2', 10), g('Radar de Ofertas #3', 0)]);
  assert.equal(pickRotationGroup(q, 800, 700)?.group.number, 2);
});

test('pickRotationGroup: todos cheios usa o último e pede grupo novo', () => {
  const q = rotationQueue([g('Radar de Ofertas #1', 900), g('Radar de Ofertas #2', 801)]);
  const r = pickRotationGroup(q, 800, 700);
  assert.equal(r?.group.number, 2);
  assert.equal(r?.needsNew, true);
});

test('pickRotationGroup: aviso a partir de 700 no último', () => {
  assert.equal(pickRotationGroup(rotationQueue([g('Radar de Ofertas #1', 800), g('Radar de Ofertas #2', 700)]), 800, 700)?.needsNew, true);
  assert.equal(pickRotationGroup(rotationQueue([g('Radar de Ofertas #1', 800), g('Radar de Ofertas #2', 699)]), 800, 700)?.needsNew, false);
});

test('pickRotationGroup: fila vazia → null', () => {
  assert.equal(pickRotationGroup([], 800, 700), null);
});
