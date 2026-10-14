import "server-only";

import { buildAffiliateUrl, detectCoupon } from "./affiliate";
import { config } from "./config";
import { MercadoLivreError } from "./mercadolivre";
import { updatePriceHistory } from "./opportunity-scoring";
import {
  evaluateCandidateOffer,
  generateProductFingerprint,
  isBlockedProductOrCategory,
} from "./offer-scoring-engine";
import { enqueueMeliShorten } from "./puppeteer-meli";
import { mercadoLivreProvider } from "./providers/mercadolivre-provider";
import type { NormalizedCandidateProduct } from "./providers/provider-interface";
import { getAlgorithmSettings } from "./scoring-rules";
import { getSchedulerSettings, readDatabase, updateDatabase } from "./storage";
import { calculateNextScheduledSlot } from "./scheduler-engine";
import { applyOfferUpdate, calcDiscountPercent } from "../offer-rules";
import type {
  AlgorithmSettings,
  LastSearchInfo,
  Offer,
  OfferUpdate,
  QueueStats,
  TombstoneRecord,
} from "../types";

/**
 * SERVIÇO DE OFERTAS E GESTÃO DA FILA
 * -----------------------------------
 * - Limite rígido de 500 ofertas pendentes.
 * - Integração incremental do algoritmo de seleção e score 0–100.
 * - Validação e encurtamento meli.la antes de incluir em Pendentes.
 * - Rejeição automática de itens com preço abaixo do mínimo (R$ 24,99) ou links inválidos.
 * - Prevenção de concorrência com bloqueio contra múltiplos cliques.
 */

export const MAX_PENDING_OFFERS = 500;
let isUpdatingRadar = false;

export class OfferNotFoundError extends Error {}
export class OfferValidationError extends Error {}
export class QueueCapacityLimitError extends Error {
  constructor(
    message = "Você já tem 500 ofertas pendentes para aprovar. Aprove, publique ou rejeite algumas ofertas antes de atualizar o Radar novamente."
  ) {
    super(message);
    this.name = "QueueCapacityLimitError";
  }
}
export class RadarBusyError extends Error {
  constructor(message = "Uma atualização do Radar de Ofertas já está em andamento. Aguarde a conclusão.") {
    super(message);
    this.name = "RadarBusyError";
  }
}

export function computeQueueStats(offers: Offer[]): QueueStats {
  const pendingCount = offers.filter((o) => o.status === "pendente").length;
  const availableSlots = Math.max(0, MAX_PENDING_OFFERS - pendingCount);
  return {
    pendingCount,
    maxPending: MAX_PENDING_OFFERS,
    availableSlots,
    isQueueFull: pendingCount >= MAX_PENDING_OFFERS,
  };
}

function offerId(source: string, externalId: string) {
  return `${source}:${externalId}`;
}

/** Ordena: mais recentes primeiro, depois maior desconto. */
function sortOffers(offers: Offer[]): Offer[] {
  return [...offers].sort(
    (a, b) =>
      b.lastSeenAt.localeCompare(a.lastSeenAt) || (b.discountPercent ?? 0) - (a.discountPercent ?? 0),
  );
}

export async function listOffers() {
  const db = await readDatabase();
  let modified = false;

  // Auto-enriquece ofertas legadas que ainda estejam sem link de afiliado ou cupom
  for (const offer of db.offers) {
    if (!offer.affiliateUrl) {
      offer.affiliateUrl = buildAffiliateUrl(offer.originalUrl);
      modified = true;
    }
    if (!offer.coupon) {
      const detected = detectCoupon(offer);
      if (detected.coupon) {
        offer.coupon = detected.coupon;
        offer.couponDescription = detected.description;
        modified = true;
      }
    }
  }

  if (modified) {
    await updateDatabase((data) => {
      data.offers = db.offers;
      return { offers: data.offers, lastSearch: data.lastSearch };
    });
  }

  const queueStats = computeQueueStats(db.offers);
  const algorithmSettings = await getAlgorithmSettings();

  return {
    offers: sortOffers(db.offers),
    lastSearch: db.lastSearch,
    queueStats,
    algorithmSettings,
  };
}

/**
 * Processa, avalia e insere ou atualiza um produto candidato
 * respeitando os filtros eliminatórios e o teto da fila.
 */
