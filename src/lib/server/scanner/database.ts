import "server-only";

import { readDatabase, updateDatabase, getTombstones } from "../storage";
import { generateProductFingerprint } from "../offer-scoring-engine";
import { generateMeliShortLinkDetailed } from "../meli-shortener";
import { buildAffiliateUrl } from "../affiliate";
import { extractBrand } from "../recommendation-engine";
import type { CandidateRawItem } from "./validator";
import type { Offer, PriceHistoryItem } from "../../types";

export interface SaveApprovedResult {
  added: number;
  updated: number;
  skippedDuplicates: number;
  savedOffers: Offer[];
}

/** Concorrência controlada para encurtamento rápido de links */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      output[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return output;
}

/**
 * Salva apenas os produtos rigorosamente aprovados pelo validador,
 * evitando duplicatas por ID externo, tombstone e fingerprint de produto.
 */
export async function saveApprovedOffers(
  approvedCandidates: CandidateRawItem[]
): Promise<SaveApprovedResult> {
  if (approvedCandidates.length === 0) {
    return { added: 0, updated: 0, skippedDuplicates: 0, savedOffers: [] };
  }

  const db = await readDatabase();
  const tombstones = await getTombstones();
  const tombstoneIds = new Set(tombstones.map((t) => t.id));
  const tombstoneFingerprints = new Set(tombstones.map((t) => t.fingerprint));

  const existingById = new Map<string, Offer>();
  const existingFingerprints = new Set<string>();

  for (const o of db.offers) {
    existingById.set(o.externalId, o);
    if (o.productFingerprint) {
      existingFingerprints.add(o.productFingerprint);
    }
  }

  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;
  let skippedDuplicates = 0;

  // Filtra itens novos que precisam de link meli.la
  const itemsToInsert: CandidateRawItem[] = [];
  const itemsToUpdate: Array<{ existing: Offer; candidate: CandidateRawItem }> = [];

  for (const candidate of approvedCandidates) {
    const offerInternalId = `mercadolivre:${candidate.externalId}`;
    const fingerprint = generateProductFingerprint("mercadolivre", candidate.externalId, candidate.title);

    // 1. Checa se o item já foi excluído definitivamente pelo usuário (tombstone)
    if (tombstoneIds.has(offerInternalId) || tombstoneFingerprints.has(fingerprint)) {
      console.log(`[database] Item ignorado por tombstone (excluído anteriormente): ${candidate.externalId}`);
      skippedDuplicates++;
      continue;
    }

    const existing = existingById.get(candidate.externalId);
    if (existing) {
      itemsToUpdate.push({ existing, candidate });
      continue;
    }

    // 2. Checa se já existe um item com o mesmo fingerprint de produto
    if (existingFingerprints.has(fingerprint)) {
      console.log(`[database] Item duplicado por fingerprint ignorado: "${candidate.title}"`);
      skippedDuplicates++;
      continue;
    }

    existingFingerprints.add(fingerprint);
    itemsToInsert.push(candidate);
  }

  // Encurtamento SÍNCRONO via API oficial meli.la para as novas ofertas aprovadas (até 6 por ciclo)
  const shortUrlMap = new Map<string, string>();
  await mapWithConcurrency(itemsToInsert.slice(0, 6), 3, async (item) => {
    const cleanId = (item.externalId || "").replace(/^MLB-?/, "");
    const fallbacks = cleanId
      ? [
          `https://produto.mercadolivre.com.br/MLB-${cleanId}`,
          `https://produto.mercadolivre.com.br/MLB${cleanId}`,
        ]
      : [];
    try {
      const direct = await generateMeliShortLinkDetailed(item.originalUrl, undefined, fallbacks);
      if (direct.shortUrl) {
        shortUrlMap.set(item.externalId, direct.shortUrl);
        console.log(`[database] Link meli.la gerado para ${item.externalId}: ${direct.shortUrl}`);
      }
    } catch {
      // prossegue com o link oficial longo
    }
  });

  const newlySaved: Offer[] = [];

  await updateDatabase((localDb) => {
    // Processa atualizações de itens existentes
    for (const { existing, candidate } of itemsToUpdate) {
      const idx = localDb.offers.findIndex((o) => o.id === existing.id);
      if (idx !== -1) {
        const itemInDb = localDb.offers[idx];
        itemInDb.lastSeenAt = now;
        if (candidate.price !== itemInDb.price) {
          itemInDb.price = candidate.price;
          itemInDb.priceHistory = itemInDb.priceHistory || [];
          itemInDb.priceHistory.push({ price: candidate.price, recordedAt: now });
        }
        if (candidate.originalPrice) {
          itemInDb.originalPrice = candidate.originalPrice;
        }
        itemInDb.freeShipping = candidate.freeShipping;
        itemInDb.updatedAt = now;
        updated++;
      }
    }

    // Insere os novos produtos aprovados
    for (const candidate of itemsToInsert) {
      const id = `mercadolivre:${candidate.externalId}`;
      const shortUrl = shortUrlMap.get(candidate.externalId) || null;
      const officialAffiliateUrl = shortUrl || buildAffiliateUrl(candidate.originalUrl);
      const brand = extractBrand(candidate.title);
      const fingerprint = generateProductFingerprint("mercadolivre", candidate.externalId, candidate.title);

      const discountPercent =
        candidate.originalPrice && candidate.originalPrice > candidate.price
          ? Math.round(((candidate.originalPrice - candidate.price) / candidate.originalPrice) * 100)
          : null;

      const newOffer: Offer = {
        id,
        source: "mercadolivre",
        externalId: candidate.externalId,
        title: candidate.title,
        thumbnail: candidate.thumbnail,
        price: candidate.price,
        originalPrice: candidate.originalPrice,
        discountPercent,
        currency: candidate.currency,
        originalUrl: candidate.originalUrl,
        freeShipping: candidate.freeShipping,
        searchTerm: candidate.categoryName || "Radar",
        status: "pendente",
        affiliateUrl: officialAffiliateUrl,
        shortUrl,
        shortUrlStatus: shortUrl ? "pronto" : "pendente",
        shortUrlGeneratedAt: shortUrl ? now : undefined,
        shortUrlAttempts: shortUrl ? 1 : 0,
        coupon: null,
        couponDescription: null,
        rating: candidate.rating ?? null,
        reviewsCount: candidate.reviewsCount ?? null,
        opportunityScore: 85,
        opportunityReason: "Oferta aprovada no pipeline rigoroso (desconto real >= 15% e preço >= R$ 80)",
        productFingerprint: fingerprint,
        priceHistory: [{ price: candidate.price, recordedAt: now }],
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
        statusChangedAt: null,
        brand,
        preferenceScore: 0.85,
        recommendationReason: "Oferta de alto valor agregado com desconto real comprovado",
      };

      localDb.offers.unshift(newOffer);
      newlySaved.push(newOffer);
      added++;
      console.log(`[database] Nova oferta aprovada inserida no banco: "${newOffer.title}" (R$ ${newOffer.price.toFixed(2)})`);
    }

    return { offers: localDb.offers, lastSearch: localDb.lastSearch };
  });

  return {
    added,
    updated,
    skippedDuplicates,
    savedOffers: newlySaved,
  };
}
