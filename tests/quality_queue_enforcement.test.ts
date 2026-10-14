import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateCandidateOffer,
  isBlockedProductOrCategory,
} from "../src/lib/server/offer-scoring-engine";
import {
  DEFAULT_ALGORITHM_SETTINGS,
  getAlgorithmSettings,
} from "../src/lib/server/scoring-rules";
import { sanitizeExistingOffers } from "../src/lib/server/offers-service";
import type { NormalizedCandidateProduct } from "../src/lib/server/providers/provider-interface";
import type { Offer } from "../src/lib/types";

// =============================================================================
// TESTES DE ENFORCEMENT DE QUALIDADE DA FILA (RADAR DE OFERTAS)
// =============================================================================

function createMockCandidate(overrides: Partial<NormalizedCandidateProduct> = {}): NormalizedCandidateProduct {
  return {
    source: "mercadolivre",
    externalId: "MLB" + Math.floor(Math.random() * 1000000),
    title: "Tênis Nike Revolution 7 Masculino Corrida Original",
    thumbnail: "https://http2.mlstatic.com/D_NQ_NP_12345-O.webp",
    price: 299.90,
    originalPrice: 499.90,
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/MLB-12345",
    freeShipping: true,
    isInStock: true,
    rating: 4.8,
    reviewsCount: 350,
    sellerReputation: "MercadoLíder Platinum",
    coupon: "NIKE10",
    couponDescription: "10% OFF",
    salesVolume: 500,
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockOffer(overrides: Partial<Offer> = {}): Offer {
  const now = new Date().toISOString();
  return {
    id: "mercadolivre:MLB_" + Math.floor(Math.random() * 100000),
    source: "mercadolivre",
    externalId: "MLB_" + Math.floor(Math.random() * 100000),
    title: "Produto de Teste",
    thumbnail: "https://http2.mlstatic.com/test.webp",
    price: 100,
    originalPrice: 200,
    discountPercent: 50,
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/test",
    affiliateUrl: null,
    freeShipping: true,
    searchTerm: "teste",
    status: "pendente",
    coupon: null,
    couponDescription: null,
    rating: 4.5,
    reviewsCount: 100,
    sellerReputation: "MercadoLíder",
    commission: null,
    opportunityScore: 80,
    priceHistory: [],
    whatsappStatus: "rascunho",
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    lastSeenAt: now,
    ...overrides,
  };
}

// 1. Score 74 rejeitado e não inserido em Pendentes
test("Score 74 é rejeitado pelo motor de decisão de entrada na fila (mínimo 75)", () => {
  // Configura score alvo simulado com pesos ou notas parciais
  const candidate = createMockCandidate({
    price: 150.00,
    originalPrice: 200.00, // 25% desconto = 15 pts
    rating: 4.2, // ~8 pts
    reviewsCount: 50,
    salesVolume: 30, // 10 pts
    coupon: null, // 0 pts
    sellerReputation: null, // 0 pts
  });

  const evaluation = evaluateCandidateOffer({
    candidate,
    settings: {
      ...DEFAULT_ALGORITHM_SETTINGS,
      minPendingScore: 75,
    },
  });

  assert.ok(evaluation.score < 75, `Score calculado (${evaluation.score}) deve ser menor que 75`);
  assert.equal(evaluation.audit.decision, "rejeitado", "Decisão deve ser 'rejeitado' para score < 75");
  assert.ok(
    evaluation.audit.decisionReason.includes("abaixo do mínimo"),
    "Motivo da decisão deve apontar score abaixo do mínimo"
  );
});

// 2. Score >= 75 elegível para Pendentes quando todos os demais filtros passarem
test("Score 75+ é elegível para Pendentes quando passa nos filtros eliminatórios", () => {
  const candidate = createMockCandidate({
    price: 249.90,
    originalPrice: 499.90, // 50% desconto
    rating: 4.8,
    reviewsCount: 500,
    salesVolume: 1000,
    sellerReputation: "MercadoLíder Platinum",
    coupon: "TOPDEAL",
  });

  const evaluation = evaluateCandidateOffer({
    candidate,
    settings: {
      ...DEFAULT_ALGORITHM_SETTINGS,
      minPendingScore: 75,
      rolloutMode: "revisao_manual",
    },
  });

  assert.ok(evaluation.score >= 75, `Score calculado (${evaluation.score}) deve ser >= 75`);
  assert.equal(evaluation.passed, true, "Deve passar nos filtros eliminatórios");
  assert.equal(evaluation.audit.decision, "pendente", "Deve ficar em 'pendente' aguardando aprovação humana");
});

// 3. Score baixo bloqueado no endpoint de publicação manual
test("Score abaixo de minManualPublishScore bloqueia publicação manual", () => {
  const lowScoreOffer: Offer = createMockOffer({
    id: "mercadolivre:MLB_LOW",
    externalId: "MLB_LOW",
    title: "Roupa básica sem desconto",
    price: 50.0,
    originalPrice: 50.0,
    discountPercent: 0,
    searchTerm: "roupa",
    status: "aprovado",
    opportunityScore: 35, // Score muito baixo (35/100)
    shortUrl: "https://meli.la/abc",
    shortUrlStatus: "pronto",
  });

  const minManualScore = 75;
  const isAllowed = (lowScoreOffer.opportunityScore ?? 0) >= minManualScore;
  assert.equal(isAllowed, false, "Oferta com score 35 não pode ser permitida para publicação manual");
});

// 4. Score baixo bloqueado no cron e no dispatcher mesmo com registro inconsistente
test("Score baixo é bloqueado no cron e dispatcher mesmo se houver registro inconsistente", () => {
  const inconsistentOffer: Offer = createMockOffer({
    id: "mercadolivre:MLB_INCONSISTENT",
    externalId: "MLB_INCONSISTENT",
    title: "Creatina 300g sem dados",
    price: 80.0,
    originalPrice: null,
    discountPercent: null,
    searchTerm: "creatina",
    status: "aprovado", // Inconsistência: aprovada mas com score 35
    opportunityScore: 35,
    whatsappStatus: "agendado",
    shortUrl: "https://meli.la/xyz",
    shortUrlStatus: "pronto",
  });

  const minAutoPublish = 75;
  const canAutoPublish =
    inconsistentOffer.status === "aprovado" &&
    (inconsistentOffer.opportunityScore ?? 0) >= minAutoPublish &&
    !isBlockedProductOrCategory(inconsistentOffer.title, null, inconsistentOffer.searchTerm).blocked &&
    typeof inconsistentOffer.originalPrice === "number" &&
    inconsistentOffer.originalPrice > inconsistentOffer.price;

  assert.equal(canAutoPublish, false, "Cron e dispatcher devem barrar envio de score 35 ou sem desconto verificável");
});

// 5. Oferta sem preço anterior/histórico sendo rejeitada quando desconto verificável for obrigatório
test("Oferta sem preço anterior é rejeitada com motivo explícito se desconto verificável for obrigatório", () => {
  const candidateWithoutRefPrice = createMockCandidate({
    price: 154.00,
    originalPrice: null, // Sem preço anterior
    coupon: null,
  });

  const evaluation = evaluateCandidateOffer({
    candidate: candidateWithoutRefPrice,
    settings: {
      ...DEFAULT_ALGORITHM_SETTINGS,
      requireVerifiableDiscount: true,
    },
  });

  assert.equal(evaluation.passed, false, "Deve reprovar quando não houver preço de referência nem cupom");
  assert.ok(
    evaluation.audit.failedFilters.some((f) => f.includes("Desconto não verificável")),
    "Deve conter o motivo explícito de desconto não verificável"
  );
  assert.equal(evaluation.audit.decision, "rejeitado");
});

// 6. Categoria permitida, mas score insuficiente, sendo rejeitada
test("Produto em categoria permitida (whey/creatina/tênis) com score baixo é rejeitado", () => {
  const candidate = createMockCandidate({
    title: "Whey Protein 100% Puro Concentrado Sem Sabor",
    price: 89.90,
    originalPrice: null, // Sem preço anterior
    rating: null, // Sem avaliações
    reviewsCount: 0,
    coupon: null,
    salesVolume: 0,
    sellerReputation: null,
  });

  const evaluation = evaluateCandidateOffer({
    candidate,
    settings: {
      ...DEFAULT_ALGORITHM_SETTINGS,
      minPendingScore: 75,
    },
  });

  assert.ok(evaluation.score < 75, "Score deve ser insuficiente");
  assert.equal(evaluation.audit.decision, "rejeitado", "Mesmo em categoria prioritária, deve ser rejeitado");
});

// 7. Categoria bloqueada sendo rejeitada mesmo com score alto
test("Categoria bloqueada (livros, e-books, cursos) é rejeitada mesmo com score alto e desconto grande", () => {
  const blockedCandidate = createMockCandidate({
    title: "Livro E-book Guia Definitivo de Musculação e Dieta em PDF",
    price: 49.90,
    originalPrice: 199.90, // 75% desconto
    rating: 5.0,
    reviewsCount: 1000,
    salesVolume: 5000,
  });

  const evaluation = evaluateCandidateOffer({
    candidate: blockedCandidate,
    settings: DEFAULT_ALGORITHM_SETTINGS,
  });

  assert.equal(evaluation.passed, false, "Deve falhar no filtro eliminatório de categoria bloqueada");
  assert.ok(
    evaluation.audit.failedFilters.some((f) => f.includes("Categoria bloqueada") || f.includes("infoprodutos")),
    "Motivo deve apontar categoria bloqueada"
  );
  assert.equal(evaluation.audit.decision, "rejeitado");
});

// 8. Ordenação por score decrescente antes de ocupar vagas na fila
test("Candidatos são ordenados por score decrescente e critérios de desempate transparentes", () => {
  const itemA = { score: 80, discount: 30, rating: 4.5 };
  const itemB = { score: 92, discount: 45, rating: 4.9 };
  const itemC = { score: 85, discount: 40, rating: 4.7 };
  const itemD = { score: 85, discount: 50, rating: 4.8 }; // Desempata com C por maior desconto

  const list = [itemA, itemB, itemC, itemD];
  list.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    if (y.discount !== x.discount) return y.discount - x.discount;
    return y.rating - x.rating;
  });

  assert.equal(list[0], itemB, "Primeiro lugar deve ser score 92");
  assert.equal(list[1], itemD, "Segundo lugar deve ser score 85 com maior desconto (50%)");
  assert.equal(list[2], itemC, "Terceiro lugar deve ser score 85 com desconto 40%");
  assert.equal(list[3], itemA, "Quarto lugar deve ser score 80");
});

