import test from "node:test";
import assert from "node:assert/strict";

import {
  isWithinOperationalWindow,
  calculateNextScheduledSlot,
  generateDayScheduleSlots,
  rescheduleFutureOffers,
} from "../src/lib/server/scheduler-engine";
import {
  isBlockedProductOrCategory,
  evaluateCandidateOffer,
} from "../src/lib/server/offer-scoring-engine";
import {
  DEFAULT_ALGORITHM_SETTINGS,
} from "../src/lib/server/scoring-rules";
import { formatAutoDispatchMessage } from "../src/lib/whatsapp-format";
import type { NormalizedCandidateProduct } from "../src/lib/server/providers/provider-interface";
import type { Offer, SchedulerSettings } from "../src/lib/types";

// =============================================================================
// 1. TESTES DOS MODOS DE AGENDA E CÁLCULO DE HORÁRIOS ENTRE 07:00 E 00:00
// =============================================================================

test("Modo Intervalo em Minutos: 20 min na janela 07:00 às 00:00 gera exatamente 51 posts", () => {
  const settings: SchedulerSettings = {
    state: "ativo",
    startHour: "07:00",
    endHour: "00:00",
    dailyTarget: 51,
    maxPerHour: 5,
    timezone: "America/Sao_Paulo",
    channelDestination: "Radar de Ofertas",
    consecutiveFailures: 0,
    maxConsecutiveFailures: 3,
    lastDispatchedAt: null,
    lastDispatchedOfferTitle: null,
    lastError: null,
    mode: "interval_minutes",
    distribution: "fixed",
    intervalMinutes: 20,
    postsPerHour: 3,
    minScore: 75,
  };

  const slots = generateDayScheduleSlots(settings, "2026-10-14");
  // Janela das 07:00 às 00:00 = 17 horas = 1020 minutos.
  // 1020 / 20 = 51 slots
  assert.equal(slots.length, 51, "Deveria gerar exatamente 51 slots para intervalo de 20 minutos");
  assert.equal(slots[0].timeStr, "07:00", "Primeiro slot deve ser às 07:00");
  assert.equal(slots[1].timeStr, "07:20", "Segundo slot deve ser às 07:20");
  assert.equal(slots[50].timeStr, "23:40", "Último slot dentro da janela deve ser 23:40");
});

test("Modo Posts Por Hora: 3 posts/hora na janela 07:00 às 00:00 gera 51 posts espaçados a cada 20 min", () => {
  const settings: SchedulerSettings = {
    state: "ativo",
    startHour: "07:00",
    endHour: "00:00",
    dailyTarget: 51,
    maxPerHour: 5,
    timezone: "America/Sao_Paulo",
    channelDestination: "Radar de Ofertas",
    consecutiveFailures: 0,
    maxConsecutiveFailures: 3,
    lastDispatchedAt: null,
    lastDispatchedOfferTitle: null,
    lastError: null,
    mode: "posts_per_hour",
    distribution: "fixed",
    intervalMinutes: 20,
    postsPerHour: 3,
    minScore: 75,
  };

  const slots = generateDayScheduleSlots(settings, "2026-10-14");
  // 17 horas operacionais * 3 posts/h = 51 posts
  assert.equal(slots.length, 51, "Deveria gerar 51 slots para 3 posts/hora");
  assert.equal(slots[0].timeStr, "07:00");
  assert.equal(slots[1].timeStr, "07:20");
});

test("Modo Meta Diária: 30 posts no dia distribuídos uniformemente", () => {
  const settings: SchedulerSettings = {
    state: "ativo",
    startHour: "07:00",
    endHour: "00:00",
    dailyTarget: 30,
    maxPerHour: 5,
    timezone: "America/Sao_Paulo",
    channelDestination: "Radar de Ofertas",
    consecutiveFailures: 0,
    maxConsecutiveFailures: 3,
    lastDispatchedAt: null,
    lastDispatchedOfferTitle: null,
    lastError: null,
    mode: "daily_target",
    distribution: "fixed",
    intervalMinutes: 34,
    postsPerHour: 2,
    minScore: 75,
  };

  const slots = generateDayScheduleSlots(settings, "2026-10-14");
  assert.equal(slots.length, 30, "Deveria gerar exatamente 30 slots para meta de 30");
  // Todos os slots devem estar estritamente entre 07:00 e 23:59
  for (const s of slots) {
    const [h] = s.timeStr.split(":").map(Number);
    assert.ok(h >= 7 && h <= 23, `Horário ${s.timeStr} fora da janela operacional 07:00-00:00`);
  }
});

