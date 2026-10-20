import "server-only";

import type { Offer, OfferFeedback, LearnedPreferences, RejectionReason } from "../types";

/**
 * MOTOR DE RECOMENDAÇÃO INTELIGENTE & APRENDIZADO DE PREFERÊNCIAS
 * ----------------------------------------------------------------
 * 1. Extração de atributos estruturados e marca/vendedor.
 * 2. Vetorizador de embedding textual L2 normalizado (TF-IDF subword n-gram).
 * 3. Similaridade cosseno contra histórico de aprovados e rejeitados.
 * 4. Aplicação rigorosa das regras imediatas por motivo de rejeição.
 * 5. Classificador linear simples quando total de decisões >= 50.
 * 6. Reserva de 15% das ofertas exibidas para exploração de novos interesses.
 */

// Stopwords em Português do Brasil para limpeza de tokens
const PT_STOPWORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas",
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "por", "para", "com", "sem", "sob", "sobre", "entre",
  "e", "ou", "mas", "que", "se", "como", "ao", "aos",
  "novo", "nova", "novos", "novas", "original", "oficial",
  "promocao", "oferta", "frete", "gratis", "kit", "pack",
]);

// Dicionário de marcas conhecidas para identificação precisa
const POPULAR_BRANDS = [
  // Tênis e Calçados
  "nike", "adidas", "puma", "new balance", "mizuno", "asics", "olympikus",
  "fila", "under armour", "reebok", "vans", "converse", "havaianas", "crocs",
  // Roupas e Fitness
  "growth", "max titanium", "integralmedica", "darkness", "dux", "probiotica",
  "creapure", "soldiers", "dr peanut",
  // Eletrodomésticos e Casa
  "mondial", "philco", "electrolux", "brastemp", "consul", "arno", "oster",
  "britania", "cadence", "mallory", "midea", "walita", "panasonic",
  // Beleza e Perfumaria
  "boticario", "o boticario", "natura", "eudora", "granado", "calvin klein",
  "paco rabanne", "carolina herrera", "dior", "chanel", "versace", "ferrari",
  "loreal", "cerave", "la roche posay", "neutrogena",
  // Eletrônicos e Games
  "apple", "samsung", "xiaomi", "sony", "jbl", "logitech", "hyperx", "redragon",
  "lenovo", "dell", "asus", "motorola", "playstation", "xbox", "nintendo",
];

/**
 * Atributos estruturados extraídos de uma oferta
 */
export interface StructuredOfferFeatures {
  brand: string;
  category: string;
  priceRange: string;
  price: number;
  discountLevel: "sem_desconto" | "baixo" | "medio" | "alto";
  ratingTier: "sem_avaliacao" | "regular" | "bom" | "excelente";
  freeShipping: boolean;
  seller: string;
  keywords: string[];
  embedding: Map<string, number>;
}

/**
 * Normaliza strings removendo acentos e pontuações
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai a marca de forma determinística
 */