async function processCandidateProduct(
  offers: Offer[],
  candidate: NormalizedCandidateProduct,
  now: string,
  availableSlots: number,
  addedPendingCount: { value: number },
  settings?: AlgorithmSettings,
  tombstones: TombstoneRecord[] = []
): Promise<"added_pending" | "added_rejected" | "updated" | "skipped_capacity" | "skipped_tombstone"> {
  const activeSettings = settings || (await getAlgorithmSettings());
  const id = offerId(candidate.source, candidate.externalId);
  const existing = offers.find((o) => o.id === id);

  // 0. VERIFICAÇÃO CRÍTICA DE TOMBSTONE:
  // Se a oferta foi excluída definitivamente pelo usuário, descarta silenciosamente.
  // NUNCA re-adiciona em ofertas e NUNCA move para rejeitados!
  const candidateFp = generateProductFingerprint(candidate.source, candidate.externalId, candidate.title);
  const isTombstone = tombstones.some((t) => t.id === id || t.fingerprint === candidateFp);

  if (isTombstone) {
    if (existing) {
      const idx = offers.findIndex((o) => o.id === id);
      if (idx !== -1) offers.splice(idx, 1);
    }
    return "skipped_tombstone";
  }

  const updatedHistory = updatePriceHistory(existing?.priceHistory, candidate.price, now);

  // 1. Tenta validar/gerar link meli.la antes da inclusão se for Mercado Livre
  let shortUrl = existing?.shortUrl || candidate.shortUrl || null;

  if (!shortUrl && candidate.source === "mercadolivre") {
    try {
      const shortRes = await mercadoLivreProvider.generateShortLink(candidate.originalUrl);
      if (shortRes.shortUrl) {
        shortUrl = shortRes.shortUrl;
      }
    } catch {
      // continua com link canônico de afiliado
    }
  }

  candidate.shortUrl = shortUrl;
  candidate.affiliateUrl = candidate.affiliateUrl || mercadoLivreProvider.buildAffiliateUrl(candidate.originalUrl);

  // 2. Avalia com o motor de filtros e pontuação 0–100
  const evaluation = evaluateCandidateOffer({
    candidate,
    history: updatedHistory,
    existingOffers: offers,
    tombstones,
    settings: activeSettings,
  });

  const fingerprint = evaluation.fingerprint;
  const discountPercent = calcDiscountPercent(candidate.price, candidate.originalPrice);

  if (existing) {
    // Atualiza preço, score e histórico da oferta existente
    existing.title = candidate.title;
    existing.thumbnail = candidate.thumbnail ?? existing.thumbnail;
    existing.price = candidate.price;
    existing.originalPrice = candidate.originalPrice;
    existing.discountPercent = discountPercent;
    existing.originalUrl = candidate.originalUrl;
    existing.freeShipping = candidate.freeShipping;
    existing.rating = candidate.rating ?? existing.rating ?? null;
    existing.reviewsCount = candidate.reviewsCount ?? existing.reviewsCount ?? null;
    existing.sellerReputation = candidate.sellerReputation ?? existing.sellerReputation ?? null;
    existing.opportunityScore = evaluation.score;
    existing.opportunityReason = evaluation.audit.decisionReason;
    existing.scoreAudit = evaluation.audit;
    existing.priceHistory = updatedHistory;
    existing.lastSeenAt = now;
    existing.shortUrl = shortUrl || existing.shortUrl;
    existing.shortUrlStatus = (shortUrl ? "pronto" : existing.shortUrlStatus) as Offer["shortUrlStatus"];
    existing.coupon = existing.coupon || candidate.coupon || null;
    existing.couponDescription = existing.couponDescription || candidate.couponDescription || null;
    existing.productFingerprint = fingerprint;

    // Se o item não atende mais aos filtros ou score caiu abaixo do limite, move para rejeitado
    const minPending = activeSettings.minPendingScore ?? 75;
    const minManual = activeSettings.minManualPublishScore ?? 75;

    if (existing.status === "pendente" && (!evaluation.passed || evaluation.score < minPending)) {
      const prevStatus = existing.status;
      existing.status = "rejeitado";
      existing.rejectionDetail = {
        reason: evaluation.audit.decisionReason,
        failedFilters: evaluation.audit.failedFilters,
        rejectedAt: now,
        previousStatus: prevStatus,
      };
      existing.statusChangedAt = now;
    } else if (existing.status === "aprovado" && (!evaluation.passed || evaluation.score < minManual)) {
      const prevStatus = existing.status;
      existing.status = "rejeitado";
      existing.rejectionDetail = {
        reason: evaluation.audit.decisionReason,
        failedFilters: evaluation.audit.failedFilters,
        rejectedAt: now,
        previousStatus: prevStatus,
      };
      if (existing.whatsappStatus === "agendado" || existing.whatsappStatus === "enviando") {
        existing.whatsappStatus = "rascunho";
        existing.scheduledFor = null;
        existing.scheduledWindowDate = null;
      }
      existing.statusChangedAt = now;
    }

    return "updated";
  }

  // 3. Caso a oferta NÃO passe nos filtros eliminatórios, move diretamente para REJEITADOS
  if (!evaluation.passed) {
    offers.push({
      id,
      source: candidate.source,
      externalId: candidate.externalId,
      title: candidate.title,
      thumbnail: candidate.thumbnail,
      price: candidate.price,
      originalPrice: candidate.originalPrice,
      discountPercent,
      currency: candidate.currency,
      originalUrl: candidate.originalUrl,
      freeShipping: candidate.freeShipping,
      searchTerm: candidate.searchTerm || "Radar",
      status: "rejeitado",
      rejectionDetail: {
        reason: evaluation.audit.decisionReason,
        failedFilters: evaluation.audit.failedFilters,
        rejectedAt: now,
      },
      affiliateUrl: candidate.affiliateUrl,
      shortUrl,
      shortUrlStatus: (shortUrl ? "pronto" : "pendente") as Offer["shortUrlStatus"],
      coupon: candidate.coupon || null,
      couponDescription: candidate.couponDescription || null,
      rating: candidate.rating ?? null,
      reviewsCount: candidate.reviewsCount ?? null,
      sellerReputation: candidate.sellerReputation ?? null,
      commission: null,
      opportunityScore: evaluation.score,
      opportunityReason: evaluation.audit.decisionReason,
      scoreAudit: evaluation.audit,
      productFingerprint: fingerprint,
      priceHistory: updatedHistory,
      whatsappStatus: "rascunho",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      statusChangedAt: now,
    });
    return "added_rejected";
  }

  // 4. Oferta APROVADA pelos filtros: verifica capacidade restante para Pendentes
  if (addedPendingCount.value >= availableSlots) {
    return "skipped_capacity";
  }

  // Adiciona como PENDENTE com score e auditoria completa
  offers.push({
    id,
    source: candidate.source,
    externalId: candidate.externalId,
    title: candidate.title,
    thumbnail: candidate.thumbnail,
    price: candidate.price,
    originalPrice: candidate.originalPrice,
    discountPercent,
    currency: candidate.currency,
    originalUrl: candidate.originalUrl,
    freeShipping: candidate.freeShipping,
    searchTerm: candidate.searchTerm || "Radar",
    status: "pendente",
    affiliateUrl: candidate.affiliateUrl,
    shortUrl,
    shortUrlStatus: (shortUrl ? "pronto" : "pendente") as Offer["shortUrlStatus"],
    coupon: candidate.coupon || null,
    couponDescription: candidate.couponDescription || null,
    rating: candidate.rating ?? null,
    reviewsCount: candidate.reviewsCount ?? null,
    sellerReputation: candidate.sellerReputation ?? null,
    commission: null,
    opportunityScore: evaluation.score,
    opportunityReason: evaluation.audit.decisionReason,
    scoreAudit: evaluation.audit,
    productFingerprint: fingerprint,
    priceHistory: updatedHistory,
    whatsappStatus: "rascunho",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    statusChangedAt: null,
  });

  addedPendingCount.value++;
  return "added_pending";
}