// =============================================================================
// 2. MODO FIXO VS ALEATÓRIO CONTROLADO
// =============================================================================

test("Modo Fixo produz horários perfeitamente previsíveis e sem variação", () => {
  const settings: SchedulerSettings = {
    state: "ativo",
    startHour: "07:00",
    endHour: "00:00",
    dailyTarget: 10,
    maxPerHour: 5,
    timezone: "America/Sao_Paulo",
    channelDestination: "Radar de Ofertas",
    consecutiveFailures: 0,
    maxConsecutiveFailures: 3,
    lastDispatchedAt: null,
    lastDispatchedOfferTitle: null,
    lastError: null,
    mode: "daily_target",
    distribution: "fixed",
    intervalMinutes: 102,
    postsPerHour: 1,
    minScore: 75,
  };

  const run1 = generateDayScheduleSlots(settings, "2026-10-14");
  const run2 = generateDayScheduleSlots(settings, "2026-10-14");

  assert.deepEqual(
    run1.map((s) => s.timeStr),
    run2.map((s) => s.timeStr),
    "No modo fixo, execuções sucessivas devem produzir exatamente os mesmos horários"
  );
});

test("Modo Aleatório Controlado adiciona variação sem ultrapassar limites nem sair da janela", () => {
  const settings: SchedulerSettings = {
    state: "ativo",
    startHour: "07:00",
    endHour: "00:00",
    dailyTarget: 30,
    maxPerHour: 5,
    timezone: "America/Sao_Paulo",
    channelDestination: "Radar de Ofertas",
    consecutiveFailures: 0,
    maxConsecutiveFailures: 3,
    lastDispatchedAt: null,
    lastDispatchedOfferTitle: null,
    lastError: null,
    mode: "daily_target",
    distribution: "randomized",
    intervalMinutes: 34,
    postsPerHour: 2,
    minScore: 75,
  };

  const slots = generateDayScheduleSlots(settings, "2026-10-14");
  assert.equal(slots.length, 30, "Meta diária deve ser respeitada mesmo com aleatoriedade");

  // Verificar ordenação cronológica e limites
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const [h] = s.timeStr.split(":").map(Number);
    assert.ok(h >= 7 && h <= 23, `Horário aleatorizado ${s.timeStr} deve ficar entre 07:00 e 23:59`);
  }
});

// =============================================================================
// 3. JANELA OPERACIONAL E NÃO PUBLICAR FORA DA JANELA
// =============================================================================

test("isWithinOperationalWindow respeita horário 07:00 às 00:00 em America/Sao_Paulo", () => {
  // Teste às 14:00 (dentro da janela)
  const insideTime = new Date("2026-10-14T17:00:00.000Z"); // 14:00 em SP (UTC-3)
  assert.equal(isWithinOperationalWindow("07:00", "00:00", insideTime), true);

  // Teste às 03:00 (fora da janela)
  const outsideTimeNight = new Date("2026-10-14T06:00:00.000Z"); // 03:00 em SP (UTC-3)
  assert.equal(isWithinOperationalWindow("07:00", "00:00", outsideTimeNight), false);

  // Teste às 06:50 (fora da janela - antes das 07:00)
  const outsideTimeMorning = new Date("2026-10-14T09:50:00.000Z"); // 06:50 em SP (UTC-3)
  assert.equal(isWithinOperationalWindow("07:00", "00:00", outsideTimeMorning), false);
});