export function extractBrand(title: string, existingBrand?: string | null): string {
  if (existingBrand && existingBrand.trim().length > 1) {
    return existingBrand.trim();
  }

  const clean = normalizeText(title);

  // 1. Procura primeiro marcas compostas ("new balance", "under armour", "la roche posay", etc.)
  for (const b of POPULAR_BRANDS) {
    if (b.includes(" ") && clean.includes(b)) {
      return b.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }

  // 2. Procura marcas simples com limite de palavras (\b)
  for (const b of POPULAR_BRANDS) {
    if (!b.includes(" ")) {
      const regex = new RegExp(`\\b${b}\\b`, "i");
      if (regex.test(clean)) {
        return b.charAt(0).toUpperCase() + b.slice(1);
      }
    }
  }

  // 3. Fallback: Se não encontrou no dicionário, extrai a primeira palavra significativa se não for genérica
  const words = clean.split(" ").filter((w) => w.length > 2 && !PT_STOPWORDS.has(w));
  if (words.length > 0 && !["tenis", "camiseta", "calca", "air", "fritadeira", "fone", "perfume"].includes(words[0])) {
    return words[0].charAt(0).toUpperCase() + words[0].slice(1);
  }

  return "Genérica";
}

/**
 * Mapeia a faixa de preço relativa
 */
export function getPriceRange(price: number): string {
  if (price < 50) return "ate_50";
  if (price < 100) return "50_100";
  if (price < 200) return "100_200";
  if (price < 400) return "200_400";
  if (price < 800) return "400_800";
  return "acima_800";
}

/**
 * Tokeniza texto e gera n-grams para embedding denso-esparso
 */
export function tokenizeText(text: string): string[] {
  const clean = normalizeText(text);
  const words = clean.split(" ").filter((w) => w.length > 1 && !PT_STOPWORDS.has(w));
  const tokens: string[] = [...words];

  // Adiciona bigrams para capturar contexto semântico ("air fryer", "whey protein", etc.)
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]}_${words[i + 1]}`);
  }

  return tokens;
}

/**
 * Gera embedding textual L2-normalizado a partir de título, marca, categoria e atributos
 */
export function generateTextEmbedding(
  title: string,
  brand: string,
  category: string,
  extraTokens: string[] = []
): Map<string, number> {
  const termCounts = new Map<string, number>();

  // Título tem peso base 1.0
  const titleTokens = tokenizeText(title);
  for (const token of titleTokens) {
    termCounts.set(token, (termCounts.get(token) || 0) + 1.0);
  }

  // Marca tem peso reforçado 2.0
  const brandTokens = tokenizeText(brand);
  for (const token of brandTokens) {
    termCounts.set(`brand:${token}`, (termCounts.get(`brand:${token}`) || 0) + 2.0);
  }

  // Categoria tem peso reforçado 1.5
  const catTokens = tokenizeText(category);
  for (const token of catTokens) {
    termCounts.set(`cat:${token}`, (termCounts.get(`cat:${token}`) || 0) + 1.5);
  }

  // Tokens adicionais
  for (const token of extraTokens) {
    termCounts.set(token, (termCounts.get(token) || 0) + 1.0);
  }

  // Normalização L2 para produto escalar ser igual à similaridade de cosseno
  let sumSquares = 0;
  for (const val of termCounts.values()) {
    sumSquares += val * val;
  }

  const norm = Math.sqrt(sumSquares);
  const normalizedVector = new Map<string, number>();
  if (norm > 0) {
    for (const [key, val] of termCounts.entries()) {
      normalizedVector.set(key, val / norm);
    }
  }

  return normalizedVector;
}

/**
 * Calcula a similaridade cosseno entre dois vetores normalizados
 */
export function computeCosineSimilarity(
  vecA: Map<string, number>,
  vecB: Map<string, number>
): number {
  if (vecA.size === 0 || vecB.size === 0) return 0;

  // Itera pelo vetor menor para máxima performance
  const [smaller, larger] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
  let dotProduct = 0;

  for (const [key, valA] of smaller.entries()) {
    const valB = larger.get(key);
    if (valB !== undefined) {
      dotProduct += valA * valB;
    }
  }

  return Math.max(0, Math.min(1, dotProduct));
}

/**
 * Extrai todos os atributos estruturados de uma oferta
 */
export function extractStructuredFeatures(
  offer: Pick<Offer, "title" | "price" | "discountPercent" | "rating" | "reviewsCount" | "freeShipping" | "searchTerm" | "brand" | "sellerName">
): StructuredOfferFeatures {
  const brand = extractBrand(offer.title, offer.brand);
  const category = offer.searchTerm || "Geral";
  const priceRange = getPriceRange(offer.price);
  const seller = offer.sellerName || "Mercado Livre";

  let discountLevel: StructuredOfferFeatures["discountLevel"] = "sem_desconto";
  const disc = offer.discountPercent ?? 0;
  if (disc >= 30) discountLevel = "alto";
  else if (disc >= 15) discountLevel = "medio";
  else if (disc > 0) discountLevel = "baixo";

  let ratingTier: StructuredOfferFeatures["ratingTier"] = "sem_avaliacao";
  const r = offer.rating ?? 0;
  if (r >= 4.5) ratingTier = "excelente";
  else if (r >= 4.0) ratingTier = "bom";
  else if (r > 0) ratingTier = "regular";

  const keywords = tokenizeText(offer.title);
  const embedding = generateTextEmbedding(offer.title, brand, category, [
    `range:${priceRange}`,
    `disc:${discountLevel}`,
    `ship:${offer.freeShipping ? "free" : "paid"}`,
  ]);

  return {
    brand,
    category,
    priceRange,
    price: offer.price,
    discountLevel,
    ratingTier,
    freeShipping: Boolean(offer.freeShipping),
    seller,
    keywords,
    embedding,
  };
}

export const PROTECTED_PLATFORM_SELLERS = new Set([
  "mercado livre",
  "mercadolivre",
  "meli",
  "shopee",
  "amazon",
  "magalu",
  "magazine luiza",
  "loja oficial",
  "vendedor oficial",
  "generica",
  "generica",
]);

export function isProtectedSeller(sellerName?: string | null): boolean {
  if (!sellerName) return true;
  const norm = normalizeText(sellerName);
  return PROTECTED_PLATFORM_SELLERS.has(norm) || norm.length < 2;
}

/**
 * Verifica se a oferta deve ser eliminada imediatamente por bloqueios manuais
 */
export function isOfferBlocked(
  offer: Pick<Offer, "title" | "brand" | "sellerName" | "searchTerm">,
  preferences: LearnedPreferences
): { blocked: boolean; reason?: string } {
  const cleanTitle = normalizeText(offer.title);
  const offerBrand = normalizeText(extractBrand(offer.title, offer.brand));
  const offerSeller = normalizeText(offer.sellerName || "");
  const offerCategory = normalizeText(offer.searchTerm || "");

  // 1. Bloqueio por Marca
  for (const b of preferences.blockedBrands) {
    const cleanB = normalizeText(b);
    if (cleanB && (offerBrand === cleanB || cleanTitle.includes(cleanB))) {
      return { blocked: true, reason: `Marca bloqueada: ${b}` };
    }
  }

  // 2. Bloqueio por Vendedor (plataformas genéricas como Mercado Livre são protegidas)
  for (const s of preferences.blockedSellers) {
    if (isProtectedSeller(s)) continue;
    const cleanS = normalizeText(s);
    if (!cleanS || cleanS.length < 3) continue;

    if (!isProtectedSeller(offerSeller) && offerSeller === cleanS) {
      return { blocked: true, reason: `Vendedor bloqueado: ${s}` };
    }

    if (
      cleanS.length >= 4 &&
      new RegExp(`\\b${cleanS.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i").test(cleanTitle)
    ) {
      return { blocked: true, reason: `Vendedor bloqueado: ${s}` };
    }
  }

  // 3. Bloqueio por Palavras-Chave
  for (const kw of preferences.blockedKeywords) {
    const cleanKw = normalizeText(kw);
    if (cleanKw && cleanTitle.includes(cleanKw)) {
      return { blocked: true, reason: `Palavra-chave bloqueada: ${kw}` };
    }
  }

  // 4. Bloqueio por Categoria
  for (const cat of preferences.blockedCategories) {
    const cleanCat = normalizeText(cat);
    if (cleanCat && (offerCategory === cleanCat || offerCategory.includes(cleanCat))) {
      return { blocked: true, reason: `Categoria bloqueada: ${cat}` };
    }
  }

  return { blocked: false };
}

