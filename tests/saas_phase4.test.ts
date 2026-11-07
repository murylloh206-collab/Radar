import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendChannelSrcParam,
  clearTestClicksAndLinks,
  listClickEvents,
  recordClickEvent,
  registerTrackedLink,
  resolveClickOrigin,
} from '../src/lib/server/click-tracker';
import {
  clearTestConvertedSales,
  listConvertedSales,
  parseAffiliateSalesCsv,
  saveConvertedSalesBatch,
} from '../src/lib/server/converted-sales';
import { buildWhatsAppMessage } from '../src/lib/server/message-builder';
import { ensureTelegramChannelSrcInText } from '../src/lib/server/telegram-service';
import {
  COMPARATOR_STORE_PROVIDERS,
  registerComparatorStoreProvider,
} from '../src/lib/server/comparator-search';
import {
  createPriceDropAlert,
  decideRadarReviewJob,
  deletePriceDropAlert,
  evaluateAndTriggerPriceDropAlerts,
  generateAndSendWeeklyReport,
  getBackgroundJobsStatus,
  getWhatToPostTodayRecommendations,
  listTeamAndChannels,
  removeTeamMember,
  removeWorkspaceChannel,
  runOpportunityRadarScan,
  runUnifiedBackgroundCycle,
  upsertTeamMember,
  upsertWorkspaceChannel,
} from '../src/lib/server/intelligence-hub';
import { checkPublicRouteRateLimit } from '../src/lib/server/rate-limiter';
import { readDatabase, writeDatabase } from '../src/lib/server/storage';

const PHASE4_USER_ID = '00000000-0000-0000-0000-000000000004';

test('Fase 4 (Ajustes Pré-Fase): ?src= obrigatório por canal, is_test=true excluído em produção e ponto de expansão do comparador', async () => {
  // 1. Parâmetro ?src= em todos os canais + fallback por Referer/User-Agent como Plano B
  const waUrl = appendChannelSrcParam('https://mercadolivre.com.br/sec/abc', 'whatsapp');
  assert.ok(waUrl.includes('src=whatsapp'), 'Link do WhatsApp deve incluir ?src=whatsapp');

  const tgText = ensureTelegramChannelSrcInText(
    'Confira a oferta: https://s.shopee.com.br/xyz?src=whatsapp ou /r/cod123'
  );
  assert.ok(tgText.includes('src=telegram'), 'Links enviados ao Telegram devem incluir src=telegram');
  assert.ok(!tgText.includes('src=whatsapp'), 'src=whatsapp deve ser convertido para src=telegram no canal Telegram');

  const vitrineUrl = appendChannelSrcParam('/r/vit123', 'vitrine');
  assert.equal(vitrineUrl, '/r/vit123?src=vitrine');

  const cardUrl = appendChannelSrcParam('/r/card999', 'card');
  assert.equal(cardUrl, '/r/card999?src=card');

  const builtMsg = buildWhatsAppMessage({
    title: 'Fone Bluetooth JBL Wave Buds',
    currentPrice: 199.9,
    originalPrice: 299.9,
    affiliateUrl: 'https://mercadolivre.com.br/sec/jbl123',
  });
  assert.ok(
    builtMsg.includes('https://mercadolivre.com.br/sec/jbl123?src=whatsapp'),
    'Mensagem gerada para o WhatsApp deve anexar ?src=whatsapp no link'
  );

  // Fallback Plano B quando ?src= não está presente
  const fallbackOrigin = resolveClickOrigin({
    queryOrigin: null,
    referer: 'https://t.me/radardeofertas',
    userAgent: 'Mozilla/5.0',
  });
  assert.equal(fallbackOrigin, 'telegram');

  // 2. Dados de teste marcados com isTest = true, excluídos quando excludeTest=true (comportamento de produção) e limpáveis
  const testCode = `tst_${Date.now().toString(36)}`;
  await registerTrackedLink({
    userId: PHASE4_USER_ID,
    code: testCode,
    destinationUrl: 'https://s.shopee.com.br/teste',
    store: 'shopee',
    productTitle: 'Produto Simulado Dev',
    originDefault: 'whatsapp',
    isTest: true,
  });

  await recordClickEvent({
    userId: PHASE4_USER_ID,
    code: testCode,
    destinationUrl: 'https://s.shopee.com.br/teste',
    store: 'shopee',
    productTitle: 'Produto Simulado Dev',
    origin: 'whatsapp',
    isTest: true,
  });

  const prodClicks = await listClickEvents({ userId: PHASE4_USER_ID, excludeTest: true });
  assert.equal(
    prodClicks.some((c) => c.code === testCode),
    false,
    'Cliques com isTest=true devem ser excluídos das métricas de produção'
  );

  const testSales = parseAffiliateSalesCsv(
    'pedido,produto,valor,comissao,quantidade,data\nPED-TST-99,Produto Teste CSV,150.00,15.00,1,2026-11-06',
    'shopee',
    PHASE4_USER_ID,
    true
  );
  assert.equal(testSales[0].isTest, true);
  await saveConvertedSalesBatch(PHASE4_USER_ID, testSales);

  const prodSales = await listConvertedSales({ userId: PHASE4_USER_ID, excludeTest: true });
  assert.equal(
    prodSales.some((s) => s.externalOrderId === 'PED-TST-99'),
    false,
    'Vendas com isTest=true devem ser excluídas em produção'
  );

  const clearedClicks = await clearTestClicksAndLinks(PHASE4_USER_ID);
  const clearedSalesCount = await clearTestConvertedSales(PHASE4_USER_ID);
  assert.ok(clearedClicks.deletedClicks >= 1, 'Deve apagar os cliques de teste');
  assert.ok(clearedSalesCount >= 1, 'Deve apagar as vendas de teste');

  // 3. Ponto de expansão do comparador (COMPARATOR_STORE_PROVIDERS)
  assert.ok(
    Array.isArray(COMPARATOR_STORE_PROVIDERS) && COMPARATOR_STORE_PROVIDERS.length >= 4,
    'Deve expor a lista modular de provedores por loja'
  );
  const prevLen = COMPARATOR_STORE_PROVIDERS.length;
  registerComparatorStoreProvider({
    id: 'test-future-slot',
    storeSlug: 'amazon',
    displayName: 'Amazon Slot Teste',
    sourceType: 'future_provider',
    enabled: false,
    priority: 99,
    description: 'Slot de teste',
  });
  assert.equal(COMPARATOR_STORE_PROVIDERS.length, prevLen + 1);
  COMPARATOR_STORE_PROVIDERS.pop();
});

