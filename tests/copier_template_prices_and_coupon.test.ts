import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOfferDetailsFromWhatsAppText } from '../src/lib/server/copier-service';
import { buildWhatsAppMessage, DEFAULT_TEMPLATE } from '../src/lib/server/message-builder';

test('1. Extração fiel de De, Por, Ou e Cupom em mensagem do WhatsApp', () => {
  const rawMsg = `Zaad Mondo Eau De Parfum 95ml O Boticário

~De R$ 349,99~
*Por R$ 236,21 no Pix*
*Ou R$ 277,90 em até 6x*

\`🔖Utilize o Cupom: OFERTADEZ\`

🛒 Link do Produto ⤵️ 
https://meli.la/18VKZfS`;

  const details = extractOfferDetailsFromWhatsAppText(rawMsg, 'mercadolivre');

  assert.equal(details.originalPrice, 349.99);
  assert.equal(details.currentPrice, 236.21);
  assert.equal(details.currentPriceCondition, 'no Pix');
  assert.equal(details.ouText, 'Ou R$ 277,90 em até 6x');
  assert.equal(details.couponCode, 'OFERTADEZ');
  assert.equal(details.discountPct, 33);
});

test('2. Extração de mensagem com parcelamento sem cupom', () => {
  const rawMsg = `iPhone 16e (128 GB)

~De R$ 5.999,99~
*Por R$ 3.149,00 no Pix*
*Ou R$ 3.499,00 em até 10x*

🛒 Link do Produto ⤵️
https://meli.la/2JNZJ5b`;

  const details = extractOfferDetailsFromWhatsAppText(rawMsg, 'mercadolivre');

  assert.equal(details.originalPrice, 5999.99);
  assert.equal(details.currentPrice, 3149.00);
  assert.equal(details.currentPriceCondition, 'no Pix');
  assert.equal(details.ouText, 'Ou R$ 3.499,00 em até 10x');
  assert.equal(details.couponCode, undefined);
  assert.equal(details.discountPct, 48);
});

test('3. Extração de mensagem com cupom sem parcelamento', () => {
  const rawMsg = `Tênis Kappa Kontroll 2.0 

~De R$ 399,99~
*Por R$ 202,49*

\`🔖Utilize o Cupom: KAPPAOFERTAS\`

🛒 Link do Produto ⤵️
https://meli.la/2ZddUHW`;

  const details = extractOfferDetailsFromWhatsAppText(rawMsg, 'mercadolivre');

  assert.equal(details.originalPrice, 399.99);
  assert.equal(details.currentPrice, 202.49);
  assert.equal(details.couponCode, 'KAPPAOFERTAS');
  assert.equal(details.ouText, undefined);
  assert.equal(details.discountPct, 49);
});

test('4. Template renderiza De, Por, Ou e Cupom sem repetições nem linhas vazias', () => {
  const rendered = buildWhatsAppMessage({
    templateText: DEFAULT_TEMPLATE,
    title: 'Zaad Mondo Eau De Parfum 95ml O Boticário',
    originalPrice: 349.99,
    currentPrice: 236.21,
    currentPriceCondition: 'no Pix',
    ouPriceText: 'Ou R$ 277,90 em até 6x',
    couponCode: 'OFERTADEZ',
    discountPct: 33,
    affiliateUrl: 'https://meli.la/meu-afiliado',
    hookText: '⚡ *SUPER OFERTA EXCLUSIVA!*',
    watermarkText: '🎯 Radar de Ofertas',
  });

  assert.match(rendered, /De: ~R\$\s*349,99~/);
  assert.match(rendered, /Por R\$\s*236,21 no Pix/);
  assert.match(rendered, /33% OFF/);
  assert.doesNotMatch(rendered, /-33% OFF/);
  assert.doesNotMatch(rendered, /\(\(/);
  assert.match(rendered, /💳 \*Ou R\$\s*277,90 em até 6x\*/);
  assert.match(rendered, /🎟️ Cupom: \*OFERTADEZ\*/);
  assert.match(rendered, /https:\/\/meli\.la\/meu-afiliado/);
  assert.match(rendered, /🎯 Radar de Ofertas/);
  assert.doesNotMatch(rendered, /\{preco_de\}/);
  assert.doesNotMatch(rendered, /\{preco_ou\}/);
  assert.doesNotMatch(rendered, /\{cupom\}/);
});

test('5. Template limpa tags ausentes quando não há cupom nem ou', () => {
  const rendered = buildWhatsAppMessage({
    templateText: DEFAULT_TEMPLATE,
    title: 'Produto Simples',
    originalPrice: 100,
    currentPrice: 80,
    discountPct: 20,
    affiliateUrl: 'https://meli.la/link',
  });

  assert.match(rendered, /De: ~R\$\s*100,00~/);
  assert.match(rendered, /Por R\$\s*80,00/);
  assert.match(rendered, /20% OFF/);
  assert.doesNotMatch(rendered, /-20% OFF/);
  assert.doesNotMatch(rendered, /Cupom/);
  assert.doesNotMatch(rendered, /💳/);
  assert.doesNotMatch(rendered, /\{preco_ou\}/);
  assert.doesNotMatch(rendered, /\{cupom\}/);
});