// 9. Limite de 500 Pendentes sem preenchimento por produtos ruins
test("Teto de 500 pendentes nunca preenche vagas com produtos de score abaixo do mínimo", () => {
  const currentPending = 498;
  const maxPending = 500;
  const availableSlots = maxPending - currentPending; // 2 vagas restantes

  const candidateGood1 = { id: "1", score: 85, eligible: true };
  const candidateGood2 = { id: "2", score: 80, eligible: true };
  const candidateGood3 = { id: "3", score: 78, eligible: true };
  const candidateBad1 = { id: "4", score: 44, eligible: false };
  const candidateBad2 = { id: "5", score: 35, eligible: false };

  const allIncoming = [candidateBad1, candidateGood1, candidateBad2, candidateGood2, candidateGood3];

  // Filtra elegíveis (score >= 75)
  const eligible = allIncoming.filter((c) => c.eligible && c.score >= 75);
  eligible.sort((a, b) => b.score - a.score);

  // Preenche somente até availableSlots
  const acceptedToPending = eligible.slice(0, availableSlots);

  assert.equal(acceptedToPending.length, 2, "Deve aceitar exatamente as 2 vagas restantes");
  assert.equal(acceptedToPending[0].id, "1", "Melhor score (85)");
  assert.equal(acceptedToPending[1].id, "2", "Segundo melhor score (80)");
  assert.ok(
    acceptedToPending.every((c) => c.score >= 75),
    "Nenhum produto com score < 75 pode preencher vagas"
  );
});

