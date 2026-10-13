import "server-only";

import { buildAffiliateUrl, detectCoupon } from "./affiliate";
import { config } from "./config";
import { MercadoLivreError } from "./mercadolivre";
import { updatePriceHistory } from "./opportunity-scoring";
import {
  evaluateCandidateOffer,
  generateProductFingerprint,
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
): Promise<"added_pending" | "added_rejected" | "updated" | "skipped_capacity"> {
  const activeSettings = settings || (await getAlgorithmSettings());
  const id = offerId(candidate.source, candidate.externalId);
  const existing = offers.find((o) => o.id === id);
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

    // Se o item não atende mais aos filtros (ex: preço caiu para <= 50 ou esgotou), move para rejeitado
    if (!evaluation.passed && existing.status === "pendente") {
      existing.status = "rejeitado";
      existing.rejectionDetail = {
        reason: evaluation.audit.decisionReason,
        failedFilters: evaluation.audit.failedFilters,
        rejectedAt: now,
      };
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

    const availableSlots = Math.max(0, MAX_PENDING_OFFERS - currentPending);
    const settings = await getAlgorithmSettings();
    const tombstones = currentDb.tombstones || [];

    // Busca candidatos via Mercado Livre
    const candidates = await mercadoLivreProvider.discoverCategories(
      Math.min(config.resultsPerTerm, 10)
    );

    const now = new Date().toISOString();
    const errors: { term: string; message: string }[] = [];
    const addedPendingCount = { value: 0 };
    let addedRejected = 0;
    let updated = 0;
    let total = 0;
    const termsFound = new Set<string>();

    const result = await updateDatabase(async (db) => {
      for (const candidate of candidates) {
        total++;
        if (candidate.categoryName) termsFound.add(candidate.categoryName);

        const outcome = await processCandidateProduct(
          db.offers,
          candidate,
          now,
          availableSlots,
          addedPendingCount,
          settings,
          tombstones
        );

        if (outcome === "added_pending") {
          // contabilizado em addedPendingCount.value
        } else if (outcome === "added_rejected") {
          addedRejected++;
        } else if (outcome === "updated") {
          updated++;
        }
      }

      const lastSearch: LastSearchInfo = {
        at: now,
        terms: Array.from(termsFound),
        found: total,
        added: addedPendingCount.value,
        updated,
      };

      if (total > 0) db.lastSearch = lastSearch;

      const queueStats = computeQueueStats(db.offers);
      return {
        offers: sortOffers(db.offers),
        lastSearch,
        queueStats,
        addedPending: addedPendingCount.value,
        addedRejected,
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

    const availableSlots = Math.max(0, MAX_PENDING_OFFERS - currentPending);
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
    const addedPendingCount = { value: 0 };
    let addedRejected = 0;
    let updated = 0;
    let total = 0;

    const result = await updateDatabase(async (db) => {
      for (const candidate of allCandidates) {
        total++;
        const outcome = await processCandidateProduct(
          db.offers,
          candidate,
          now,
          availableSlots,
          addedPendingCount,
          settings,
          tombstones
        );

        if (outcome === "added_pending") {
          // contabilizado
        } else if (outcome === "added_rejected") {
          addedRejected++;
        } else if (outcome === "updated") {
          updated++;
        }
      }

      const lastSearch: LastSearchInfo = {
        at: now,
        terms,
        found: total,
        added: addedPendingCount.value,
        updated,
      };

      if (allCandidates.length > 0) db.lastSearch = lastSearch;

      const queueStats = computeQueueStats(db.offers);
      return {
        offers: sortOffers(db.offers),
        lastSearch,
        queueStats,
        addedPending: addedPendingCount.value,
        addedRejected,
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

  return updateDatabase((db) => {
    const index = db.offers.findIndex((o) => o.id === id);
    if (index === -1) throw new OfferNotFoundError("Oferta não encontrada.");

    const currentOffer = db.offers[index];

    // Se estiver aprovando e a oferta já estiver aprovada ou agendada, não duplica na fila
    if (update.status === "aprovado") {
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
