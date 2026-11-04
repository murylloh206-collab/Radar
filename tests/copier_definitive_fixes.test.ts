import test from 'node:test';
import assert from 'node:assert/strict';
import { getOfficialWatermarkBadge, convertHandleToVectorPath } from '../src/lib/server/watermark-vector';
import { validateJobForDispatch } from '../src/lib/server/job-validator';
import { isPromotionalHookLine } from '../src/lib/server/copier-service';
import { generateSmartHook, detectProductCategory } from '../src/lib/server/hook-generator';
import { buildWhatsAppMessage } from '../src/lib/server/message-builder';
import type { DatabaseSchema, PublicationJob } from '../src/types';

test('1. MARCA D\'ÁGUA VETORIAL: Imune a ausência de fontes no SO, sem tofu/quadrado amarelo', async () => {
  // Teste de extração vetorial de caracteres
  const { pathData, width } = convertHandleToVectorPath('@radar.ofertas.br1', 50, 20, 17.5);
  assert.ok(pathData.length > 20, 'Deve gerar comandos de caminho vetorial');
  assert.ok(width > 50, 'Largura calculada do texto deve ser positiva');
  assert.ok(!pathData.includes('<text'), 'Path data não deve conter tags HTML/SVG');

  // Teste de geração do badge completo
  const badge = await getOfficialWatermarkBadge({ targetWidth: 320 });
  assert.ok(badge, 'Badge deve ser retornado');
  assert.ok(Buffer.isBuffer(badge.buffer), 'Badge buffer deve ser um Buffer válido');
  assert.ok(badge.buffer.length > 500, 'Badge buffer deve conter bytes reais de PNG');
  assert.ok(badge.width >= 180 && badge.width <= 320, `Largura do badge deve ser compacta: ${badge.width}`);
  assert.ok(badge.height >= 40 && badge.height <= 65, `Altura do badge deve ser proporcional: ${badge.height}`);
});

test('2. SEGURANÇA DE IMAGEM: NUNCA despachar oferta sem fotografia quando o fluxo exige imagem', () => {
  const mockDb: DatabaseSchema = {
    groups: [
      {
        id: 'grp-1',
        groupJid: '120363000@g.us',
        name: 'Grupo Radar Oficial',
        permissionStatus: 'verified_admin',
        canPost: true,
        createdAt: new Date().toISOString(),
      },
    ],
    stores: [
      {
        id: 'store-1',
        storeName: 'amazon',
        affiliateTag: 'radar-20',
        isActive: true,
        createdAt: new Date().toISOString(),
      } as any,
    ],
    credentials: [],
    jobs: [],
    history: [],
    scheduledMessages: [],
  };

  // Cenário: Job configurado como 'image', mas mediaUrl ausente/vazia
  const invalidJob: PublicationJob = {
    id: 'job-sem-imagem-123',
    targetJid: '120363000@g.us',
    messageText: '🔥 Oferta imperdível da Caixa de Som Bluetooth JBL Partybox!',
    mediaUrl: '',
    mediaType: 'image',
    affiliateUrl: 'https://www.amazon.com.br/dp/B08X?tag=radar-20',
    status: 'pronto',
    createdAt: new Date().toISOString(),
    isDemo: false,
  };

  const validation = validateJobForDispatch(invalidJob, mockDb);
  assert.equal(validation.valid, false, 'Job com mediaType=image e mediaUrl vazia deve ser REJEITADO');
  assert.match(validation.error || '', /Oferta exige imagem, mas a fotografia processada não está disponível/);

  // Cenário positivo: com imagem válida
  const validJob: PublicationJob = {
    ...invalidJob,
    mediaUrl: 'https://m.media-amazon.com/images/I/71xyz.jpg',
  };
  const validValidation = validateJobForDispatch(validJob, mockDb);
  assert.equal(validValidation.valid, true, 'Job com fotografia válida deve ser APROVADO');
});