test("calculateNextScheduledSlot programa para o início da próxima janela se chamado de madrugada", () => {
  const nightTime = new Date("2026-10-14T06:00:00.000Z"); // 03:00 SP
  const settings: SchedulerSettings = {
    state: "ativo",
    startHour: "07:00",
    endHour: "00:00",
    dailyTarget: 51,
    maxPerHour: 5,
    timezone: "America/Sao_Paulo",
    channelDestination: "Radar de Ofertas",
    consecutiveFailures: 0,
    maxConsecutiveFailures: 3,
    lastDispatchedAt: null,
    lastDispatchedOfferTitle: null,
    lastError: null,
    mode: "interval_minutes",
    distribution: "fixed",
    intervalMinutes: 20,
    postsPerHour: 3,
    minScore: 75,
  };

  const nextSlot = calculateNextScheduledSlot([], settings, nightTime);
  const nextDate = new Date(nextSlot.scheduledFor);
  // O próximo slot deve ser às 07:00 em SP
  const spHour = parseInt(
    new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(nextDate),
    10
  );
  assert.equal(spHour, 7, "Próximo envio deve ser agendado para 07:00");
});

// =============================================================================
// 4. RECÁLCULO SEGURO SEM PUBLICAR ACIDENTALMENTE
// =============================================================================

function createMockOffer(data: Partial<Offer> & { id: string; title: string; price: number }): Offer {
  return {
    source: "mercadolivre",
    externalId: data.id,
    thumbnail: "https://example.com/img.jpg",
    originalPrice: null,
    discountPercent: null,
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/" + data.id,
    freeShipping: true,
    searchTerm: "geral",
    status: "aprovado",
    affiliateUrl: "https://mercadolivre.com/sec/" + data.id,
    coupon: null,
    couponDescription: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    statusChangedAt: new Date().toISOString(),
    ...data,
  };
}

test("rescheduleFutureOffers recalcula apenas ofertas futuras e não altera passadas nem enviadas", () => {
  const now = new Date("2026-10-14T15:00:00.000Z"); // 12:00 SP
  const futureSlot1 = new Date("2026-10-14T17:00:00.000Z").toISOString();
  const futureSlot2 = new Date("2026-10-14T18:00:00.000Z").toISOString();

  const offers: Offer[] = [
    createMockOffer({
      id: "off-1",
      externalId: "MLB1",
      title: "Tênis Nike Air Max Masculino Original",
      price: 299.9,
      originalPrice: 499.9,
      affiliateUrl: "https://mercadolivre.com/sec/abc1",
      shortUrl: "https://meli.la/1",
      status: "aprovado",
      whatsappStatus: "enviado", // Já enviada! NÃO PODE MUDAR
      scheduledFor: "2026-10-14T13:00:00.000Z",
      opportunityScore: 88,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      searchTerm: "tenis",
    }),
    createMockOffer({
      id: "off-2",
      externalId: "MLB2",
      title: "Creatina Monohidratada 100% Pura 300g Creapure",
      price: 89.9,
      originalPrice: 139.9,
      affiliateUrl: "https://mercadolivre.com/sec/abc2",
      shortUrl: "https://meli.la/2",
      status: "aprovado",
      whatsappStatus: "pronto",
      scheduledFor: futureSlot1, // Futura: pode reagendar
      opportunityScore: 82,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      searchTerm: "suplementos",
    }),
    createMockOffer({
      id: "off-3",
      externalId: "MLB3",
      title: "Perfume Árabe Asad Lattafa Eau de Parfum 100ml",
      price: 189.9,
      originalPrice: 289.9,
      affiliateUrl: "https://mercadolivre.com/sec/abc3",
      shortUrl: "https://meli.la/3",
      status: "aprovado",
      whatsappStatus: "pronto",
      scheduledFor: futureSlot2, // Futura: pode reagendar
      opportunityScore: 90,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      searchTerm: "perfumes",
    }),
  ];

  const newSettings: SchedulerSettings = {
    state: "ativo",
    startHour: "07:00",
    endHour: "00:00",
    dailyTarget: 20,
    maxPerHour: 5,
    timezone: "America/Sao_Paulo",
    channelDestination: "Radar de Ofertas",
    consecutiveFailures: 0,
    maxConsecutiveFailures: 3,
    lastDispatchedAt: null,
    lastDispatchedOfferTitle: null,
    lastError: null,
    mode: "interval_minutes",
    distribution: "fixed",
    intervalMinutes: 45, // Alterou o intervalo
    postsPerHour: 2,
    minScore: 75,
  };

  const rescheduled = rescheduleFutureOffers(offers, newSettings, now);

  // A oferta off-1 não deve ter sido alterada
  const off1 = rescheduled.find((o) => o.id === "off-1");
  assert.equal(off1?.whatsappStatus, "enviado");
  assert.equal(off1?.scheduledFor, "2026-10-14T13:00:00.000Z");

  // As ofertas futuras devem ter novos slots no futuro
  const off2 = rescheduled.find((o) => o.id === "off-2");
  const off3 = rescheduled.find((o) => o.id === "off-3");
  assert.ok(new Date(off2!.scheduledFor!).getTime() > now.getTime());
  assert.ok(new Date(off3!.scheduledFor!).getTime() > new Date(off2!.scheduledFor!).getTime());
});

