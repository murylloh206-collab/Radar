import test from "node:test";
import assert from "node:assert/strict";
import {
  extractBrand,
  getPriceRange,
  tokenizeText,
  generateTextEmbedding,
  computeCosineSimilarity,
  extractStructuredFeatures,
  isOfferBlocked,
  calculatePreferenceScore,
  rankOffersWithExploration,
  trainLinearClassifier,
} from "../src/lib/server/recommendation-engine";
import type { LearnedPreferences, Offer, OfferFeedback } from "../src/lib/types";

const baseOffer: Offer = {
  id: "mercadolivre:MLB1001",
  source: "mercadolivre",
  externalId: "MLB1001",
  title: "Tênis Nike Air Max Masculino Corrida",
  thumbnail: "https://example.com/nike.jpg",
  price: 399.9,
  originalPrice: 599.9,
  discountPercent: 33,
  currency: "BRL",
  originalUrl: "https://mercadolivre.com.br/item1",
  freeShipping: true,
  searchTerm: "Tênis de Marca",
  status: "pendente",
  affiliateUrl: "https://mercadolivre.com.br/item1?aff=1",
  coupon: null,
  couponDescription: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
  statusChangedAt: null,
};

const defaultPreferences: LearnedPreferences = {
  blockedBrands: [],
  blockedSellers: [],
  blockedKeywords: [],
  blockedCategories: [],
  featureWeights: {},
  totalApprovals: 0,
  totalRejections: 0,
  lastTrainedAt: null,
};

test("Extrai marcas populares corretamente a partir do título", () => {
  assert.equal(extractBrand("Tênis Nike Revolution 6"), "Nike");
  assert.equal(extractBrand("Air fryer Mondial 4 Litros"), "Mondial");
  assert.equal(extractBrand("Tênis New Balance 530"), "New Balance");
  assert.equal(extractBrand("Creatina Creapure 300g"), "Creapure");
  assert.equal(extractBrand("Fritadeira sem óleo"), "Genérica");
});

test("Calcula faixas de preço de forma consistente", () => {
  assert.equal(getPriceRange(35), "ate_50");
  assert.equal(getPriceRange(79.9), "50_100");
  assert.equal(getPriceRange(159.9), "100_200");
  assert.equal(getPriceRange(349.9), "200_400");
  assert.equal(getPriceRange(599.9), "400_800");
  assert.equal(getPriceRange(1299), "acima_800");
});

test("Gera embeddings normalizados e calcula similaridade de cosseno com precisão", () => {
  const vec1 = generateTextEmbedding("Tênis Nike Corrida", "Nike", "Tênis");
  const vec2 = generateTextEmbedding("Tênis Nike Corrida", "Nike", "Tênis");
  const vec3 = generateTextEmbedding("Fritadeira Mondial Air Fryer", "Mondial", "Eletrodomésticos");

  const simIdentical = computeCosineSimilarity(vec1, vec2);
  const simDifferent = computeCosineSimilarity(vec1, vec3);

  assert.ok(Math.abs(simIdentical - 1.0) < 0.01);
  assert.ok(simDifferent < 0.2);
});

test("Regra imediata: bloqueia anúncios correspondentes a marcas, vendedores e palavras bloqueadas", () => {
  const prefs: LearnedPreferences = {
    ...defaultPreferences,
    blockedBrands: ["Mondial"],
    blockedSellers: ["Loja Suspeita"],
    blockedKeywords: ["segunda linha"],
  };

  const offerBrandBlocked = {
    title: "Fritadeira Mondial Air Fryer",
    brand: "Mondial",
    sellerName: "Loja Oficial",
    searchTerm: "Eletro",
  };
  assert.equal(isOfferBlocked(offerBrandBlocked, prefs).blocked, true);

  const offerSellerBlocked = {
    title: "Camiseta Dry Fit",
    brand: "Genérica",
    sellerName: "Loja Suspeita",
    searchTerm: "Roupas",
  };
  assert.equal(isOfferBlocked(offerSellerBlocked, prefs).blocked, true);

  const offerKeywordBlocked = {
    title: "Tênis de corrida segunda linha",
    brand: "Genérica",
    sellerName: "Vendedor OK",
    searchTerm: "Tênis",
  };
  assert.equal(isOfferBlocked(offerKeywordBlocked, prefs).blocked, true);

  const offerAllowed = {
    title: "Tênis Adidas Ultraboost",
    brand: "Adidas",
    sellerName: "Loja Oficial",
    searchTerm: "Tênis",
  };
  assert.equal(isOfferBlocked(offerAllowed, prefs).blocked, false);
});