/**
 * Processa um lote de candidatos na ordem correta exigida pela regra de qualidade:
 * 1. Avalia categoria, filtros e score de cada candidato.
 * 2. Atualiza existentes (rebaixando para rejeitado se não passarem mais).
 * 3. Novos candidatos inelegíveis vão diretamente para Rejeitados com auditoria.
 * 4. Novos candidatos elegíveis são ordenados por score decrescente + desempates transparentes.
 * 5. Preenche as vagas restantes de Pendentes (teto 500) SOMENTE com os melhores elegíveis.
 */
async function processCandidateBatch(
  offers: Offer[],
  candidates: NormalizedCandidateProduct[],
  now: string,
  settings: AlgorithmSettings,
  tombstones: TombstoneRecord[] = []
): Promise<{ addedPending: number; addedRejected: number; updated: number }> {
  const minPending = settings.minPendingScore ?? 75;
  const minManual = settings.minManualPublishScore ?? 75;
  const currentPending = offers.filter((o) => o.status === "pendente").length;
  const remainingSlots = Math.max(0, MAX_PENDING_OFFERS - currentPending);

  let updated = 0;
  let addedRejected = 0;
  let addedPending = 0;

  interface EligibleItem {
    candidate: NormalizedCandidateProduct;
    evaluation: ReturnType<typeof evaluateCandidateOffer>;
    shortUrl: string | null;
    updatedHistory: { price: number; recordedAt: string }[];
    discountPercent: number | null;
  }

  const eligibleNewList: EligibleItem[] = [];

  for (const candidate of candidates) {
    const id = offerId(candidate.source, candidate.externalId);
    const existing = offers.find((o) => o.id === id);

    // 0. VERIFICAÇÃO CRÍTICA DE TOMBSTONE
    const candidateFp = generateProductFingerprint(candidate.source, candidate.externalId, candidate.title);
    const isTombstone = tombstones.some((t) => t.id === id || t.fingerprint === candidateFp);

    if (isTombstone) {
      if (existing) {
        const idx = offers.findIndex((o) => o.id === id);
        if (idx !== -1) offers.splice(idx, 1);
      }
      continue;
    }

    const updatedHistory = updatePriceHistory(existing?.priceHistory, candidate.price, now);

    // Link curto meli.la
    let shortUrl = existing?.shortUrl || candidate.shortUrl || null;
    if (!shortUrl && candidate.source === "mercadolivre") {
      try {
        const shortRes = await mercadoLivreProvider.generateShortLink(candidate.originalUrl);
        if (shortRes.shortUrl) {
          shortUrl = shortRes.shortUrl;
        }
      } catch {
        // continua
      }
    }
    candidate.shortUrl = shortUrl;
    candidate.affiliateUrl = candidate.affiliateUrl || mercadoLivreProvider.buildAffiliateUrl(candidate.originalUrl);

    // Avaliação detalhada pelo motor de qualidade
    const evaluation = evaluateCandidateOffer({
      candidate,
      history: updatedHistory,
      existingOffers: offers,
      tombstones,
      settings,
    });

    const discountPercent = calcDiscountPercent(candidate.price, candidate.originalPrice);

    if (existing) {
      existing.title = candidate.title;
      existing.thumbnail = candidate.thumbnail ?? existing.thumbnail;
      existing.price = candidate.price;
      existing.originalPrice = candidate.originalPrice;
      existing.discountPercent = discountPercent;
      existing.originalUrl = candidate.originalUrl;
      existing.freeShipping = candidate.freeShipping;
      existing.rating = candidate.rating ?? existing.rating ?? null;
      existing.reviewsCount = candidate.reviewsCount ?? existing.reviewsCount ?? null;
      existing.sellerReputation = candidate.sellerReputation ?? existing.sellerReputation ?? null;
      existing.opportunityScore = evaluation.score;
      existing.opportunityReason = evaluation.audit.decisionReason;
      existing.scoreAudit = evaluation.audit;
      existing.priceHistory = updatedHistory;
      existing.lastSeenAt = now;
      existing.shortUrl = shortUrl || existing.shortUrl;
      existing.shortUrlStatus = (shortUrl ? "pronto" : existing.shortUrlStatus) as Offer["shortUrlStatus"];
      existing.coupon = existing.coupon || candidate.coupon || null;
      existing.couponDescription = existing.couponDescription || candidate.couponDescription || null;
      existing.productFingerprint = evaluation.fingerprint;

      // Se não atende mais aos filtros ou score caiu abaixo do limite, move para rejeitado
      if (existing.status === "pendente" && (!evaluation.passed || evaluation.score < minPending)) {
        const prevStatus = existing.status;
        existing.status = "rejeitado";
        existing.rejectionDetail = {
          reason: evaluation.audit.decisionReason,
          failedFilters: evaluation.audit.failedFilters,
          rejectedAt: now,
          previousStatus: prevStatus,
        };
        existing.statusChangedAt = now;
      } else if (existing.status === "aprovado" && (!evaluation.passed || evaluation.score < minManual)) {
        const prevStatus = existing.status;
        existing.status = "rejeitado";
        existing.rejectionDetail = {
          reason: evaluation.audit.decisionReason,
          failedFilters: evaluation.audit.failedFilters,
          rejectedAt: now,
          previousStatus: prevStatus,
        };
        if (existing.whatsappStatus === "agendado" || existing.whatsappStatus === "enviando") {
          existing.whatsappStatus = "rascunho";
          existing.scheduledFor = null;
          existing.scheduledWindowDate = null;
        }
        existing.statusChangedAt = now;
      }

      updated++;
      continue;
    }

    // Candidato NOVO:
    if (!evaluation.passed || evaluation.score < minPending) {
      // Inelegível: vai DIRETAMENTE para Rejeitados
      offers.push({
        id,
        source: candidate.source,
        externalId: candidate.externalId,
        title: candidate.title,
        thumbnail: candidate.thumbnail,
        price: candidate.price,
        originalPrice: candidate.originalPrice,
        discountPercent,
        currency: candidate.currency,
        originalUrl: candidate.originalUrl,
        freeShipping: candidate.freeShipping,
        searchTerm: candidate.searchTerm || "Radar",
        status: "rejeitado",
        rejectionDetail: {
          reason: evaluation.audit.decisionReason,
          failedFilters: evaluation.audit.failedFilters,
          rejectedAt: now,
        },
        affiliateUrl: candidate.affiliateUrl,
        shortUrl,
        shortUrlStatus: (shortUrl ? "pronto" : "pendente") as Offer["shortUrlStatus"],
        coupon: candidate.coupon || null,
        couponDescription: candidate.couponDescription || null,
        rating: candidate.rating ?? null,
        reviewsCount: candidate.reviewsCount ?? null,
        sellerReputation: candidate.sellerReputation ?? null,
        commission: null,
        opportunityScore: evaluation.score,
        opportunityReason: evaluation.audit.decisionReason,
        scoreAudit: evaluation.audit,
        productFingerprint: evaluation.fingerprint,
        priceHistory: updatedHistory,
        whatsappStatus: "rascunho",
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
        statusChangedAt: now,
      });
      addedRejected++;
    } else {
      // Elegível: passa para a etapa de ranqueamento e preenchimento de vagas
      eligibleNewList.push({
        candidate,
        evaluation,
        shortUrl,
        updatedHistory,
        discountPercent,
      });
    }
  }

  // Ordenação rígida por score decrescente e critérios transparentes de desempate
  eligibleNewList.sort((a, b) => {
    // 1. Score de oportunidade decrescente
    if (b.evaluation.score !== a.evaluation.score) {
      return b.evaluation.score - a.evaluation.score;
    }
    // 2. Desconto percentual decrescente
    const discA = a.discountPercent ?? 0;
    const discB = b.discountPercent ?? 0;
    if (discB !== discA) return discB - discA;

    // 3. Avaliação dos compradores decrescente
    const ratingA = a.candidate.rating ?? 0;
    const ratingB = b.candidate.rating ?? 0;
    if (ratingB !== ratingA) return ratingB - ratingA;

    // 4. Volume de avaliações decrescente
    const revA = a.candidate.reviewsCount ?? 0;
    const revB = b.candidate.reviewsCount ?? 0;
    if (revB !== revA) return revB - revA;

    // 5. Frete grátis
    const shipA = a.candidate.freeShipping ? 1 : 0;
    const shipB = b.candidate.freeShipping ? 1 : 0;
    if (shipB !== shipA) return shipB - shipA;

    // 6. Preço decrescente
    return b.candidate.price - a.candidate.price;
  });

  // Preenche as vagas restantes de Pendentes somente com os melhores elegíveis (até o limite de 500)
  const toInsertAsPending = eligibleNewList.slice(0, remainingSlots);

  for (const item of toInsertAsPending) {
    const { candidate, evaluation, shortUrl, updatedHistory, discountPercent } = item;
    const id = offerId(candidate.source, candidate.externalId);

    offers.push({
      id,
      source: candidate.source,
      externalId: candidate.externalId,
      title: candidate.title,
      thumbnail: candidate.thumbnail,
      price: candidate.price,
      originalPrice: candidate.originalPrice,
      discountPercent,
      currency: candidate.currency,
      originalUrl: candidate.originalUrl,
      freeShipping: candidate.freeShipping,
      searchTerm: candidate.searchTerm || "Radar",
      status: "pendente",
      affiliateUrl: candidate.affiliateUrl || null,
      shortUrl,
      shortUrlStatus: (shortUrl ? "pronto" : "pendente") as Offer["shortUrlStatus"],
      coupon: candidate.coupon || null,
      couponDescription: candidate.couponDescription || null,
      rating: candidate.rating ?? null,
      reviewsCount: candidate.reviewsCount ?? null,
      sellerReputation: candidate.sellerReputation ?? null,
      commission: null,
      opportunityScore: evaluation.score,
      opportunityReason: evaluation.audit.decisionReason,
      scoreAudit: evaluation.audit,
      productFingerprint: evaluation.fingerprint,
      priceHistory: updatedHistory,
      whatsappStatus: "rascunho",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      statusChangedAt: null,
    });
    addedPending++;
  }

  return {
    addedPending,
    addedRejected,
    updated,
  };
}

