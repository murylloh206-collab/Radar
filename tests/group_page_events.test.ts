import test from 'node:test';
import assert from 'node:assert/strict';
import { clickNotice, isBot, sourceOf, startOfTodayBrt, visitorCode } from '../src/lib/server/group-page-events';

test('robôs e prévias de link não contam', () => {
  assert.equal(isBot('facebookexternalhit/1.1'), true);
  assert.equal(isBot('WhatsApp/2.23'), true);
  assert.equal(isBot(''), true);
  assert.equal(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Instagram 300.0'), false);
});

test('origem: utm primeiro, depois o site anterior', () => {
  assert.equal(sourceOf('Stories', 'https://l.instagram.com/'), 'stories');
  assert.equal(sourceOf(null, 'https://l.instagram.com/?u=x'), 'instagram');
  assert.equal(sourceOf(null, 'https://www.google.com/'), 'google');
  assert.equal(sourceOf(null, null), 'direto');
});

test('código do visitante muda por dia e não mostra o IP', () => {
  const a = visitorCode('1.2.3.4', 'ua', '2026-11-20', 's');
  assert.equal(a.length, 24);
  assert.ok(!a.includes('1.2.3.4'));
  assert.notEqual(a, visitorCode('1.2.3.4', 'ua', '2026-11-21', 's'));
  assert.equal(a, visitorCode('1.2.3.4', 'ua', '2026-11-20', 's'));
});

test('dia começa à meia-noite de Brasília', () => {
  assert.equal(startOfTodayBrt(Date.parse('2026-11-21T01:00:00Z')), '2026-11-20T03:00:00.000Z');
  assert.equal(startOfTodayBrt(Date.parse('2026-11-21T04:00:00Z')), '2026-11-21T03:00:00.000Z');
});

test('aviso do clique traz total do dia e taxa', () => {
  const n = clickNotice('instagram', 3, 12);
  assert.equal(n.title, 'Clique no grupo: 3º de hoje');
  assert.match(n.body, /veio de: instagram/);
  assert.match(n.body, /3 cliques e 12 visitas \(25% das visitas\)/);
});