// =============================================================================
// 5. BLOQUEIO DE SCORE BAIXO (< 75) E REGRAS DE APROVAÇÃO
// =============================================================================

test("Bloqueio de qualidade mínima: produtos com score abaixo de 75 NÃO são aprovados automaticamente", () => {
  const lowScoreCandidate: NormalizedCandidateProduct = {
    source: "mercadolivre",
    externalId: "MLB_LOW",
    title: "Camiseta Básica Sem Desconto",
    thumbnail: "https://example.com/cam.jpg",
    price: 39.9,
    originalPrice: null, // Sem desconto comprovado
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/MLB_LOW",
    freeShipping: false,
    isInStock: true,
    rating: 3.5, // Baixa avaliação
    reviewsCount: 4,
    salesVolume: 2,
    capturedAt: new Date().toISOString(),
  };

  const evalResult = evaluateCandidateOffer({
    candidate: lowScoreCandidate,
  });

  assert.ok(
    evalResult.score < 75,
    `Score calculado (${evalResult.score}) deveria ser menor que 75`
  );
  assert.notEqual(
    evalResult.audit.decision,
    "aprovado",
    "Produto com score menor que 75 NUNCA deve receber decisão 'aprovado'"
  );
});

test("Produtos com score >= 75 nas categorias prioritárias são auto-aprovados", () => {
  const highQualityCandidate: NormalizedCandidateProduct = {
    source: "mercadolivre",
    externalId: "MLB_HIGH",
    title: "Tênis Nike Revolution 7 Masculino Original Corrida",
    thumbnail: "https://example.com/revolution7.jpg",
    price: 249.9,
    originalPrice: 429.9, // 42% de desconto real
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/MLB_HIGH",
    affiliateUrl: "https://mercadolivre.com/sec/high-quality",
    shortUrl: "https://meli.la/high-quality",
    freeShipping: true,
    isInStock: true,
    rating: 4.8,
    reviewsCount: 320,
    salesVolume: 500,
    sellerReputation: "platinum",
    capturedAt: new Date().toISOString(),
  };

  const evalResult = evaluateCandidateOffer({
    candidate: highQualityCandidate,
    settings: {
      ...DEFAULT_ALGORITHM_SETTINGS,
      rolloutMode: "publicacao_automatica",
      minAutoApproveScore: 75,
    },
  });

  assert.ok(
    evalResult.score >= 75,
    `Score calculado (${evalResult.score}) deveria ser >= 75`
  );
  assert.equal(evalResult.passed, true);
  assert.equal(evalResult.audit.decision, "aprovado");
});

// =============================================================================
// 6. BLOQUEIO DE LIVROS, E-BOOKS, RECEITAS, CURSOS E PRODUTOS DIGITAIS
// =============================================================================