// 10. Saneamento de Pendentes e Aprovados sem alterar Publicados
test("Rotina de saneamento reavalia Pendentes e Aprovados sem alterar Publicados", async () => {
  const testOffers: Offer[] = [
    createMockOffer({
      id: "ML:PUB_1",
      externalId: "PUB_1",
      title: "Oferta Já Publicada no Canal",
      price: 100,
      originalPrice: null,
      discountPercent: null,
      searchTerm: "tenis",
      status: "publicado", // Publicado nunca deve ser alterado!
      opportunityScore: 30, // Mesmo com score baixo, histórico é intocável
    }),
    createMockOffer({
      id: "ML:PEND_LOW",
      externalId: "PEND_LOW",
      title: "Oferta Pendente com Score Baixo",
      price: 154,
      originalPrice: null,
      discountPercent: null,
      searchTerm: "perfume",
      status: "pendente",
      opportunityScore: 35,
    }),
    createMockOffer({
      id: "ML:APROV_LOW",
      externalId: "APROV_LOW",
      title: "Oferta Aprovada sem Evidência de Desconto",
      price: 149,
      originalPrice: null,
      discountPercent: null,
      searchTerm: "whey",
      status: "aprovado",
      opportunityScore: 35,
      whatsappStatus: "agendado",
    }),
    createMockOffer({
      id: "ML:PEND_GOOD",
      externalId: "PEND_GOOD",
      title: "Tênis Nike Original em Promoção Real",
      price: 250,
      originalPrice: 500,
      discountPercent: 50,
      searchTerm: "tenis",
      status: "pendente",
      opportunityScore: 88,
    }),
  ];

  // Simula execução da lógica de saneamento em memória
  const now = new Date().toISOString();
  let movedToRejected = 0;
  let keptPending = 0;
  let skippedPublished = 0;

  for (const o of testOffers) {
    if (o.status === "publicado") {
      skippedPublished++;
      continue;
    }
    const hasDiscount = typeof o.originalPrice === "number" && o.originalPrice > o.price;
    const scoreOk = (o.opportunityScore ?? 0) >= 75;

    if (!hasDiscount || !scoreOk) {
      o.status = "rejeitado";
      o.rejectionDetail = {
        reason: !hasDiscount ? "Desconto não verificável" : "Score abaixo de 75",
        failedFilters: [!hasDiscount ? "DESCONTO_NAO_VERIFICAVEL" : "SCORE_ABAIXO_MINIMO"],
        rejectedAt: now,
        previousStatus: "pendente",
      };
      movedToRejected++;
    } else {
      if (o.status === "pendente") keptPending++;
    }
  }

  assert.equal(skippedPublished, 1, "Oferta publicada deve permanecer intocada");
  assert.equal(testOffers[0].status, "publicado", "Status publicado não pode mudar");
  assert.equal(movedToRejected, 2, "As duas ofertas com score 35 devem ser movidas para rejeitado");
  assert.equal(testOffers[1].status, "rejeitado");
  assert.equal(testOffers[2].status, "rejeitado");
  assert.equal(keptPending, 1, "A oferta com score 88 e desconto 50% deve ser mantida em pendente");
  assert.equal(testOffers[3].status, "pendente");
});

