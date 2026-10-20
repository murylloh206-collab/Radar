import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateCategoryQuotas,
  getCategoryPriceRange,
  trainLinearClassifier,
  extractBrand,
} from "../src/lib/server/recommendation-engine";
import { validateOfferCandidate } from "../src/lib/server/scanner/validator";
import { importBrotherFavorites } from "../src/lib/server/favorites-importer";
import type { OfferFeedback } from "../src/lib/types";

test("Etapa C: Suavização de Laplace nas cotas por categoria com mínimo fixo de exploração", () => {
  const categories = ["Eletroportáteis", "Suplementos", "Tênis de Marca", "Games"];
  
  // Feedbacks simulados: Eletroportáteis (4 aprovações de 5), Suplementos (0 aprovações de 6)
  const feedbacks: OfferFeedback[] = [
    { id: "1", offerId: "o1", externalId: "e1", action: "aprovar", title: "Air Fryer", price: 250, category: "Eletroportáteis", createdAt: "", freeShipping: true },
    { id: "2", offerId: "o2", externalId: "e2", action: "aprovar", title: "Air Fryer", price: 280, category: "Eletroportáteis", createdAt: "", freeShipping: true },
    { id: "3", offerId: "o3", externalId: "e3", action: "aprovar", title: "Cafeteira", price: 300, category: "Eletroportáteis", createdAt: "", freeShipping: true },
    { id: "4", offerId: "o4", externalId: "e4", action: "aprovar", title: "Liquidificador", price: 150, category: "Eletroportáteis", createdAt: "", freeShipping: true },
    { id: "5", offerId: "o5", externalId: "e5", action: "rejeitar", title: "Panela", price: 120, category: "Eletroportáteis", createdAt: "", freeShipping: true },
    
    // Suplementos: 6 rejeições consecutivas
    { id: "6", offerId: "o6", externalId: "e6", action: "rejeitar", title: "Whey", price: 100, category: "Suplementos", createdAt: "", freeShipping: true },
    { id: "7", offerId: "o7", externalId: "e7", action: "rejeitar", title: "Whey", price: 110, category: "Suplementos", createdAt: "", freeShipping: true },
    { id: "8", offerId: "o8", externalId: "e8", action: "rejeitar", title: "Whey", price: 120, category: "Suplementos", createdAt: "", freeShipping: true },
    { id: "9", offerId: "o9", externalId: "e9", action: "rejeitar", title: "Creatina", price: 80, category: "Suplementos", createdAt: "", freeShipping: true },
    { id: "10", offerId: "o10", externalId: "e10", action: "rejeitar", title: "Creatina", price: 90, category: "Suplementos", createdAt: "", freeShipping: true },
    { id: "11", offerId: "o11", externalId: "e11", action: "rejeitar", title: "Creatina", price: 95, category: "Suplementos", createdAt: "", freeShipping: true },
  ];

  const quotas = calculateCategoryQuotas(categories, feedbacks, 15, 2);

  // Eletroportáteis: (4 + 1) / (5 + 2) = 5/7 ≈ 0.714
  const eletroQuota = quotas.find((q) => q.category === "Eletroportáteis");
  assert.ok(eletroQuota);
  assert.equal(eletroQuota.smoothedRate, 0.714);

  // Suplementos: (0 + 1) / (6 + 2) = 1/8 = 0.125
  const supQuota = quotas.find((q) => q.category === "Suplementos");
  assert.ok(supQuota);
  assert.equal(supQuota.smoothedRate, 0.125);
  // Garante que mesmo com 6 rejeições, nunca fica zerada graças ao mínimo fixo de exploração (minExplorationSlots = 2)
  assert.ok(supQuota.allocatedSlots >= 2);
  assert.equal(supQuota.isExplorationOnly, true);

  // Categorias sem dados: (0 + 1) / (0 + 2) = 0.5
  const gamesQuota = quotas.find((q) => q.category === "Games");
  assert.ok(gamesQuota);
  assert.equal(gamesQuota.smoothedRate, 0.5);
  assert.ok(gamesQuota.allocatedSlots >= 2);
});

test("Etapa C: Pesos de classe - Próprias (5.0), Favoritos Irmão (2.5) e Rejeições (1.0)", () => {
  const feedbacks: OfferFeedback[] = [];

  // Gera 50 feedbacks para atingir threshold de treino do classificador
  for (let i = 0; i < 20; i++) {
    feedbacks.push({
      id: `prop_${i}`,
      offerId: `o_prop_${i}`,
      externalId: `e_prop_${i}`,
      action: "aprovar",
      title: `Tênis Nike Air Max ${i}`,
      brand: "Nike",
      price: 280,
      createdAt: "",
      freeShipping: true,
      metadata: { source: "propria" },
    });
  }

  for (let i = 0; i < 15; i++) {
    feedbacks.push({
      id: `irmao_${i}`,
      offerId: `o_irmao_${i}`,
      externalId: `e_irmao_${i}`,
      action: "aprovar",
      title: `Air Fryer Mondial Grand Family ${i}`,
      brand: "Mondial",
      price: 220,
      createdAt: "",
      freeShipping: true,
      metadata: { source: "seed_favoritos_irmao" },
    });
  }

  for (let i = 0; i < 25; i++) {
    feedbacks.push({
      id: `rej_${i}`,
      offerId: `o_rej_${i}`,
      externalId: `e_rej_${i}`,
      action: "rejeitar",
      title: `Smartphone Genérico Barato ${i}`,
      brand: "Genérica",
      price: 150,
      createdAt: "",
      freeShipping: true,
    });
  }

  const weights = trainLinearClassifier(feedbacks);
  assert.ok(Object.keys(weights).length > 0, "O classificador deve gerar pesos");
  
  // O peso de marcas aprovadas próprias e de irmão deve ser marcadamente positivo
  const nikeWeight = weights["brand:nike"] || 0;
  const mondialWeight = weights["brand:mondial"] || 0;
  assert.ok(nikeWeight > 0, "Marca de aprovação própria deve ter peso positivo");
  assert.ok(mondialWeight > 0, "Marca de favoritos do irmão deve ter peso positivo");
});

