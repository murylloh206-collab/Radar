import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSmartHook, detectProductCategory } from '../src/lib/server/hook-generator';
import { buildWhatsAppMessage } from '../src/lib/server/message-builder';
import { sanitizeStoreUrl } from '../src/lib/server/affiliate-converter';

test('1. Gerador Inteligente de Ganchos: Identificação precisa de categorias', () => {
  assert.equal(detectProductCategory('Creatina Monohidratada 300g Max Titanium 100% Pura'), 'suplementos');
  assert.equal(detectProductCategory('Tênis Corrida Nike Air Zoom Pegasus 40 Masculino'), 'tenis');
  assert.equal(detectProductCategory('Smartphone Samsung Galaxy S24 Ultra 256GB 5G'), 'smartphones');
  assert.equal(detectProductCategory('Console PlayStation 5 Slim com 2 Contos DualSense'), 'games');
  assert.equal(detectProductCategory('Camisa Social Slim Fit Algodão Masculina'), 'roupas');
  assert.equal(detectProductCategory('Relógio Smartwatch Amazfit GTR 4 com GPS e AMOLED'), 'relogios');
  assert.equal(detectProductCategory('Perfume Importado Masculino Eau de Parfum 100ml'), 'perfumes');
  assert.equal(detectProductCategory('Parafusadeira Furadeira de Impacto 20V DeWalt com Bateria'), 'ferramentas');
  assert.equal(detectProductCategory('Fritadeira Sem Óleo Airfryer Philips Walita 4.1L Digital'), 'eletrodomesticos');
});

test('2. Gerador Inteligente de Ganchos: Ganchos contextuais e sem IA pesada', () => {
  assert.equal(detectProductCategory('Creatina Growth 250g'), 'suplementos');
  const hookSuplemento = generateSmartHook('Creatina Growth 250g', { discountPct: 25 });
  assert.ok(hookSuplemento.length > 10);
  assert.ok(typeof hookSuplemento === 'string');

  assert.equal(detectProductCategory('Tênis Asics Gel Nimbus 26'), 'tenis');
  const hookTenis = generateSmartHook('Tênis Asics Gel Nimbus 26', { discountPct: 30 });
  assert.ok(hookTenis.length > 10);
  assert.ok(typeof hookTenis === 'string');
});

test('3. Message Builder: Formatação profissional, validação de desconto e assinatura oficial', () => {
  const msg = buildWhatsAppMessage({
    title: 'Whey Protein Isolado 900g Dux Nutrition',
    affiliateUrl: 'https://meli.la/radar123',
    currentPrice: 159.90,
    originalPrice: 249.90,
    couponCode: 'DUX10',
  });

  // Valida que contém os campos obrigatórios
  assert.ok(msg.includes('Whey Protein Isolado 900g Dux Nutrition'));
  assert.ok(msg.includes('159,90'));
  assert.ok(msg.includes('249,90'));
  assert.ok(msg.includes('36% OFF')); // ((249.9 - 159.9) / 249.9) = 36%
  assert.ok(msg.includes('DUX10'));
  assert.ok(msg.includes('https://meli.la/radar123'));
  assert.ok(msg.includes('Radar de Ofertas'));

  // Não deve conter múltiplos emojis repetitivos nem texto de spam
  assert.ok(!msg.includes('🔥🔥🔥🔥'));
  assert.ok(!msg.includes('⚡⚡⚡⚡'));
  assert.ok(!msg.includes('[]')); // Sem caracteres tofu
});

test('4. Netshoes / LinkSynergy: Desempacotamento de murl e higienização de link de afiliado', () => {
  const incomingRakutenUrl = 'https://click.linksynergy.com/deeplink?id=TERCEIRO_ID&mid=43360&murl=https%3A%2F%2Fwww.netshoes.com.br%2Ftenis-nike-revolution-7-masculino-preto-JD8-3498-006%3Futm_source%3Dafiliados';
  
  const cleanUrl = sanitizeStoreUrl(incomingRakutenUrl, 'netshoes');
  
  // Deve extrair a URL pura da Netshoes sem o invólucro do terceiro
  assert.ok(cleanUrl.startsWith('https://www.netshoes.com.br/tenis-nike-revolution-7-masculino'));
  assert.ok(!cleanUrl.includes('click.linksynergy.com'));
  assert.ok(!cleanUrl.includes('TERCEIRO_ID'));
  assert.ok(!cleanUrl.includes('utm_source'));
});

test('5. Proteção contra descontos matematicamente absurdos', () => {
  // Preço original R$ 1000, atual R$ 10 -> 99% seria absurdo e não deve ser exibido como oferta real se desconfigurado
  const msgAbsurdo = buildWhatsAppMessage({
    title: 'Produto Teste',
    affiliateUrl: 'https://shope.ee/teste',
    currentPrice: 10.00,
    originalPrice: 1000.00,
  });
  // Se for maior que 95%, o builder não exibe desconto percentual absurdo
  assert.ok(!msgAbsurdo.includes('99% OFF'));
});