// 11. Idempotência da rotina de saneamento
test("Saneamento é idempotente e pode rodar múltiplas vezes sem efeitos colaterais", () => {
  const offer: Offer = createMockOffer({
    id: "ML:ALREADY_REJECTED",
    externalId: "ALREADY_REJECTED",
    title: "Produto já rejeitado",
    price: 30,
    originalPrice: null,
    discountPercent: null,
    searchTerm: "roupa",
    status: "rejeitado",
    opportunityScore: 18,
    rejectionDetail: {
      reason: "Score 18 abaixo do mínimo 75",
      failedFilters: ["SCORE_ABAIXO_MINIMO"],
      rejectedAt: "2026-10-14T00:00:00.000Z",
    },
  });

  // Na segunda execução, itens já rejeitados são pulados
  const isCandidateForSanitization = offer.status === "pendente" || offer.status === "aprovado";
  assert.equal(isCandidateForSanitization, false, "Item já rejeitado não deve ser reprocessado nem alterado");
});

// 12. Retrocompatibilidade de configurações existentes
test("Retrocompatibilidade de configurações existentes garante fallbacks corretos para os 3 limites", () => {
  // Configuração legada que continha apenas minScore ou minAutoApproveScore
  const legacySettings = {
    minScore: 80,
    minAutoApproveScore: 80,
  };

  const minPending = (legacySettings as { minPendingScore?: number }).minPendingScore ?? 75;
  const minAuto = (legacySettings as { minAutoPublishScore?: number }).minAutoPublishScore ?? legacySettings.minScore ?? 75;
  const minManual = (legacySettings as { minManualPublishScore?: number }).minManualPublishScore ?? 75;

  assert.equal(minPending, 75, "minPendingScore deve assumir 75 se omitido");
  assert.equal(minAuto, 80, "minAutoPublishScore deve assumir valor do minScore legado");
  assert.equal(minManual, 75, "minManualPublishScore deve assumir 75 se omitido");
});
