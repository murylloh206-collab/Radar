import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOfferDetailsFromWhatsAppText } from '../src/lib/server/copier-service';

test('formato novo da origem: "De R$409 | Por *R$227* 💵" na mesma linha', () => {
  const text = 'Perfume Ralph Lauren Polo Sport 100ml\n\nDe R$409 | Por *R$227* 💵\n\n🛒 Achado no Mercado Livre\n👉 https://meli.la/abc';
  const r = extractOfferDetailsFromWhatsAppText(text, 'mercadolivre');
  assert.equal(r.originalPrice, 409);
  assert.equal(r.currentPrice, 227);
});

test('variações: negrito, itálico, centavos e milhar no "Por"', () => {
  assert.equal(extractOfferDetailsFromWhatsAppText('De R$ 1.299,90 | Por _R$ 999,90_', 'x').currentPrice, 999.9);
  assert.equal(extractOfferDetailsFromWhatsAppText('De R$239 | Por *R$69*', 'x').currentPrice, 69);
  assert.equal(extractOfferDetailsFromWhatsAppText('De R$239 | *Por R$69*', 'x').currentPrice, 69);
});

test('formatos antigos continuam funcionando', () => {
  const a = extractOfferDetailsFromWhatsAppText('~De R$ 349,99~\n*Por R$ 236,21 no Pix*', 'x');
  assert.equal(a.originalPrice, 349.99);
  assert.equal(a.currentPrice, 236.21);
  assert.equal(a.currentPriceCondition, 'no Pix');
  assert.equal(extractOfferDetailsFromWhatsAppText('Produto X\nR$ 59,90', 'x').currentPrice, 59.9);
});
