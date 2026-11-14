import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWhatsAppMessage } from '../src/lib/message-builder';

test('cupom "ACHADO" sai exatamente como veio (não vira "ofertas")', () => {
  const msg = buildWhatsAppMessage({ title: 'Camiseta Vans Determined', currentPrice: 60, originalPrice: 129, affiliateUrl: 'https://click.linksynergy.com/x', couponCode: 'ACHADO' } as any);
  assert.match(msg, /Cupom: \*ACHADO\*/);
  assert.doesNotMatch(msg, /Cupom: \*ofertas\*/i);
});

test('link com "achados" no endereço não é alterado', () => {
  const url = 'https://shopee.com.br/m/achados-do-dia';
  const msg = buildWhatsAppMessage({ title: 'Produto bom', currentPrice: 10, affiliateUrl: url } as any);
  assert.ok(msg.includes(url));
});