/**
 * Treina um classificador linear simples sobre os dados de feedback (quando decisões >= 50)
 */
export function trainLinearClassifier(
  feedbacks: OfferFeedback[]
): Record<string, number> {
  const weights: Record<string, number> = {};
  const learningRate = 0.05;
  const l2Penalty = 0.001;

  // Itera sobre os feedbacks para atualizar os pesos com gradiente estocástico balanceado
  for (let epoch = 0; epoch < 5; epoch++) {
    for (const fb of feedbacks) {
      const isApproved = fb.action === "aprovar";
      const target = isApproved ? 1.0 : 0.0;
      
      // Ponderação de classes: aprovações próprias = 5.0, favoritos irmão = 2.5, rejeições = 1.0
      let sampleWeight = 1.0;
      if (isApproved) {
        const isBrotherSeed = (fb.metadata as Record<string, unknown>)?.source === "seed_favoritos_irmao";
        sampleWeight = isBrotherSeed ? 2.5 : 5.0;
      }

      const features = extractStructuredFeatures({
        title: fb.title,
        price: fb.price,
        discountPercent: fb.discountPercent ?? null,
        rating: fb.rating,
        reviewsCount: fb.reviewsCount,
        freeShipping: fb.freeShipping,
        searchTerm: fb.category || "Geral",
        brand: fb.brand,
        sellerName: fb.seller,
      });

      // Calcula a predição linear atual
      let score = 0;
      for (const [key, val] of features.embedding.entries()) {
        score += (weights[key] || 0) * val;
      }
      const pred = 1 / (1 + Math.exp(-Math.max(-10, Math.min(10, score))));
      const error = (target - pred) * sampleWeight;

      // Atualiza pesos com regularização L2 e peso de classe
      for (const [key, val] of features.embedding.entries()) {
        const currentW = weights[key] || 0;
        weights[key] = currentW + learningRate * (error * val - l2Penalty * currentW);
      }
    }
  }

  return weights;
}