test("Etapa C: Importador de favoritos registra 'nao_resolvido' em vez de inventar dados quando metadados falham", async () => {
  // URLs simuladas inválidas/inexistentes
  const badUrls = [
    "https://shopee.com.br/produto-inexistente-sem-id",
    "https://www.mercadolivre.com.br/pagina-inexistente-404-teste",
    "https://site-estranho.com.br/item/123",
  ];

  const summary = await importBrotherFavorites(badUrls);
  assert.equal(summary.total, 3);
  assert.equal(summary.imported, 0);
  assert.equal(summary.unresolved, 3);

  for (const res of summary.results) {
    assert.equal(res.status, "nao_resolvido");
    assert.ok(res.reason && res.reason.length > 0);
    assert.equal(res.title, undefined);
    assert.equal(res.price, undefined);
  }
});

test("Etapa D: Faixas de preço aprendidas por categoria exigem 5 aprovações e usam percentis p10-p90", () => {
  // Caso 1: Categoria com 4 aprovações (menos de 5) -> Fallback padrão
  const sparseFeedbacks: OfferFeedback[] = [
    { id: "1", offerId: "o1", externalId: "e1", action: "aprovar", title: "Air Fryer 1", price: 150, category: "Eletroportáteis", createdAt: "", freeShipping: true },
    { id: "2", offerId: "o2", externalId: "e2", action: "aprovar", title: "Air Fryer 2", price: 180, category: "Eletroportáteis", createdAt: "", freeShipping: true },
    { id: "3", offerId: "o3", externalId: "e3", action: "aprovar", title: "Air Fryer 3", price: 210, category: "Eletroportáteis", createdAt: "", freeShipping: true },
    { id: "4", offerId: "o4", externalId: "e4", action: "aprovar", title: "Air Fryer 4", price: 250, category: "Eletroportáteis", createdAt: "", freeShipping: true },
  ];

  const sparseRange = getCategoryPriceRange("Eletroportáteis", sparseFeedbacks, 80, 450);
  assert.equal(sparseRange.isLearned, false);
  assert.equal(sparseRange.minPrice, 80);
  assert.equal(sparseRange.maxPrice, 450);

  // Caso 2: Categoria com 6 aprovações (>= 5) com um outlier extremo -> Percentis p10 e p90 filtram o outlier
  const richFeedbacks: OfferFeedback[] = [
    { id: "1", offerId: "o1", externalId: "e1", action: "aprovar", title: "Air Fryer 1", price: 150, category: "Eletroportáteis", createdAt: "", freeShipping: true },
    { id: "2", offerId: "o2", externalId: "e2", action: "aprovar", title: "Air Fryer 2", price: 180, category: "Eletroportáteis", createdAt: "", freeShipping: true },
    { id: "3", offerId: "o3", externalId: "e3", action: "aprovar", title: "Air Fryer 3", price: 200, category: "Eletroportáteis", createdAt: "", freeShipping: true },
    { id: "4", offerId: "o4", externalId: "e4", action: "aprovar", title: "Air Fryer 4", price: 220, category: "Eletroportáteis", createdAt: "", freeShipping: true },
    { id: "5", offerId: "o5", externalId: "e5", action: "aprovar", title: "Air Fryer 5", price: 250, category: "Eletroportáteis", createdAt: "", freeShipping: true },
    { id: "6", offerId: "o6", externalId: "e6", action: "aprovar", title: "Air Fryer Outlier", price: 900, category: "Eletroportáteis", createdAt: "", freeShipping: true },
  ];

  const learnedRange = getCategoryPriceRange("Eletroportáteis", richFeedbacks, 80, 450);
  assert.equal(learnedRange.isLearned, true);
  assert.ok(learnedRange.minPrice >= 80);
  // O teto aprendido deve estar bem abaixo do outlier de 900 graças ao p90
  assert.ok(learnedRange.maxPrice < 800, `Max price esperado < 800 mas deu ${learnedRange.maxPrice}`);

  // Validação de item caro que ultrapassa o teto aprendido
  const expensiveItem = {
    externalId: "mlb_exp",
    title: "Air Fryer Oster Digital Premium 6L",
    thumbnail: null,
    price: 850,
    originalPrice: 1100,
    currency: "BRL",
    originalUrl: "https://produto.mercadolivre.com.br/MLB-123",
    freeShipping: true,
  };

  const validation = validateOfferCandidate(expensiveItem, learnedRange);
  assert.equal(validation.valid, false);
  assert.equal(validation.rejectionCode, "MAX_PRICE");
});