/** Descoberta automática nas categorias prioritárias com trava de 500 e score */
export async function runAutoDiscovery(categoryIds?: string[]) {
  if (isUpdatingRadar) {
    throw new RadarBusyError();
  }

  isUpdatingRadar = true;

  try {
    const currentDb = await readDatabase();
    const currentPending = currentDb.offers.filter((o) => o.status === "pendente").length;

    // Se já existirem 500 ofertas pendentes, não faz nova coleta nem descarta existentes
    if (currentPending >= MAX_PENDING_OFFERS) {
      throw new QueueCapacityLimitError();
    }

    const settings = await getAlgorithmSettings();
    const tombstones = currentDb.tombstones || [];

    // 1. Busca candidatos via categorias prioritárias do Mercado Livre
    const categoryCandidates = await mercadoLivreProvider.discoverCategories(
      Math.min(config.resultsPerTerm, 12)
    );

    // 2. Também busca termos prioritários configurados para trazer ofertas novas e diversas
    const termCandidates: NormalizedCandidateProduct[] = [];
    const searchTerms = config.searchTerms && config.searchTerms.length > 0
      ? config.searchTerms
      : ["fone bluetooth", "air fryer", "notebook gamer", "smartphone", "alexa echo", "smartwatch"];

    for (const term of searchTerms) {
      try {
        const found = await mercadoLivreProvider.searchProducts(term, 6);
        termCandidates.push(...found);
      } catch (err) {
        console.warn(`[runAutoDiscovery] Falha ao buscar termo "${term}":`, err);
      }
    }

    // Unifica e deduplica candidatos da mesma rodada por externalId
    const seenCandidateIds = new Set<string>();
    const candidates: NormalizedCandidateProduct[] = [];
    const termsFound = new Set<string>();

    for (const c of [...categoryCandidates, ...termCandidates]) {
      if (c.categoryName) termsFound.add(c.categoryName);
      if (!seenCandidateIds.has(c.externalId)) {
        seenCandidateIds.add(c.externalId);
        candidates.push(c);
      }
    }

    const now = new Date().toISOString();
    const errors: { term: string; message: string }[] = [];

    const result = await updateDatabase(async (db) => {
      const batchResult = await processCandidateBatch(
        db.offers,
        candidates,
        now,
        settings,
        tombstones
      );

      const lastSearch: LastSearchInfo = {
        at: now,
        terms: Array.from(termsFound),
        found: candidates.length,
        added: batchResult.addedPending,
        updated: batchResult.updated,
      };

      if (candidates.length > 0) db.lastSearch = lastSearch;

      const queueStats = computeQueueStats(db.offers);
      return {
        offers: sortOffers(db.offers),
        lastSearch,
        queueStats,
        addedPending: batchResult.addedPending,
        addedRejected: batchResult.addedRejected,
      };
    });

    // Dispara encurtamento meli.la em background para eventuais links pendentes
    enqueueMeliShorten();

    return {
      ...result,
      errors,
    };
  } finally {
    isUpdatingRadar = false;
  }
}

