import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setDevTestPlan,
  checkPlanFeatureAccess,
} from '../src/lib/server/plan-guard';
import {
  registerTrackedLink,
  recordClickEvent,
  listClickEvents,
  resolveClickOrigin,
} from '../src/lib/server/click-tracker';
import {
  parseAffiliateSalesCsv,
  saveConvertedSalesBatch,
  listConvertedSales,
  getStoreSalesSourcesStatus,
} from '../src/lib/server/converted-sales';
import {
  resolveDidYouMeanSuggestion,
  computeTrigramSimilarity,
} from '../src/lib/server/comparator-search';

const TEST_USER_PHASE3 = '00000000-0000-0000-0000-000000000003';

test('Fase 3 — Redirecionador /r/[code]: registra data, loja, produto e origem (WhatsApp, Telegram, Vitrine /@slug, Card, Outro)', async () => {
  // 1. Testar detecção de origem
  assert.equal(resolveClickOrigin({ queryOrigin: 'telegram' }), 'telegram');
  assert.equal(resolveClickOrigin({ referer: 'https://radardeofertas.com/@minhaloja' }), 'vitrine');
  assert.equal(resolveClickOrigin({ userAgent: 'WhatsApp/2.24.10' }), 'whatsapp');
  assert.equal(resolveClickOrigin({ queryOrigin: 'card' }), 'card');
  assert.equal(resolveClickOrigin({}), 'outro');

  // 2. Registrar link e clique real
  const code = `t3_${Date.now().toString(36)}`;
  await registerTrackedLink({
    userId: TEST_USER_PHASE3,
    code,
    destinationUrl: 'https://s.shopee.com.br/teste-fase3',
    store: 'shopee',
    productTitle: 'Cafeteira Expresso Inox',
    originDefault: 'vitrine',
  });

  const ev = await recordClickEvent({
    userId: TEST_USER_PHASE3,
    code,
    destinationUrl: 'https://s.shopee.com.br/teste-fase3',
    store: 'shopee',
    productTitle: 'Cafeteira Expresso Inox',
    origin: 'vitrine',
    referer: 'http://localhost:3000/@radar-ofertas',
  });

  assert.equal(ev.code, code);
  assert.equal(ev.store, 'shopee');
  assert.equal(ev.productTitle, 'Cafeteira Expresso Inox');
  assert.equal(ev.origin, 'vitrine');

  const events = await listClickEvents({ userId: TEST_USER_PHASE3 });
  assert.ok(events.some((e) => e.code === code && e.origin === 'vitrine' && e.store === 'shopee'));
});

test('Fase 3 — Métricas por plano no servidor e Vendas Convertidas (API Oficial Shopee + CSV)', async () => {
  // 1. Impulse: apenas métricas básicas do WhatsApp
  await setDevTestPlan(TEST_USER_PHASE3, 'impulse', { ciclo: 'mensal' });
  assert.equal((await checkPlanFeatureAccess('whatsapp_basic_metrics', TEST_USER_PHASE3)).allowed, true);
  assert.equal((await checkPlanFeatureAccess('platform_basic_metrics', TEST_USER_PHASE3)).allowed, false);
  assert.equal((await checkPlanFeatureAccess('full_store_metrics', TEST_USER_PHASE3)).allowed, false);
  assert.equal((await checkPlanFeatureAccess('comparator_search', TEST_USER_PHASE3)).allowed, false);

  // 2. Plus: métricas básicas da plataforma + WhatsApp, mas bloqueia métricas completas por loja e comparador
  await setDevTestPlan(TEST_USER_PHASE3, 'plus', { ciclo: 'mensal' });
  assert.equal((await checkPlanFeatureAccess('whatsapp_basic_metrics', TEST_USER_PHASE3)).allowed, true);
  assert.equal((await checkPlanFeatureAccess('platform_basic_metrics', TEST_USER_PHASE3)).allowed, true);
  assert.equal((await checkPlanFeatureAccess('full_store_metrics', TEST_USER_PHASE3)).allowed, false);
  assert.equal((await checkPlanFeatureAccess('comparator_search', TEST_USER_PHASE3)).allowed, false);

  // 3. Ultimate: libera métricas completas por loja, vendas convertidas e buscador comparador
  await setDevTestPlan(TEST_USER_PHASE3, 'ultimate', { ciclo: 'mensal' });
  assert.equal((await checkPlanFeatureAccess('full_store_metrics', TEST_USER_PHASE3)).allowed, true);
  assert.equal((await checkPlanFeatureAccess('comparator_search', TEST_USER_PHASE3)).allowed, true);

  // 4. Testar importação real de relatório CSV com rastreamento de fonte ('csv_importado')
  const sampleCsv = [
    'pedido,produto,valor,comissao,quantidade,data',
    `MLB-FASE3-01,Fritadeira Air Fryer 4L,299.90,23.99,1,${new Date().toISOString().slice(0, 10)}`,
    `MLB-FASE3-02,Parafusadeira 12V Bivolt,189.00,15.12,2,${new Date().toISOString().slice(0, 10)}`,
  ].join('\n');

  const parsedSales = parseAffiliateSalesCsv(sampleCsv, 'mercadolivre', TEST_USER_PHASE3);
  assert.equal(parsedSales.length, 2);
  assert.equal(parsedSales[0].store, 'mercadolivre');
  assert.equal(parsedSales[0].orderValue, 299.9);
  assert.equal(parsedSales[0].commissionValue, 23.99);
  assert.equal(parsedSales[0].dataSource, 'csv_importado');

  await saveConvertedSalesBatch(TEST_USER_PHASE3, parsedSales);
  const storedSales = await listConvertedSales({ userId: TEST_USER_PHASE3, store: 'mercadolivre' });
  assert.ok(storedSales.some((s) => s.externalOrderId === 'MLB-FASE3-01' && s.dataSource === 'csv_importado'));

  const sources = await getStoreSalesSourcesStatus(TEST_USER_PHASE3);
  const shopeeSrc = sources.find((s) => s.store === 'shopee');
  assert.equal(shopeeSrc?.supportsOfficialSalesApi, true);
});

test('Fase 3 — Buscador Comparador: tolerância a erros de digitação ("bulsa" → blusa, "cadado" → cadeado)', async () => {
  const sugBulsa = await resolveDidYouMeanSuggestion('bulsa');
  assert.equal(sugBulsa.didYouMean, 'blusa');
  assert.equal(sugBulsa.effectiveQuery, 'blusa');

  const sugCadado = await resolveDidYouMeanSuggestion('cadado');
  assert.equal(sugCadado.didYouMean, 'cadeado');
  assert.equal(sugCadado.effectiveQuery, 'cadeado');

  const sugFritadera = await resolveDidYouMeanSuggestion('fritadera');
  assert.equal(sugFritadera.didYouMean, 'fritadeira elétrica air fryer');

  // Similaridade de trigramas para erro não listado diretamente
  const simScore = computeTrigramSimilarity('cafetera expresso', 'cafeteira expresso');
  assert.ok(simScore > 0.6, `Esperava similaridade > 0.6, obteve ${simScore}`);
});