test("Regra imediata: rejeição por 'produto_tipo_errado' reduz drasticamente produtos semanticamente parecidos", () => {
  const feedbackRejeitado: OfferFeedback = {
    id: "fb_1",
    offerId: "mercadolivre:MLB_REJ",
    externalId: "MLB_REJ",
    action: "rejeitar",
    reason: "produto_tipo_errado",
    createdAt: new Date().toISOString(),
    title: "Kit 5 Cuecas Boxer Algodão Conforto",
    category: "Moda",
    brand: "Lupo",
    price: 89.9,
    freeShipping: true,
  };

  const ofertaSemelhante: Offer = {
    ...baseOffer,
    id: "mercadolivre:MLB_TEST_1",
    title: "Kit 10 Cuecas Boxer Microfibra",
    searchTerm: "Moda",
    brand: "Lupo",
    price: 99.9,
  };

  const ofertaTotalmenteDiferente: Offer = {
    ...baseOffer,
    id: "mercadolivre:MLB_TEST_2",
    title: "Air Fryer Britânia Inox 4L",
    searchTerm: "Eletro",
    brand: "Britânia",
    price: 289.9,
  };

  const scoreSemelhante = calculatePreferenceScore(ofertaSemelhante, [feedbackRejeitado], defaultPreferences);
  const scoreDiferente = calculatePreferenceScore(ofertaTotalmenteDiferente, [feedbackRejeitado], defaultPreferences);

  // O produto semanticamente parecido sofre penalidade drástica
  assert.ok(scoreSemelhante.score < 0.35);
  assert.ok(scoreDiferente.score > scoreSemelhante.score);
});

test("Regra imediata: rejeição por 'preco_alto' reduz a mesma faixa de preço sem bloquear a categoria inteira", () => {
  const feedbackPrecoAlto: OfferFeedback = {
    id: "fb_2",
    offerId: "mercadolivre:MLB_CARO",
    externalId: "MLB_CARO",
    action: "rejeitar",
    reason: "preco_alto",
    createdAt: new Date().toISOString(),
    title: "Camiseta Masculina Algodão Pima",
    category: "Roupas e Moda Fitness",
    brand: "PimaBrand",
    price: 320, // Faixa 200_400
    freeShipping: true,
  };

  const mesmaFaixaMesmaCat: Offer = {
    ...baseOffer,
    title: "Camiseta Casual Linho",
    searchTerm: "Roupas e Moda Fitness",
    price: 290, // Mesma faixa 200_400
  };

  const precoMaisBaixoMesmaCat: Offer = {
    ...baseOffer,
    title: "Camiseta Academia Treino Dry Fit",
    searchTerm: "Roupas e Moda Fitness",
    price: 49.9, // Faixa mais baixa ate_50
  };

  const scoreMesmaFaixa = calculatePreferenceScore(mesmaFaixaMesmaCat, [feedbackPrecoAlto], defaultPreferences);
  const scoreMaisBaixo = calculatePreferenceScore(precoMaisBaixoMesmaCat, [feedbackPrecoAlto], defaultPreferences);

  // Mesma faixa de preço e categoria recebe penalidade
  assert.ok(scoreMesmaFaixa.score < scoreMaisBaixo.score);
  // Categoria NÃO bloqueada para preços mais acessíveis
  assert.ok(scoreMaisBaixo.score >= 0.5);
});