/** Busca manual por termos com respeito aos limites e filtros */
export async function runSearch(termsInput?: string[]) {
  if (isUpdatingRadar) {
    throw new RadarBusyError();
  }

  isUpdatingRadar = true;

  try {
    const currentDb = await readDatabase();
    const currentPending = currentDb.offers.filter((o) => o.status === "pendente").length;

    if (currentPending >= MAX_PENDING_OFFERS) {
      throw new QueueCapacityLimitError();
    }

    const settings = await getAlgorithmSettings();
    const tombstones = currentDb.tombstones || [];

    const terms = (termsInput && termsInput.length > 0 ? termsInput : config.searchTerms)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10);

    const errors: { term: string; message: string }[] = [];
    const allCandidates: NormalizedCandidateProduct[] = [];

    for (const term of terms) {
      try {
        const found = await mercadoLivreProvider.searchProducts(term, config.resultsPerTerm);
        allCandidates.push(...found);
      } catch (err) {
        errors.push({ term, message: err instanceof Error ? err.message : "Erro na busca" });
      }
    }

    const now = new Date().toISOString();

    const result = await updateDatabase(async (db) => {
      const batchResult = await processCandidateBatch(
        db.offers,
        allCandidates,
        now,
        settings,
        tombstones
      );

      const lastSearch: LastSearchInfo = {
        at: now,
        terms,
        found: allCandidates.length,
        added: batchResult.addedPending,
        updated: batchResult.updated,
      };

      if (allCandidates.length > 0) db.lastSearch = lastSearch;

      const queueStats = computeQueueStats(db.offers);
      return {
        offers: sortOffers(db.offers),
        lastSearch,
        queueStats,
        addedPending: batchResult.addedPending,
        addedRejected: batchResult.addedRejected,
      };
    });

    enqueueMeliShorten();

    return {
      ...result,
      errors,
    };
  } finally {
    isUpdatingRadar = false;
  }
}

