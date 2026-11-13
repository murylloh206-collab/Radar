import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANS_CONFIG,
  startCheckoutSession,
  isFeatureAllowedInPlan,
} from '../src/lib/plans-config';
import {
  setDevTestPlan,
  checkPlanFeatureAccess,
  getDailyOfferQuotaStatus,
} from '../src/lib/server/plan-guard';
import {
  recordOfferPriceHistory,
  getProductPriceHistory,
} from '../src/lib/server/price-history';

const TEST_USER_ID = '00000000-0000-0000-0000-0000000000c1';

test('Fase 1: Configuração central de planos, preços e limites diários', async () => {
  // Impulse
  assert.equal(PLANS_CONFIG.impulse.monthlyPrice, 29.9);
  assert.equal(PLANS_CONFIG.impulse.annualMonthlyEquivalent, 23.9);
  assert.equal(PLANS_CONFIG.impulse.annualTotalPrice, 286.8);
  assert.equal(PLANS_CONFIG.impulse.dailyOfferLimit, 20);

  // Plus
  assert.equal(PLANS_CONFIG.plus.monthlyPrice, 59.9);
  assert.equal(PLANS_CONFIG.plus.annualMonthlyEquivalent, 47.9);
  assert.equal(PLANS_CONFIG.plus.annualTotalPrice, 574.8);
  assert.equal(PLANS_CONFIG.plus.dailyOfferLimit, 100);
  assert.equal(PLANS_CONFIG.plus.badge, 'Mais popular');

  // Ultimate
  assert.equal(PLANS_CONFIG.ultimate.monthlyPrice, 119.9);
  assert.equal(PLANS_CONFIG.ultimate.annualMonthlyEquivalent, 95.9);
  assert.equal(PLANS_CONFIG.ultimate.annualTotalPrice, 1150.8);
  assert.equal(PLANS_CONFIG.ultimate.dailyOfferLimit, null);

  // Checkout único
  const checkout = await startCheckoutSession({
    planId: 'plus',
    billingCycle: 'anual',
  });
  assert.equal(checkout.ok, true);
  assert.equal(checkout.mode, 'coming_soon');
  assert.equal(checkout.summary.displayPrice, '12x R$ 47,90/mês');
});

test('Fase 1: Plan-guard e bloqueio por plano no servidor', async () => {
  // 1. Testar plano Impulse
  await setDevTestPlan(TEST_USER_ID, 'impulse', { ciclo: 'anual' });
  const quotaImpulse = await getDailyOfferQuotaStatus(TEST_USER_ID);
  assert.equal(quotaImpulse.planId, 'impulse');
  assert.equal(quotaImpulse.dailyLimit, 20);

  const aiCaptionOnImpulse = await checkPlanFeatureAccess('ai_caption_generator', TEST_USER_ID);
  assert.equal(aiCaptionOnImpulse.allowed, true);

  const customWatermarkOnImpulse = await checkPlanFeatureAccess('watermark_custom', TEST_USER_ID);
  assert.equal(customWatermarkOnImpulse.allowed, false);
  assert.equal(customWatermarkOnImpulse.requiredPlan, 'plus');

  // 2. Testar plano Plus
  await setDevTestPlan(TEST_USER_ID, 'plus', { ciclo: 'anual' });
  const quotaPlus = await getDailyOfferQuotaStatus(TEST_USER_ID);
  assert.equal(quotaPlus.planId, 'plus');
  assert.equal(quotaPlus.dailyLimit, 100);

  const customWatermarkOnPlus = await checkPlanFeatureAccess('watermark_custom', TEST_USER_ID);
  assert.equal(customWatermarkOnPlus.allowed, true);

  const comparatorOnPlus = await checkPlanFeatureAccess('comparator_search', TEST_USER_ID);
  assert.equal(comparatorOnPlus.allowed, false);
  assert.equal(comparatorOnPlus.requiredPlan, 'ultimate');

  // 3. Testar plano Ultimate
  await setDevTestPlan(TEST_USER_ID, 'ultimate', { ciclo: 'anual' });
  const quotaUltimate = await getDailyOfferQuotaStatus(TEST_USER_ID);
  assert.equal(quotaUltimate.planId, 'ultimate');
  assert.equal(quotaUltimate.dailyLimit, null);

  const comparatorOnUltimate = await checkPlanFeatureAccess('comparator_search', TEST_USER_ID);
  assert.equal(comparatorOnUltimate.allowed, true);

  // Deixar no plano Plus como padrão após o teste
  await setDevTestPlan(TEST_USER_ID, 'plus', { ciclo: 'anual' });
});

test('Fase 1: Histórico de preço salvo automaticamente a cada coleta', async () => {
  const testProductUrl = 'https://www.mercadolivre.com.br/produto-teste-fase1/p/MLB12345678';
  await recordOfferPriceHistory({
    userId: TEST_USER_ID,
    productExternalId: 'MLB12345678',
    productTitle: 'Fone Bluetooth Teste Fase 1',
    productUrl: testProductUrl,
    store: 'mercadolivre',
    price: 189.9,
    originalPrice: 249.9,
  });

  const history = await getProductPriceHistory(testProductUrl, 30);

  assert.ok(history.length >= 1, 'Deve retornar pelo menos 1 registro de histórico de preço salvo');
  assert.equal(history[0].price, 189.9);
  assert.equal(history[0].store, 'mercadolivre');
});
