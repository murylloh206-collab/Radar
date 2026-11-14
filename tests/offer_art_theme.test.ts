import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArtTheme, contrastRatio } from '../src/lib/server/offer-art/theme';

test('cor inválida usa o ciano padrão do Radar', () => {
  assert.equal(buildArtTheme('banana', 'dark').accent.toUpperCase(), '#1CCAF2');
});

test('fundo escuro: textos legíveis', () => {
  for (const accent of ['#1CCAF2', '#FF7A1A', '#FF3D8B', '#2ECC71', '#FFFF66', '#1A1A80']) {
    const t = buildArtTheme(accent, 'dark');
    assert.ok(contrastRatio(t.text, t.background.mid) >= 4.5, `${accent} texto`);
    assert.ok(contrastRatio(t.accentText, t.background.mid) >= 3, `${accent} destaque`);
    assert.ok(contrastRatio(t.onAccent, t.accent) >= 4.5, `${accent} texto sobre o selo`);
  }
});

test('fundo claro com cor muito clara continua legível', () => {
  const t = buildArtTheme('#FFFF66', 'light');
  assert.ok(contrastRatio(t.text, t.background.mid) >= 4.5);
  assert.ok(contrastRatio(t.accentText, t.background.mid) >= 3);
  assert.ok(contrastRatio(t.onAccent, t.accent) >= 4.5);
});

test('cada cor gera um fundo diferente', () => {
  const blue = buildArtTheme('#1CCAF2', 'dark').background.mid;
  const orange = buildArtTheme('#FF7A1A', 'dark').background.mid;
  const pink = buildArtTheme('#FF3D8B', 'dark').background.mid;
  assert.notEqual(blue, orange);
  assert.notEqual(orange, pink);
});

test('fundo claro é claro e fundo escuro é escuro', () => {
  assert.ok(contrastRatio(buildArtTheme('#FF7A1A', 'light').background.mid, '#000000') > 12);
  assert.ok(contrastRatio(buildArtTheme('#FF7A1A', 'dark').background.mid, '#FFFFFF') > 12);
});