test('3. REJEIÇÃO DE GANCHO DUPLO: Detecta e descarta ganchos promocionais para preservar o título real', () => {
  // Slogans e ganchos promocionais encontrados em grupos que NÃO devem ser usados como título de produto
  assert.equal(isPromotionalHookLine('UM DESCONTO INTERESSANTE PRA VOCÊ CURTIR O FINAL DE SEMANA'), true);
  assert.equal(isPromotionalHookLine('QUANDO A CAIXA DE SOM VIRA A DONA DA FESTA!'), true);
  assert.equal(isPromotionalHookLine('🔥 OLHA ESSE PREÇO IMPERDÍVEL!'), true);
  assert.equal(isPromotionalHookLine('🚨 BAIXOU O PREÇO CORRE!'), true);
  assert.equal(isPromotionalHookLine('DE R$ 999 POR R$ 499'), true);
  assert.equal(isPromotionalHookLine('SUPER OFERTA EXCLUSIVA DO DIA!'), true);

  // Nomes reais de produtos NUNCA devem ser descartados
  assert.equal(isPromotionalHookLine('Caixa de Som Bluetooth JBL Partybox 110 160W'), false);
  assert.equal(isPromotionalHookLine('Perfume Versace Eros Eau de Toilette Masculino 100ml'), false);
  assert.equal(isPromotionalHookLine('Smartphone Samsung Galaxy S24 Ultra 256GB'), false);
});

test('4. FORMATAÇÃO DEFINITIVA DE MENSAGEM: Gancho único, título dedicado, desconto limpo e WhatsApp styling', () => {
  const result = buildWhatsAppMessage({
    title: 'Caixa de Som Bluetooth JBL Partybox 110',
    originalPrice: 1899.00,
    currentPrice: 1249.00,
    currentPriceCondition: 'no Pix',
    discountPct: 34,
    couponCode: 'FESTA10',
    affiliateUrl: 'https://amzn.to/exemplo',
  });

  // 1. Gancho contextual único presente no topo
  assert.match(result, /🔥 .+/);

  // 2. Título em linha dedicada e limpa
  assert.match(result, /\*Caixa de Som Bluetooth JBL Partybox 110\*/);

  // 3. Preço DE riscado com ~
  assert.match(result, /De: ~R\$\s*1\.899,00~/);

  // 4. Preço POR com indicação de Pix confirmada
  assert.match(result, /Por R\$\s*1\.249,00 no Pix/);

  // 5. Desconto limpo: "34% OFF" SEM sinal negativo (-) e SEM duplo parênteses (())
  assert.match(result, /34% OFF/);
  assert.ok(!result.includes('-34% OFF'), 'Não deve ter sinal negativo no desconto');
  assert.ok(!result.includes('((-'), 'Não deve ter parênteses duplos');

  // 6. Cupom formatado
  assert.match(result, /🎟️ Cupom: \*FESTA10\*/);

  // 7. Link com CTA claro
  assert.match(result, /https:\/\/amzn\.to\/exemplo/);

  // 8. Assinatura oficial do Radar
  assert.match(result, /🎯 Radar de Ofertas/);
});

test('5. AUDITORIA DE TERMOS PROIBIDOS E DETECÇÃO DE CATEGORIA: Sem achado, achadinho ou achadinhos', () => {
  const categoriaCaixa = detectProductCategory('Caixa de Som Bluetooth Portátil');
  assert.equal(categoriaCaixa, 'caixa_de_som');

  const hookCaixaDeSom = generateSmartHook('Caixa de Som JBL Partybox', { discountPct: 35 });
  const hookGeral = generateSmartHook('Perfume Versace Eros', { discountPct: 40 });

  for (const hook of [hookCaixaDeSom, hookGeral]) {
    assert.ok(!hook.toLowerCase().includes('achado'), `Gancho não deve conter 'achado': "${hook}"`);
    assert.ok(!hook.toLowerCase().includes('achadinho'), `Gancho não deve conter 'achadinho': "${hook}"`);
    assert.ok(!hook.toLowerCase().includes('achadinhos'), `Gancho não deve conter 'achadinhos': "${hook}"`);
  }
});