export async function updateOffer(id: string, update: OfferUpdate): Promise<Offer> {
  const schedulerSettings = await getSchedulerSettings();
  const algorithmSettings = await getAlgorithmSettings();

  return updateDatabase((db) => {
    const index = db.offers.findIndex((o) => o.id === id);
    if (index === -1) throw new OfferNotFoundError("Oferta não encontrada.");

    const currentOffer = db.offers[index];

    // Se estiver aprovando, valida qualidade estrita
    if (update.status === "aprovado") {
      const minManualScore = algorithmSettings.minManualPublishScore ?? schedulerSettings.minManualPublishScore ?? 75;
      const score = currentOffer.opportunityScore ?? 0;

      if (score < minManualScore) {
        throw new OfferValidationError(
          `Qualidade insuficiente: Score ${score}/100 abaixo do mínimo permitido (${minManualScore}/100). Publicação manual bloqueada.`
        );
      }

      const categoryCheck = isBlockedProductOrCategory(currentOffer.title, null, currentOffer.searchTerm);
      if (categoryCheck.blocked) {
        throw new OfferValidationError(
          categoryCheck.reason || "Produto em categoria bloqueada não pode ser aprovado."
        );
      }

      if (algorithmSettings.requireVerifiableDiscount) {
        const hasOriginalPrice = typeof currentOffer.originalPrice === "number" && currentOffer.originalPrice > currentOffer.price;
        const hasCoupon = Boolean(currentOffer.coupon && currentOffer.coupon.trim().length > 0);
        const hasHistoryDrop =
          currentOffer.priceHistory &&
          currentOffer.priceHistory.length >= 2 &&
          currentOffer.priceHistory[0].price > currentOffer.price;

        if (!hasOriginalPrice && !hasCoupon && !hasHistoryDrop) {
          throw new OfferValidationError("Desconto não verificável: preço de referência indisponível.");
        }
      }

      if (currentOffer.status === "aprovado" && currentOffer.whatsappStatus === "agendado") {
        const result = applyOfferUpdate(currentOffer, update);
        if (!result.ok) throw new OfferValidationError(result.error);
        db.offers[index] = result.offer;
        return result.offer;
      }

      const slot = calculateNextScheduledSlot(db.offers, schedulerSettings);
      const now = new Date().toISOString();

      const result = applyOfferUpdate(currentOffer, {
        ...update,
        scheduledFor: slot.scheduledFor,
      });

      if (!result.ok) throw new OfferValidationError(result.error);

      result.offer.scheduledWindowDate = slot.windowDate;
      result.offer.whatsappStatus = "agendado";
      result.offer.statusChangedAt = now;
      result.offer.updatedAt = now;

      db.offers[index] = result.offer;
      return result.offer;
    }

    const result = applyOfferUpdate(currentOffer, update);
    if (!result.ok) throw new OfferValidationError(result.error);
    db.offers[index] = result.offer;
    return result.offer;
  });
}

