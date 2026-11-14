import test from 'node:test';
import assert from 'node:assert/strict';
import { computeArtLayout } from '../src/lib/server/offer-art/render';

test('arte padrão escreve "De" no preço antigo e "Por" no preço atual', () => {
  const L = computeArtLayout({ format: 'story', title: 'Bomba Elétrica Portátil Digital', current: 103, original: 199, coupon: 'PROMOAGORAML' });
  assert.equal(L.oldPriceText, 'De R$ 199,00');
  assert.equal(L.porLabel, 'Por');
  const sem = computeArtLayout({ format: 'story', title: 'X', current: 50 });
  assert.equal(sem.oldPriceText, null);
  assert.equal(sem.porLabel, 'Por');
});

test('story sem espaço sobrando: foto maior e rodapé logo após o conteúdo', () => {
  const L = computeArtLayout({ format: 'story', title: 'Bomba Elétrica Portátil Digital', current: 103, original: 199, coupon: 'PROMOAGORAML' });
  assert.ok(L.stageH >= 900, `palco da foto deveria ter >= 900px, tem ${L.stageH}`);
  const gapBelowContent = L.dividerY - Math.max(L.priceBottom, L.coupon?.bottom || 0);
  assert.ok(gapBelowContent <= 80, `vão entre o conteúdo e o rodapé deveria ser pequeno, é ${gapBelowContent}`);
});