/**
 * Calcula a pontuação de preferência híbrida (0 a 1) para uma oferta
 */
export function calculatePreferenceScore(
  offer: Offer,
  feedbacks: OfferFeedback[],
  preferences: LearnedPreferences
): { score: number; reason: string; maxApprovedSim: number } {
  const features = extractStructuredFeatures(offer);
  const totalDecisions = (preferences.totalApprovals || 0) + (preferences.totalRejections || 0);

  // Se não há nenhum feedback ainda, retorna score neutro de 0.5
  if (feedbacks.length === 0) {
    return {
      score: 0.5,
      reason: "Oferta em destaque",
      maxApprovedSim: 0,
    };
  }

  let maxApprovedSimilarity = 0;
  let approvedBonus = 0;
  let rejectionPenalty = 0;

  const approvedFeedbacks = feedbacks.filter((f) => f.action === "aprovar");
  const rejectedFeedbacks = feedbacks.filter((f) => f.action === "rejeitar");

  // 1. Compara com os aprovados
  for (const approved of approvedFeedbacks) {
    const appFeatures = extractStructuredFeatures({
      title: approved.title,
      price: approved.price,
      discountPercent: approved.discountPercent ?? null,
      rating: approved.rating,
      reviewsCount: approved.reviewsCount,
      freeShipping: approved.freeShipping,
      searchTerm: approved.category || "Geral",
      brand: approved.brand,
      sellerName: approved.seller,
    });

    const sim = computeCosineSimilarity(features.embedding, appFeatures.embedding);
    if (sim > maxApprovedSimilarity) {
      maxApprovedSimilarity = sim;
    }

    // Regra: se aprovou oferta, aumenta prioridade por marca, categoria, faixa de preço, desconto, avaliações e frete
    let matchBonus = sim * 0.4;

    if (features.brand && features.brand !== "Genérica" && features.brand.toLowerCase() === appFeatures.brand.toLowerCase()) {
      matchBonus += 0.25;
    }
    if (features.category.toLowerCase() === appFeatures.category.toLowerCase()) {
      matchBonus += 0.15;
    }
    if (features.priceRange === appFeatures.priceRange) {
      matchBonus += 0.1;
    }
    if (features.freeShipping && appFeatures.freeShipping) {
      matchBonus += 0.05;
    }
    if ((offer.discountPercent ?? 0) >= (approved.discountPercent ?? 0)) {
      matchBonus += 0.05;
    }

    approvedBonus = Math.max(approvedBonus, matchBonus);
  }

  // 2. Compara com os rejeitados aplicando as regras imediatas por motivo
  for (const rejected of rejectedFeedbacks) {
    const rejFeatures = extractStructuredFeatures({
      title: rejected.title,
      price: rejected.price,
      discountPercent: rejected.discountPercent ?? null,
      rating: rejected.rating,
      reviewsCount: rejected.reviewsCount,
      freeShipping: rejected.freeShipping,
      searchTerm: rejected.category || "Geral",
      brand: rejected.brand,
      sellerName: rejected.seller,
    });

    const sim = computeCosineSimilarity(features.embedding, rejFeatures.embedding);
    const reason = rejected.reason as RejectionReason | string | undefined;

    // Regra: "produto/tipo errado" -> reduzir drasticamente produtos semanticamente parecidos
    if (reason === "produto_tipo_errado" && sim >= 0.35) {
      rejectionPenalty = Math.max(rejectionPenalty, sim * 0.85);
    }
    // Regra: "preço alto" -> penalizar com rigor itens com valor igual ou superior ao rejeitado
    else if (reason === "preco_alto") {
      const isPriceHigherOrEqual = features.price >= rejFeatures.price * 0.85;
      const isRelated =
        sim >= 0.15 ||
        (features.brand && features.brand !== "Genérica" && features.brand.toLowerCase() === rejFeatures.brand.toLowerCase()) ||
        features.category.toLowerCase() === rejFeatures.category.toLowerCase();

      if (isPriceHigherOrEqual && isRelated) {
        rejectionPenalty = Math.max(rejectionPenalty, 0.80);
      } else if (features.priceRange === rejFeatures.priceRange) {
        rejectionPenalty = Math.max(rejectionPenalty, 0.50);
      }
    }
    // Regra: "não é promoção"
    else if (reason === "nao_e_promocao") {
      if (sim >= 0.25 || (features.category.toLowerCase() === rejFeatures.category.toLowerCase() && features.priceRange === rejFeatures.priceRange)) {
        rejectionPenalty = Math.max(rejectionPenalty, 0.45);
      }
    }
    // Regra: "marca indesejada" -> penalidade pesada se for a mesma marca
    else if (reason === "marca_indesejada") {
      if (features.brand && features.brand !== "Genérica" && features.brand.toLowerCase() === rejFeatures.brand.toLowerCase()) {
        rejectionPenalty = Math.max(rejectionPenalty, 0.9);
      }
    }
    // Regra: "baixa qualidade"
    else if (reason === "baixa_qualidade" && sim >= 0.4) {
      rejectionPenalty = Math.max(rejectionPenalty, sim * 0.6);
    }
    // Regra: "não quero mais produtos parecidos"
    else if (reason === "nao_quero_parecidos" && sim >= 0.3) {
      rejectionPenalty = Math.max(rejectionPenalty, sim * 0.75);
    }
    // Rejeição genérica por similaridade
    else if (sim >= 0.5) {
      rejectionPenalty = Math.max(rejectionPenalty, sim * 0.5);
    }
  }

  // Atenuação preventiva de itens que extrapolam o valor desejado (acima de R$ 350)
  if (features.price > 350) {
    const highPriceDampening = Math.min(0.35, ((features.price - 350) / 300) * 0.35);
    rejectionPenalty = Math.max(rejectionPenalty, highPriceDampening);
  }

  // 3. Aprendizado Gradual: Classificador Linear quando total de decisões >= 50
  let modelScore = 0.5;
  if (totalDecisions >= 50 && preferences.featureWeights && Object.keys(preferences.featureWeights).length > 0) {
    let linearSum = 0;
    for (const [k, v] of features.embedding.entries()) {
      linearSum += (preferences.featureWeights[k] || 0) * v;
    }
    modelScore = 1 / (1 + Math.exp(-Math.max(-6, Math.min(6, linearSum))));
  }

  // 4. Combinação Híbrida:
  // Base 0.5 + bônus de aprovação - penalidade de rejeição
  let rawScore = 0.5 + approvedBonus - rejectionPenalty;

  if (totalDecisions >= 50) {
    // A partir de 50 decisões, dá 50% de peso ao classificador treinado e 50% à similaridade direta
    rawScore = 0.5 * rawScore + 0.5 * modelScore;
  }

  // Normaliza rigidamente entre 0.05 e 0.98 (não corta anúncios)
  const finalScore = Math.max(0.05, Math.min(0.98, Number(rawScore.toFixed(3))));

  // Motivo transparente no card
  let reason = "Oferta em destaque";
  if (maxApprovedSimilarity >= 0.35 || approvedBonus >= 0.3) {
    reason = "Parecido com ofertas que você aprovou";
  }

  return {
    score: finalScore,
    reason,
    maxApprovedSim: maxApprovedSimilarity,
  };
}

