import test from 'node:test';
import assert from 'node:assert/strict';
import { textPath, wrapText, measureText } from '../src/lib/server/offer-art/text';

test('texto vira vetor (path), nunca <text>', () => {
  const out = textPath('Oferta #128', { x: 10, y: 50, size: 40, weight: 800, fill: '#fff' });
  assert.match(out.svg, /<path /);
  assert.ok(!out.svg.includes('<text'));
  assert.ok(out.width > 100);
});

test('largura cresce com o texto', () => {
  assert.ok(measureText('Promoção imperdível', 40, 700) > measureText('Promo', 40, 700));
});

test('acentos e cedilha geram contorno', () => {
  const out = textPath('Ação Câmera Ímã', { x: 0, y: 40, size: 40, weight: 700, fill: '#000' });
  assert.match(out.svg, /d="M/);
});

test('âncora central desloca o texto para a esquerda', () => {
  const start = textPath('Centro', { x: 500, y: 50, size: 40, weight: 700, fill: '#000' });
  const middle = textPath('Centro', { x: 500, y: 50, size: 40, weight: 700, fill: '#000', anchor: 'middle' });
  assert.notEqual(start.svg, middle.svg);
});

test('título longo quebra em linhas e termina com reticências', () => {
  const title = 'Kit Completo de Panelas Antiaderentes Tramontina Paris com 10 Peças Revestimento Starflon Max e Tampas de Vidro Temperado Vermelho';
  const lines = wrapText(title, { size: 44, weight: 700, maxWidth: 900, maxLines: 2 });
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…'));
  for (const line of lines) assert.ok(measureText(line, 44, 700) <= 900);
});

test('emoji e caracteres fora da fonte não quebram a renderização', () => {
  const out = textPath('Tênis 🔥 Nike', { x: 0, y: 40, size: 40, weight: 700, fill: '#000' });
  assert.match(out.svg, /<path /);
});