test("isBlockedProductOrCategory bloqueia livros, e-books, receitas, cursos e infoprodutos", () => {
  // Livros e e-books
  assert.equal(isBlockedProductOrCategory("Livro O Poder do Hábito Capa Comum").blocked, true);
  assert.equal(isBlockedProductOrCategory("E-book 100 Receitas para Emagrecer em PDF").blocked, true);
  assert.equal(isBlockedProductOrCategory("Box Livros Harry Potter Edição Especial").blocked, true);

  // Receitas e dietas digitais
  assert.equal(isBlockedProductOrCategory("Guia de Receitas Seca Barriga Download Imediato").blocked, true);

  // Cursos e infoprodutos
  assert.equal(isBlockedProductOrCategory("Curso Online Completo de Tráfego Pago com Certificado").blocked, true);
  assert.equal(isBlockedProductOrCategory("Mentoria VIP + Planilha Financeira no Drive").blocked, true);
  assert.equal(isBlockedProductOrCategory("Apostila Digital para Concurso Público").blocked, true);

  // Por ID de categoria oficial do Mercado Livre (ex: MLB1196 = Livros, MLB1144)
  assert.equal(isBlockedProductOrCategory("Título Genérico", "MLB1196").blocked, true);
  assert.equal(isBlockedProductOrCategory("Outro Título", "MLB1144").blocked, true);

  // Produtos permitidos de moda, tênis, suplementos e perfumes NÃO DEVEM SER BLOQUEADOS
  assert.equal(isBlockedProductOrCategory("Tênis Nike Air Zoom Pegasus 40").blocked, false);
  assert.equal(isBlockedProductOrCategory("Creatina Creapure 250g Growth").blocked, false);
  assert.equal(isBlockedProductOrCategory("Perfume Asad Lattafa 100ml Original").blocked, false);
  assert.equal(isBlockedProductOrCategory("Camiseta Dry Fit Academia Masculina").blocked, false);
});

test("Filtro Eliminatório 8 reprova candidata com motivo explícito se for item bloqueado", () => {
  const bookCandidate: NormalizedCandidateProduct = {
    source: "mercadolivre",
    externalId: "MLB_BOOK",
    title: "Livro Café com Deus Pai 2026 - Capa Dura",
    thumbnail: "https://example.com/livro.jpg",
    price: 69.9,
    originalPrice: 120.0,
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/MLB_BOOK",
    freeShipping: true,
    isInStock: true,
    rating: 5.0,
    reviewsCount: 1000,
    capturedAt: new Date().toISOString(),
  };

  const result = evaluateCandidateOffer({ candidate: bookCandidate });
  assert.equal(result.passed, false, "Livro deve ser eliminado");
  assert.ok(
    result.audit.failedFilters.some((f) => f.includes("Categoria bloqueada")),
    "Deve conter o motivo explícito de categoria bloqueada"
  );
});

// =============================================================================
// 7. REGRESSÃO DO FORMATADOR E FLUXO WHATSAPP
// =============================================================================

test("Regressão do fluxo WhatsApp: formatAutoDispatchMessage mantém layout oficial preservado", () => {
  const offer = createMockOffer({
    id: "off-tenis",
    externalId: "MLB9999",
    title: "Tênis Adidas Ultraboost Light Masculino",
    price: 649.9,
    originalPrice: 1199.9,
    affiliateUrl: "https://mercadolivre.com/sec/xyz",
    shortUrl: "https://meli.la/tenis-ultra",
    freeShipping: true,
    coupon: "ADIDAS10",
    couponDescription: "10% OFF no cupom da loja",
    discountPercent: 45,
    status: "aprovado",
    whatsappStatus: "pronto",
    opportunityScore: 94,
    searchTerm: "tenis",
  });

  const msg = formatAutoDispatchMessage(offer);
  assert.ok(msg.includes("🔥 *Tênis Adidas Ultraboost Light Masculino*"), "Deve conter cabeçalho oficial de oferta com emoji de fogo");
  assert.ok(msg.includes("649,90"), "Deve conter preço promocional formatado em BRL");
  assert.ok(msg.includes("1.199,90"), "Deve conter preço original formatado");
  assert.ok(msg.includes("ADIDAS10"), "Deve conter cupom");
  assert.ok(msg.includes("45% OFF"), "Deve conter desconto");
  assert.ok(msg.includes("https://meli.la/tenis-ultra"), "Deve conter link oficial curto meli.la");
  assert.ok(msg.includes("Frete grátis"), "Deve conter menção a frete grátis");
  assert.ok(msg.includes("COMPRAR NO MERCADO LIVRE"), "Deve conter call-to-action oficial");
});