/**
 * Ordena ofertas com base na recomendação híbrida e reserva 15% para exploração
 */
export function rankOffersWithExploration(
  offers: Offer[],
  feedbacks: OfferFeedback[],
  preferences: LearnedPreferences
): Offer[] {
  // 1. Aplica bloqueios manuais eliminatórios
  const allowedOffers: Offer[] = [];
  for (const offer of offers) {
    const { blocked } = isOfferBlocked(offer, preferences);
    if (!blocked) {
      allowedOffers.push(offer);
    }
  }

  if (allowedOffers.length === 0) return [];

  // 2. Calcula scores de preferência para todos os itens permitidos
  const scoredOffers = allowedOffers.map((o) => {
    const { score, reason, maxApprovedSim } = calculatePreferenceScore(o, feedbacks, preferences);
    return {
      offer: {
        ...o,
        brand: o.brand || extractBrand(o.title),
        preferenceScore: score,
        recommendationReason: reason,
        isExploration: false,
      },
      score,
      maxApprovedSim,
    };
  });

  // Ordena por score de preferência decrescente
  scoredOffers.sort((a, b) => b.score - a.score);

  // Se houver menos de 7 ofertas, não divide em exploração
  if (scoredOffers.length < 7) {
    return scoredOffers.map((item) => item.offer);
  }

  // 3. Reserva 15% das ofertas exibidas para exploração (anúncios válidos fora do padrão atual)
  const totalSlots = scoredOffers.length;
  const explorationCount = Math.max(1, Math.round(totalSlots * 0.15));
  const exploitCount = totalSlots - explorationCount;

  // 85% dos melhores itens (exploit)
  const exploitItems = scoredOffers.slice(0, exploitCount);

  // 15% itens de exploração: pegamos entre os itens restantes que tenham menor similaridade com aprovados
  const remainingCandidates = scoredOffers.slice(exploitCount);

  // Ordena os candidatos de exploração priorizando novidades (menor similaridade aos aprovados ou categorias alternativas)
  remainingCandidates.sort((a, b) => a.maxApprovedSim - b.maxApprovedSim);

  const explorationItems = remainingCandidates.slice(0, explorationCount).map((item) => ({
    ...item,
    offer: {
      ...item.offer,
      isExploration: true,
      recommendationReason: "Novo teste de categoria",
    },
  }));

  // Intercala os itens de exploração ao longo da lista (a cada ~6 itens, insere 1 de exploração)
  const finalRanked: Offer[] = [];
  let expIndex = 0;
  const step = Math.max(2, Math.floor(exploitCount / (explorationCount + 1)));

  for (let i = 0; i < exploitItems.length; i++) {
    finalRanked.push(exploitItems[i].offer);
    if ((i + 1) % step === 0 && expIndex < explorationItems.length) {
      finalRanked.push(explorationItems[expIndex].offer);
      expIndex++;
    }
  }

  // Insere eventuais itens de exploração restantes
  while (expIndex < explorationItems.length) {
    finalRanked.push(explorationItems[expIndex].offer);
    expIndex++;
  }

  return finalRanked;
}

