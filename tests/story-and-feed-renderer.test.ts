import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePricingDetails, parsePriceToNumber } from '../src/lib/server/story-renderer';

test('Story and Feed Renderer: Cálculo automático de desconto com preços reais', () => {
  // Caso 1: R$ 299,90 por R$ 179,90 -> exatamente 40% OFF
  const res1 = calculatePricingDetails('299,90', '179,90');
  assert.equal(res1.hasDiscount, true);
  assert.equal(res1.discountPct, 40);
  assert.equal(res1.discountLabel, '40% OFF');
  assert.equal(res1.priceOriginalFormatted, 'R$ 299,90');
  assert.equal(res1.priceCurrentFormatted, 'R$ 179,90');

  // Caso 2: Smartphone de R$ 5.999,00 por R$ 3.899,00 -> 35% OFF
  const res2 = calculatePricingDetails('5.999,00', '3.899,00');
  assert.equal(res2.hasDiscount, true);
  assert.equal(res2.discountPct, 35);
  assert.equal(res2.discountLabel, '35% OFF');
  assert.equal(res2.priceOriginalFormatted, 'R$ 5.999,00');
  assert.equal(res2.priceCurrentFormatted, 'R$ 3.899,00');

  // Caso 3: Produto sem preço original (apenas por R$ 89,90)
  const res3 = calculatePricingDetails(undefined, '89,90');
  assert.equal(res3.hasDiscount, false);
  assert.equal(res3.priceOriginalFormatted, null);
  assert.equal(res3.priceCurrentFormatted, 'R$ 89,90');

  // Caso 4: Preço promocional igual ao original (R$ 100,00 por R$ 100,00)
  const res4 = calculatePricingDetails('100,00', '100,00');
  assert.equal(res4.hasDiscount, false);
  assert.equal(res4.priceOriginalFormatted, null);
  assert.equal(res4.priceCurrentFormatted, 'R$ 100,00');
});

test('Story and Feed Renderer: Parser de números brasileiros', () => {
  assert.equal(parsePriceToNumber('1.299,90'), 1299.9);
  assert.equal(parsePriceToNumber('R$ 349,00'), 349.0);
  assert.equal(parsePriceToNumber('79.90'), 79.9);
  assert.equal(parsePriceToNumber('150'), 150);
  assert.equal(parsePriceToNumber(undefined), null);
});
