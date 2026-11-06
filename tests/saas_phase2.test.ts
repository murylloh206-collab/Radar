import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { setDevTestPlan } from '../src/lib/server/plan-guard';
import {
  saveBrandSettings,
  resolveEffectiveWatermarkConfig,
} from '../src/lib/server/brand-settings';
import {
  getOfficialWatermarkBadge,
  computeWatermarkCoordinates,
} from '../src/lib/server/watermark-vector';
import {
  recordPriceHistory,
  evaluateRealDealBadge,
} from '../src/lib/server/price-history';

test('Fase 2 — Marca d’água: Impulse força padrão @radar.ofertas.br1 e Plus/Ultimate aplicam personalização', async () => {
  const testUser = 'admin';

  // 1. Mudar para Plus e salvar configurações personalizadas de marca d'água
  await setDevTestPlan('plus', 'mensal', testUser);
  await saveBrandSettings(testUser, {
    panelName: 'Ofertas Vip Teste',
    accentColor: '#10B981',
    watermarkEnabled: true,
    watermarkHandle: '@ofertas.vip.teste',
    watermarkPosition: 'custom',
    watermarkCustomX: 25,
    watermarkCustomY: 18,
    watermarkOpacity: 80,
    watermarkScale: 120,
    safeDispatchEnabled: true,
    safeDispatchDelaySec: 45,
    safeDispatchHourlyLimit: 30,
  });

  const plusEffective = await resolveEffectiveWatermarkConfig(testUser);
  assert.equal(plusEffective.isLockedToDefault, false);
  assert.equal(plusEffective.handle, '@ofertas.vip.teste');
  assert.equal(plusEffective.position, 'custom');
  assert.equal(plusEffective.customX, 25);
  assert.equal(plusEffective.customY, 18);
  assert.equal(plusEffective.opacity, 80);
  assert.equal(plusEffective.scale, 120);

  // 2. Mudar para Impulse -> o servidor deve ignorar a customização e forçar a marca padrão
  await setDevTestPlan('impulse', 'mensal', testUser);
  const impulseEffective = await resolveEffectiveWatermarkConfig(testUser);
  assert.equal(impulseEffective.isLockedToDefault, true);
  assert.equal(impulseEffective.enabled, true);
  assert.equal(impulseEffective.handle, '@radar.ofertas.br1');
  assert.equal(impulseEffective.customLogoUrl, null);
  assert.equal(impulseEffective.position, 'bottom-right');

  // Restaurar Plus ao final do teste
  await setDevTestPlan('plus', 'mensal', testUser);
});

test('Fase 2 — Renderização PNG da Marca d’água com posições (cantos, centro e arraste livre)', async () => {
  const badgeCustom = await getOfficialWatermarkBadge({
    handle: '@minha.marca.plus',
    opacity: 85,
    scale: 110,
    position: 'custom',
    customX: 50,
    customY: 50,
    targetImageWidth: 1080,
    targetImageHeight: 1080,
  });

  assert.ok(badgeCustom.buffer.length > 1000, 'PNG da marca d’água deve ser gerado com bytes reais');
  const meta = await sharp(badgeCustom.buffer).metadata();
  assert.equal(meta.format, 'png');
  assert.equal(meta.width, badgeCustom.width);
  assert.equal(meta.height, badgeCustom.height);

  // Coordenadas no centro (50%, 50%) de uma imagem 1080x1080
  const centerCoords = computeWatermarkCoordinates({
    imageWidth: 1080,
    imageHeight: 1080,
    badgeWidth: 300,
    badgeHeight: 80,
    position: 'center',
  });
  assert.equal(centerCoords.left, Math.round((1080 - 300) / 2));
  assert.equal(centerCoords.top, Math.round((1080 - 80) / 2));
});

test('Fase 2 — Selo de Promoção Real (30 dias) e Detector de Preço "De" Inflado', async () => {
  const uniqueUrl = `https://www.mercadolivre.com.br/produto-teste-fase2-${Date.now()}`;

  // 1. Com apenas 1 coleta no histórico -> NÃO deve exibir selo
  await recordPriceHistory({
    productUrl: uniqueUrl,
    productTitle: 'Cafeteira Expresso Automática',
    store: 'mercadolivre',
    price: 499.9,
  });

  const auditInsufficient = await evaluateRealDealBadge({
    productUrl: uniqueUrl,
    currentPrice: 399.9,
  });
  assert.equal(auditInsufficient.hasEnoughHistory, false);
  assert.equal(auditInsufficient.badgeLabel, null, 'Sem histórico suficiente (<2), nenhum selo deve ser exibido');

  // 2. Com 2+ coletas e preço atual menor dos últimos 30 dias -> Selo liberado!
  await recordPriceHistory({
    productUrl: uniqueUrl,
    productTitle: 'Cafeteira Expresso Automática',
    store: 'mercadolivre',
    price: 459.9,
  });

  const auditRealDeal = await evaluateRealDealBadge({
    productUrl: uniqueUrl,
    currentPrice: 379.9,
    claimedOriginalPrice: 499.9,
  });
  assert.equal(auditRealDeal.hasEnoughHistory, true);
  assert.equal(auditRealDeal.isLowestIn30d, true);
  assert.equal(auditRealDeal.isInflatedOriginalPrice, false);
  assert.equal(auditRealDeal.isRealDeal, true);
  assert.equal(auditRealDeal.badgeLabel, 'Menor preço dos últimos 30 dias');

  // 3. Com preço "De" inflado ("metade do dobro", ex: De R$ 999,90 quando máx 30d foi R$ 499,90) -> Bloqueia selo e alerta inflação!
  const auditInflated = await evaluateRealDealBadge({
    productUrl: uniqueUrl,
    currentPrice: 379.9,
    claimedOriginalPrice: 999.9,
  });
  assert.equal(auditInflated.isInflatedOriginalPrice, true);
  assert.equal(auditInflated.isRealDeal, false);
  assert.equal(auditInflated.badgeLabel, null, 'Não deve exibir selo quando o preço De está inflado');
  assert.ok(auditInflated.inflationReason?.includes('inflado'));
});