export interface CategorySearchQuota {
  category: string;
  smoothedRate: number;
  allocatedSlots: number;
  isExplorationOnly: boolean;
}

/**
 * Calcula a cota de busca por categoria usando suavização de Laplace:
 * Rate = (Aprovações + 1) / (Total + 2)
 * Garante um mínimo fixo de slots de exploração para que nenhuma categoria morra.
 */
export function calculateCategoryQuotas(
  categories: string[],
  feedbacks: OfferFeedback[],
  totalDesiredSlots = 15,
  minExplorationSlots = 2
): CategorySearchQuota[] {
  const catStats: Record<string, { approvals: number; total: number }> = {};
  for (const c of categories) {
    catStats[c] = { approvals: 0, total: 0 };
  }

  for (const fb of feedbacks) {
    const cat = fb.category || "Geral";
    if (!catStats[cat]) {
      catStats[cat] = { approvals: 0, total: 0 };
    }
    catStats[cat].total++;
    if (fb.action === "aprovar") {
      catStats[cat].approvals++;
    }
  }

  const smoothedRates: Record<string, number> = {};
  let sumRates = 0;
  for (const c of categories) {
    const stats = catStats[c] || { approvals: 0, total: 0 };
    const rate = (stats.approvals + 1) / (stats.total + 2);
    smoothedRates[c] = rate;
    sumRates += rate;
  }

  const quotas: CategorySearchQuota[] = [];
  for (const c of categories) {
    const rate = smoothedRates[c];
    const proportionalSlots = sumRates > 0 ? Math.round((rate / sumRates) * totalDesiredSlots) : minExplorationSlots;
    const allocatedSlots = Math.max(minExplorationSlots, proportionalSlots);
    const stats = catStats[c] || { approvals: 0, total: 0 };
    const isExplorationOnly = stats.approvals === 0 && stats.total >= 5;

    quotas.push({
      category: c,
      smoothedRate: Number(rate.toFixed(3)),
      allocatedSlots,
      isExplorationOnly,
    });
  }

  return quotas;
}