test('Fase 4: Alerta de Queda de Preço, Radar de Oportunidades (Fila de Revisão sem auto-post) e O que Postar Hoje', async () => {
  // 1. Alerta de queda de preço
  const alert = await createPriceDropAlert({
    userId: PHASE4_USER_ID,
    productTitle: 'Cafeteira Expresso Oster PrimaLatte',
    productUrl: 'https://www.mercadolivre.com.br/p/MLB998877',
    store: 'mercadolivre',
    currentPrice: 899.9,
    targetPrice: 699.9,
    notifyChannel: 'whatsapp',
  });
  assert.equal(alert.status, 'active');

  // Simular queda de preço para R$ 649,90 (abaixo da meta de R$ 699,90)
  const evalRes = await evaluateAndTriggerPriceDropAlerts(PHASE4_USER_ID, {
    [alert.id]: 649.9,
  });
  assert.equal(evalRes.triggeredCount, 1, 'Deve disparar o alerta quando o preço cair abaixo da meta');
  assert.equal(evalRes.triggeredAlerts[0].status, 'triggered');

  await deletePriceDropAlert(PHASE4_USER_ID, alert.id);

  // 2. Radar de oportunidades: NUNCA posta sozinho (sempre entra como aguardando_aprovacao)
  const db = readDatabase();
  const radarProdId = `prod-radar-${Date.now()}`;
  db.products.unshift({
    id: radarProdId,
    userId: PHASE4_USER_ID,
    externalId: 'MLB-FIT3',
    title: 'Smartwatch Samsung Galaxy Fit3 Oferta Relâmpago',
    productUrl: 'https://www.mercadolivre.com.br/p/MLB-FIT3',
    affiliateUrl: 'https://www.mercadolivre.com.br/sec/FIT3',
    storeName: 'mercadolivre',
    currentPrice: 199.0,
    originalPrice: 399.0, // 50% de queda
    discountPct: 50,
    rating: 4.9,
    salesCount: 500,
    inStock: true,
    lastCheckedAt: new Date().toISOString(),
  });
  writeDatabase(db);

  const radarScan = await runOpportunityRadarScan(PHASE4_USER_ID, {
    minDropPctOverride: 30,
  });
  assert.ok(radarScan.queuedForReviewCount >= 1, 'Radar deve detectar a queda de 50%');
  for (const job of radarScan.queuedJobs) {
    assert.equal(
      job.status,
      'aguardando_aprovacao',
      'REGRA INEGOCIÁVEL: Radar NUNCA pode postar sozinho; status deve ser aguardando_aprovacao'
    );
    await decideRadarReviewJob(job.id, 'reject');
  }

  // Remover produto temporário
  const dbAfter = readDatabase();
  dbAfter.products = dbAfter.products.filter((p) => p.id !== radarProdId);
  writeDatabase(dbAfter);

  // 3. "O que postar hoje" — valida estrutura e recomendações baseadas em métricas reais
  const realCode = `real_${Date.now().toString(36)}`;
  await recordClickEvent({
    userId: PHASE4_USER_ID,
    code: realCode,
    destinationUrl: 'https://s.shopee.com.br/real1',
    store: 'shopee',
    productTitle: 'Tênis Esportivo Corrida Olympikus',
    origin: 'whatsapp',
    isTest: false,
  });
  await recordClickEvent({
    userId: PHASE4_USER_ID,
    code: realCode,
    destinationUrl: 'https://s.shopee.com.br/real1',
    store: 'shopee',
    productTitle: 'Tênis Esportivo Corrida Olympikus',
    origin: 'whatsapp',
    isTest: false,
  });

  const rec = await getWhatToPostTodayRecommendations(PHASE4_USER_ID);
  assert.equal(rec.hasEnoughData, true);
  assert.ok(rec.bestPostingHour?.hourLabel, 'Deve sugerir o melhor horário com base nos cliques reais');
  assert.ok(rec.topCategories.length >= 1, 'Deve listar as categorias campeãs reais');
});

