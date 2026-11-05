import { describe, it, expect } from 'vitest';
import { buildWhatsAppMessage, DEFAULT_TEMPLATE } from '../src/lib/server/message-builder';
import { generateSmartHook, detectProductCategory } from '../src/lib/server/hook-generator';
import { isPromotionalHookLine, extractTitleFromProductUrl } from '../src/lib/server/copier-service';
import { resolveUrlSafely, detectStoreFromUrl } from '../src/lib/server/url-resolver';

describe('Correção Definitiva do Sistema de Ofertas e Formatação', () => {
  it('deve formatar oferta de Tênis (Calçado) sem palavras proibidas, com nome obrigatório e desconto limpo', () => {
    const message = buildWhatsAppMessage({
      title: 'Tênis Adidas Ultimashow 2.0 Masculino',
      originalPrice: 379.99,
      currentPrice: 179.99,
      currentPriceCondition: 'no Pix',
      ouPriceText: 'Ou R$ 199,99 em até 2x',
      discountPct: 53,
      affiliateUrl: 'https://meli.la/1pSJLhP',
    });

    // 1. Nome do produto obrigatório
    expect(message).toContain('*Tênis Adidas Ultimashow 2.0 Masculino*');

    // 2. Sem termos proibidos
    expect(message.toLowerCase()).not.toContain('achado');
    expect(message.toLowerCase()).not.toContain('achadinho');
    expect(message.toLowerCase()).not.toContain('achados');
    expect(message.toLowerCase()).not.toContain('achadinhos');
    expect(message.toLowerCase()).not.toContain('por apenas');

    // 3. Preço e Desconto
    expect(message).toContain('De: ~R$ 379,99~');
    expect(message).toContain('🔥 *Por R$ 179,99 no Pix* (53% OFF)');
    expect(message).not.toContain('((-');
    expect(message).not.toContain('(-');

    // 4. Exatamente 1 gancho no topo
    const lines = message.split('\n');
    expect(lines[0]).toMatch(/OFERTA ESPECIAL|TÊNIS|CALÇADO|DESCONTO|OPORTUNIDADE/i);
  });

  it('deve formatar oferta de Caixa de Som sem duplicidade de ganchos e com título preservado', () => {
    const message = buildWhatsAppMessage({
      title: 'Caixa de Som JBL Flip 6 Bluetooth Prova dÁgua',
      originalPrice: 849.00,
      currentPrice: 599.00,
      currentPriceCondition: 'no Pix',
      discountPct: 29,
      affiliateUrl: 'https://amzn.to/3som123',
    });

    expect(message).toContain('*Caixa de Som JBL Flip 6 Bluetooth Prova dÁgua*');
    expect(message.toLowerCase()).not.toContain('por apenas');
    expect(message.toLowerCase()).not.toContain('achado');
    expect(message).toContain('🔥 *Por R$ 599,00 no Pix* (29% OFF)');
  });

  it('deve formatar oferta de Creatina (Suplemento) com foco direto e clareza', () => {
    const message = buildWhatsAppMessage({
      title: 'Creatina Monohidratada 100% Pura 300g Max Titanium',
      originalPrice: 119.90,
      currentPrice: 79.90,
      discountPct: 33,
      couponCode: 'SUPLE10',
      affiliateUrl: 'https://shope.ee/creatina123',
    });

    expect(message).toContain('*Creatina Monohidratada 100% Pura 300g Max Titanium*');
    expect(message).toContain('De: ~R$ 119,90~');
    expect(message).toContain('🔥 *Por R$ 79,90* (33% OFF)');
    expect(message).toContain('🎟️ Cupom: *SUPLE10*');
    expect(message.toLowerCase()).not.toContain('por apenas');
  });

  it('deve formatar oferta de Smartphone de forma profissional', () => {
    const message = buildWhatsAppMessage({
      title: 'Smartphone Samsung Galaxy A55 5G 128GB',
      originalPrice: 2499.00,
      currentPrice: 1699.00,
      currentPriceCondition: 'no Pix',
      ouPriceText: 'Ou R$ 1.849,00 em até 10x sem juros',
      discountPct: 32,
      affiliateUrl: 'https://meli.la/galaxy123',
    });

    expect(message).toContain('*Smartphone Samsung Galaxy A55 5G 128GB*');
    expect(message).toContain('De: ~R$ 2.499,00~');
    expect(message).toContain('🔥 *Por R$ 1.699,00 no Pix* (32% OFF)');
    expect(message).toContain('💳 *Ou R$ 1.849,00 em até 10x sem juros*');
  });

  it('deve formatar oferta de Perfume sem ganchos exagerados ou piadas artificiais', () => {
    const message = buildWhatsAppMessage({
      title: 'Perfume Masculino Asad Lattafa Eau de Parfum 100ml',
      originalPrice: 329.90,
      currentPrice: 189.90,
      discountPct: 42,
      affiliateUrl: 'https://meli.la/asad123',
    });

    expect(message).toContain('*Perfume Masculino Asad Lattafa Eau de Parfum 100ml*');
    expect(message).toContain('🔥 *Por R$ 189,90* (42% OFF)');
    expect(message.toLowerCase()).not.toContain('por apenas');
    expect(message.toLowerCase()).not.toContain('achado');
  });

  it('deve sanitizar template antigo contendo "Por apenas" e "(({desconto}))"', () => {
    const oldTemplate = `{gancho}\n\n*{titulo}*\n\n{preco_de}\n🔥 *Por apenas {preco_por}* (({desconto}))\n{preco_ou}\n\n🛒 Compre:\n{link}\n\n{marca_dagua}`;
    const message = buildWhatsAppMessage({
      templateText: oldTemplate,
      title: 'Tênis Esportivo Casual',
      originalPrice: 200,
      currentPrice: 100,
      discountPct: 50,
      affiliateUrl: 'https://meli.la/test',
    });

    expect(message).toContain('Por R$ 100,00');
    expect(message).not.toContain('Por apenas');
    expect(message).toContain('(50% OFF)');
    expect(message).not.toContain('((');
  });

  it('deve detectar slogans e frases promocionais no isPromotionalHookLine', () => {
    expect(isPromotionalHookLine('CHEGA DE LUTAR COM O CALÇADO NA HORA DE SAIR')).toBe(true);
    expect(isPromotionalHookLine('PRA QUEM GOSTA DE TREINAR COM SWOOSH ATÉ NOS PÉS!')).toBe(true);
    expect(isPromotionalHookLine('ACHADO LEGAL PRA QUEM CURTE ROUPA BOA SEM PAGAR CARO!')).toBe(true);
    expect(isPromotionalHookLine('MICROFIBRA E PRATICIDADE PRA ACOMPANHAR A ROTINA')).toBe(true);
    expect(isPromotionalHookLine('TAVA FALTANDO UM NIKE NOVO NA SAPATEIRA? OLHA ESSE!')).toBe(true);

    // Linha real de produto NÃO deve ser tratada como hook
    expect(isPromotionalHookLine('Tênis Puma X-Ray 2 Square Bdp')).toBe(false);
    expect(isPromotionalHookLine('Tênis Adidas Ultimashow 2.0')).toBe(false);
    expect(isPromotionalHookLine('Compressor De Ar Portátil Para Carro 12V')).toBe(false);
  });

  it('deve extrair o título limpo do produto a partir de slugs de URL de lojas', () => {
    const urlMeli = 'https://www.mercadolivre.com.br/pulverizador-eletrico-snow-foam-para-carro-moto-e-jardim-2-l/p/MLB78626582';
    expect(extractTitleFromProductUrl(urlMeli)).toContain('Pulverizador Eletrico Snow Foam');

    const urlNetshoes = 'https://www.netshoes.com.br/p/tenis-puma-xray-2-square-bdp-branco+cinza-NWG-1344-158';
    expect(extractTitleFromProductUrl(urlNetshoes)).toContain('Tenis Puma Xray 2 Square Bdp');
  });

  it('deve reconhecer corretamente os domínios das lojas suportadas', () => {
    expect(detectStoreFromUrl('https://tr.ee/uyK4TO')).toBe(null); // encurtador antes de resolver
    expect(detectStoreFromUrl('https://www.netshoes.com.br/p/tenis-xyz')).toBe('netshoes');
    expect(detectStoreFromUrl('https://click.linksynergy.com/deeplink?mid=43984&murl=https%3A%2F%2Fwww.netshoes.com.br')).toBe('netshoes');
    expect(detectStoreFromUrl('https://link.amazon/B08ODFFRI')).toBe('amazon');
    expect(detectStoreFromUrl('https://amzlinks.in/B08ODFFRI')).toBe('amazon');
    expect(detectStoreFromUrl('https://www.amazon.com.br/dp/B08ODFFRI')).toBe('amazon');
    expect(detectStoreFromUrl('https://meli.la/1pSJLhP')).toBe('mercadolivre');
    expect(detectStoreFromUrl('https://shope.ee/123')).toBe('shopee');
  });
});