test("Regra imediata: aprovação aumenta prioridade de ofertas parecidas por marca, categoria e faixa", () => {
  const feedbackAprovado: OfferFeedback = {
    id: "fb_3",
    offerId: baseOffer.id,
    externalId: baseOffer.externalId,
    action: "aprovar",
    createdAt: new Date().toISOString(),
    title: baseOffer.title,
    category: baseOffer.searchTerm,
    brand: "Nike",
    price: baseOffer.price,
    discountPercent: baseOffer.discountPercent,
    freeShipping: baseOffer.freeShipping,
  };

  const ofertaParecidaNike: Offer = {
    ...baseOffer,
    id: "mercadolivre:MLB_NIKE_2",
    title: "Tênis Nike Downshifter 12 Masculino",
    brand: "Nike",
    price: 299.9,
  };

  const ofertaOutraMarca: Offer = {
    ...baseOffer,
    id: "mercadolivre:MLB_OTHER",
    title: "Cafeteira Elétrica Mondial",
    brand: "Mondial",
    searchTerm: "Eletrodomésticos",
    price: 120.0,
  };

  const resNike = calculatePreferenceScore(ofertaParecidaNike, [feedbackAprovado], defaultPreferences);
  const resOutra = calculatePreferenceScore(ofertaOutraMarca, [feedbackAprovado], defaultPreferences);

  assert.ok(resNike.score > 0.7);
  assert.equal(resNike.reason, "Parecido com ofertas que você aprovou");
  assert.ok(resNike.score > resOutra.score);
});

test("Reserva 15% das ofertas exibidas para exploração de novos interesses", () => {
  // Cria 20 ofertas de teste
  const offersList: Offer[] = Array.from({ length: 20 }, (_, idx) => ({
    ...baseOffer,
    id: `mercadolivre:MLB_TEST_${idx}`,
    externalId: `MLB_TEST_${idx}`,
    title: idx < 15 ? `Tênis Nike Modelo ${idx}` : `Produto Diverso Categoria ${idx}`,
    searchTerm: idx < 15 ? "Tênis de Marca" : "Outra Categoria",
    brand: idx < 15 ? "Nike" : "OutraMarca",
    price: 100 + idx * 20,
  }));

  const feedbackAprovado: OfferFeedback = {
    id: "fb_nike",
    offerId: baseOffer.id,
    externalId: baseOffer.externalId,
    action: "aprovar",
    createdAt: new Date().toISOString(),
    title: "Tênis Nike Air Max Masculino Corrida",
    category: "Tênis de Marca",
    brand: "Nike",
    price: 399.9,
    freeShipping: true,
  };

  const ranked = rankOffersWithExploration(offersList, [feedbackAprovado], defaultPreferences);

  // O total exibido deve ser 20
  assert.equal(ranked.length, 20);

  // Exatamente ~15% de 20 = 3 ofertas marcadas com exploração
  const explorationItems = ranked.filter((o) => o.isExploration);
  assert.equal(explorationItems.length, 3);
  assert.equal(explorationItems[0].recommendationReason, "Novo teste de categoria");
});

test("Treina classificador linear simples quando total de decisões >= 50", () => {
  const feedbacks: OfferFeedback[] = [];
  for (let i = 0; i < 35; i++) {
    feedbacks.push({
      id: `fb_app_${i}`,
      offerId: `MLB_APP_${i}`,
      externalId: `MLB_APP_${i}`,
      action: "aprovar",
      createdAt: new Date().toISOString(),
      title: "Tênis Nike Air Corrida",
      category: "Tênis de Marca",
      brand: "Nike",
      price: 299.9,
      freeShipping: true,
    });
  }
  for (let i = 0; i < 20; i++) {
    feedbacks.push({
      id: `fb_rej_${i}`,
      offerId: `MLB_REJ_${i}`,
      externalId: `MLB_REJ_${i}`,
      action: "rejeitar",
      reason: "produto_tipo_errado",
      createdAt: new Date().toISOString(),
      title: "Kit Panos de Prato",
      category: "Utilidades",
      brand: "Genérica",
      price: 35.0,
      freeShipping: false,
    });
  }

  const weights = trainLinearClassifier(feedbacks);
  assert.ok(Object.keys(weights).length > 0);

  const nikeKey = Object.keys(weights).find((k) => k.includes("nike"));
  assert.ok(nikeKey !== undefined);
  if (nikeKey) {
    assert.ok(weights[nikeKey] > 0);
  }
});