export interface SanitizeResult {
  totalScanned: number;
  movedToRejected: number;
  keptPending: number;
  keptApproved: number;
  skippedPublished: number;
  details: {
    id: string;
    title: string;
    previousStatus: "pendente" | "aprovado";
    score: number;
    reason: string;
  }[];
}

/**
 * Rotina segura e idempotente de saneamento de ofertas existentes.
 * - Reavalia ofertas em 'pendente' e 'aprovado' que ainda não foram publicadas.
 * - Move para 'rejeitado' itens abaixo do score mínimo ou sem desconto verificável.
 * - Preserva auditoria (motivo, score, data, previousStatus) e histórico.
 * - Não altera ofertas já publicadas nem remove tombstones.
 */
export async function sanitizeExistingOffers(options?: {
  minPendingScore?: number;
  minManualPublishScore?: number;
  requireVerifiableDiscount?: boolean;
}): Promise<SanitizeResult> {
  const settings = await getAlgorithmSettings();
  const schedSettings = await getSchedulerSettings();

  const minPending = options?.minPendingScore ?? settings.minPendingScore ?? 75;
  const minManual = options?.minManualPublishScore ?? settings.minManualPublishScore ?? 75;
  const requireDiscount = options?.requireVerifiableDiscount ?? settings.requireVerifiableDiscount ?? true;

  const now = new Date().toISOString();

  return updateDatabase((db) => {
    let totalScanned = 0;
    let movedToRejected = 0;
    let keptPending = 0;
    let keptApproved = 0;
    let skippedPublished = 0;
    const details: SanitizeResult["details"] = [];

    for (const offer of db.offers) {
      if (offer.status === "publicado") {
        skippedPublished++;
        continue;
      }

      if (offer.status === "rejeitado") {
        continue;
      }

      totalScanned++;
      const currentScore = offer.opportunityScore ?? 0;
      const categoryCheck = isBlockedProductOrCategory(offer.title, null, offer.searchTerm);

      let shouldReject = false;
      let rejectReason = "";
      const failedFilters: string[] = [];

      if (categoryCheck.blocked) {
        shouldReject = true;
        rejectReason = categoryCheck.reason || "Categoria bloqueada: livros, receitas e produtos digitais proibidos.";
        failedFilters.push("category_blocked");
      }

      // Desconto verificável
      if (!shouldReject && requireDiscount) {
        const hasOriginalPrice = typeof offer.originalPrice === "number" && offer.originalPrice > offer.price;
        const hasCoupon = Boolean(offer.coupon && offer.coupon.trim().length > 0);
        const hasHistoryDrop =
          offer.priceHistory &&
          offer.priceHistory.length >= 2 &&
          offer.priceHistory[0].price > offer.price;

        if (!hasOriginalPrice && !hasCoupon && !hasHistoryDrop) {
          shouldReject = true;
          rejectReason = "Desconto não verificável: preço de referência indisponível.";
          failedFilters.push("verifiable_discount");
        }
      }

      // Score mínimo por status
      if (!shouldReject) {
        if (offer.status === "pendente" && currentScore < minPending) {
          shouldReject = true;
          rejectReason = `Score ${currentScore}/100 abaixo do mínimo da fila (${minPending}/100).`;
          failedFilters.push("min_pending_score");
        } else if (offer.status === "aprovado" && currentScore < minManual) {
          shouldReject = true;
          rejectReason = `Score ${currentScore}/100 abaixo do mínimo permitido (${minManual}/100).`;
          failedFilters.push("min_manual_score");
        }
      }

      if (shouldReject) {
        const prevStatus = offer.status as "pendente" | "aprovado";
        offer.status = "rejeitado";
        offer.rejectionDetail = {
          reason: rejectReason,
          failedFilters,
          rejectedAt: now,
          previousStatus: prevStatus,
        };

        if (offer.whatsappStatus === "agendado" || offer.whatsappStatus === "enviando") {
          offer.whatsappStatus = "rascunho";
          offer.scheduledFor = null;
          offer.scheduledWindowDate = null;
        }

        offer.statusChangedAt = now;
        offer.updatedAt = now;

        movedToRejected++;
        details.push({
          id: offer.id,
          title: offer.title,
          previousStatus: prevStatus,
          score: currentScore,
          reason: rejectReason,
        });
      } else {
        if (offer.status === "pendente") keptPending++;
        if (offer.status === "aprovado") keptApproved++;
      }
    }

    return {
      totalScanned,
      movedToRejected,
      keptPending,
      keptApproved,
      skippedPublished,
      details,
    };
  });
}