test('Fase 4: Relatório Semanal, Equipe (Dono e Colaborador), Múltiplos Canais, Segundo Plano e Rate Limit', async () => {
  // 1. Relatório semanal
  const report = await generateAndSendWeeklyReport(PHASE4_USER_ID, { dispatchNow: false });
  assert.ok(typeof report.currentWeekClicks === 'number');
  assert.ok(report.reportMessageText.includes('RELATÓRIO SEMANAL'));

  // 2. Equipe (Dono e Colaborador) e Múltiplos Canais
  const member = await upsertTeamMember(PHASE4_USER_ID, {
    name: 'Colaborador Teste',
    email: 'colab@radardeofertas.com.br',
    role: 'colaborador',
    permissions: {
      canPostOffers: true,
      canApproveRadar: true,
      canManageConnections: false,
      canViewMetrics: true,
    },
  });
  assert.equal(member.role, 'colaborador');
  assert.equal(member.permissions.canManageConnections, false);

  const channel = await upsertWorkspaceChannel(PHASE4_USER_ID, {
    channelType: 'telegram',
    label: 'Canal Telegram Secundário',
    targetIdentifier: '@radarofertas2',
  });
  assert.equal(channel.channelType, 'telegram');

  const listed = await listTeamAndChannels(PHASE4_USER_ID);
  assert.ok(listed.members.some((m) => m.role === 'dono'), 'Sempre deve existir um Dono');
  assert.ok(listed.members.some((m) => m.id === member.id), 'Deve listar o colaborador');
  assert.ok(listed.channels.some((c) => c.id === channel.id), 'Deve listar o canal adicional');

  await removeTeamMember(PHASE4_USER_ID, member.id);
  await removeWorkspaceChannel(PHASE4_USER_ID, channel.id);

  // 3. Painel de status do motor em segundo plano
  const bgCycle = await runUnifiedBackgroundCycle(PHASE4_USER_ID, 'price_drop_alerts');
  assert.equal(bgCycle.ok, true);
  const statuses = await getBackgroundJobsStatus(PHASE4_USER_ID);
  assert.equal(statuses.length, 4);

  // 4. Rate limiting nas rotas públicas (/r/[code] e /@slug)
  const dummyReq = new Request('http://localhost/r/abc', {
    headers: { 'x-forwarded-for': '203.0.113.199' },
  });
  const rl1 = checkPublicRouteRateLimit(dummyReq, 'redirect', 2);
  const rl2 = checkPublicRouteRateLimit(dummyReq, 'redirect', 2);
  const rl3 = checkPublicRouteRateLimit(dummyReq, 'redirect', 2);
  assert.equal(rl1.allowed, true);
  assert.equal(rl2.allowed, true);
  assert.equal(rl3.allowed, false, 'Deve bloquear quando ultrapassar o limite por minuto');
});