export interface CategoryPriceRange {
  minPrice: number;
  maxPrice: number;
  isLearned: boolean;
  sampleCount: number;
}

/**
 * Calcula faixas de preço por categoria aprendidas a partir das aprovações.
 * Se houver menos de 3 aprovações na categoria, recorre ao teto padrão (R$ 450).
 */
export function getCategoryPriceRange(
  category: string,
  feedbacks: OfferFeedback[],
  defaultMin = 80.0,
  defaultMax = 450.0
): CategoryPriceRange {
  const approvedPrices = feedbacks
    .filter(
      (f) =>
        f.action === "aprovar" &&
        (category === "Geral" || !f.category || f.category.toLowerCase() === category.toLowerCase())
    )
    .map((f) => f.price)
    .filter((p) => p > 0)
    .sort((a, b) => a - b);

  if (approvedPrices.length < 3) {
    return {
      minPrice: defaultMin,
      maxPrice: defaultMax,
      isLearned: false,
      sampleCount: approvedPrices.length,
    };
  }

  const minApproved = approvedPrices[0];
  const maxApproved = approvedPrices[approvedPrices.length - 1];

  const learnedMin = Math.max(defaultMin, Math.round(minApproved * 0.8 * 100) / 100);
  const learnedMax = Math.max(learnedMin + 50, Math.round(maxApproved * 1.2 * 100) / 100);

  return {
    minPrice: learnedMin,
    maxPrice: learnedMax,
    isLearned: true,
    sampleCount: approvedPrices.length,
  };
}
