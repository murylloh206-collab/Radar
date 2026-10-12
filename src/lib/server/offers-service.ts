import { buildAffiliateUrl, detectCoupon } from "./affiliate";
import { discoverCategoryOffers } from "./category-discovery";
import { config } from "./config";
import { searchProducts, MercadoLivreError, hasActiveMLConnection, type MLProduct } from "./mercadolivre";
import { getMockProducts } from "./mock-products";
import { evaluateOpportunity, updatePriceHistory } from "./opportunity-scoring";
import { enqueueMeliShorten } from "./puppeteer-meli";
import { getSchedulerSettings, readDatabase, updateDatabase } from "./storage";
import { calculateNextScheduledSlot } from "./scheduler-engine";
import { applyOfferUpdate, calcDiscountPercent } from "../offer-rules";
import type { LastSearchInfo, Offer, OfferUpdate } from "../types";

/**
 * SERVIÇO DE OFERTAS
 * ------------------
 * Liga as peças: busca no Mercado Livre -> gera links de afiliado e cupons -> salva no JSON.
 * As rotas da API (src/app/api) só chamam estas funções.
 */

function offerId(externalId: string) {
  return `mercadolivre:${externalId}`;
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

  // Auto-enriquece ofertas que ainda estejam sem link de afiliado ou cupom
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

  return { offers: sortOffers(db.offers), lastSearch: db.lastSearch };
}

/** Cria uma oferta nova (pendente) com regras de qualidade, ou atualiza preço mantendo histórico. */
function upsertFromProduct(offers: Offer[], product: MLProduct, term: string, now: string) {
  const id = offerId(product.externalId);
  const existing = offers.find((o) => o.id === id);
  const discountPercent = calcDiscountPercent(product.price, product.originalPrice);
  const autoAffiliateUrl = buildAffiliateUrl(product.originalUrl);
  const detected = detectCoupon({
    title: product.title,
    price: product.price,
    originalPrice: product.originalPrice,
    searchTerm: term,
  });

  const updatedHistory = updatePriceHistory(existing?.priceHistory, product.price, now);
  const opportunity = evaluateOpportunity(product, updatedHistory);

  if (existing) {
    Object.assign(existing, {
      title: product.title,
      thumbnail: product.thumbnail ?? existing.thumbnail,
      price: product.price,
      originalPrice: product.originalPrice,
      discountPercent,
      currency: product.currency,
      originalUrl: product.originalUrl,
      freeShipping: product.freeShipping,
      rating: product.rating ?? existing.rating ?? null,
      reviewsCount: product.reviewsCount ?? existing.reviewsCount ?? null,
      sellerReputation: product.sellerReputation ?? existing.sellerReputation ?? null,
      opportunityScore: opportunity.score,
      opportunityReason: opportunity.reason,
      priceHistory: updatedHistory,
      lastSeenAt: now,
      affiliateUrl: existing.affiliateUrl || autoAffiliateUrl,
      coupon: existing.coupon || detected.coupon,
      couponDescription: existing.couponDescription || detected.description,
    } satisfies Partial<Offer>);
    return "updated" as const;
  }

  offers.push({
    id,
    source: "mercadolivre",
    externalId: product.externalId,
    title: product.title,
    thumbnail: product.thumbnail,
    price: product.price,
    originalPrice: product.originalPrice,
    discountPercent,
    currency: product.currency,
    originalUrl: product.originalUrl,
    freeShipping: product.freeShipping,
    searchTerm: term,
    status: "pendente",
    affiliateUrl: autoAffiliateUrl,
    shortUrl: null,
    shortUrlStatus: "pendente",
    coupon: detected.coupon,
    couponDescription: detected.description,
    rating: product.rating ?? null,
    reviewsCount: product.reviewsCount ?? null,
    sellerReputation: product.sellerReputation ?? null,
    commission: null, // Fica como null (exibirá "Aguardando dados da rede" sem invenção)
    opportunityScore: opportunity.score,
    opportunityReason: opportunity.reason,
    priceHistory: updatedHistory,
    whatsappStatus: "rascunho",
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    statusChangedAt: null,
  });
  return "added" as const;
}

export async function runSearch(termsInput?: string[]) {
  const terms = (termsInput && termsInput.length > 0 ? termsInput : config.searchTerms)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);

  // 1) Busca na API (fora da fila de escrita, pois pode demorar)
  const errors: { term: string; message: string }[] = [];
  const found: { term: string; products: MLProduct[] }[] = [];

  const isConnected = await hasActiveMLConnection();

  for (const term of terms) {
    if (isConnected) {
      try {
        found.push({ term, products: await searchProducts(term, config.resultsPerTerm) });
        continue;
      } catch (err) {
        console.warn(`[runSearch] Erro ao buscar "${term}" na API oficial, usando catalogo inteligente:`, err);
      }
    }
    // Fallback gracioso com produtos de alta conversão
    found.push({ term, products: getMockProducts(term) });
  }

  // 2) Salva tudo de uma vez
  const now = new Date().toISOString();
  const result = await updateDatabase((db) => {
    let added = 0;
    let updated = 0;
    let total = 0;
    for (const { term, products } of found) {
      for (const product of products) {
        total++;
        if (upsertFromProduct(db.offers, product, term, now) === "added") added++;
        else updated++;
      }
    }
    const lastSearch: LastSearchInfo = { at: now, terms, found: total, added, updated };
    if (found.length > 0) db.lastSearch = lastSearch;
    return { offers: sortOffers(db.offers), lastSearch };
  });

  // Dispara a fila interna do Puppeteer para encurtar links pendentes de forma segura
  enqueueMeliShorten();

  return { ...result, errors };
}

/** Descoberta automática nas categorias prioritárias do Radar de Ofertas */
export async function runAutoDiscovery(categoryIds?: string[]) {
  const discoveries = await discoverCategoryOffers(categoryIds, Math.min(config.resultsPerTerm, 10));
  const errors: { term: string; message: string }[] = [];
  const now = new Date().toISOString();

  const result = await updateDatabase((db) => {
    let added = 0;
    let updated = 0;
    let total = 0;
    const termsFound: string[] = [];

    for (const d of discoveries) {
      termsFound.push(d.category.name);
      if (d.error) {
        errors.push({ term: d.category.name, message: d.error });
      }
      for (const product of d.products) {
        total++;
        if (upsertFromProduct(db.offers, product, d.category.name, now) === "added") {
          added++;
        } else {
          updated++;
        }
      }
    }

    const lastSearch: LastSearchInfo = {
      at: now,
      terms: termsFound,
      found: total,
      added,
      updated,
    };
    if (total > 0) db.lastSearch = lastSearch;
    return { offers: sortOffers(db.offers), lastSearch };
  });

  // Dispara a fila interna do Puppeteer para encurtamento em segundo plano
  enqueueMeliShorten();

  return { ...result, errors };
}

export class OfferNotFoundError extends Error {}
export class OfferValidationError extends Error {}

export async function updateOffer(id: string, update: OfferUpdate): Promise<Offer> {
  const schedulerSettings = await getSchedulerSettings();

  return updateDatabase((db) => {
    const index = db.offers.findIndex((o) => o.id === id);
    if (index === -1) throw new OfferNotFoundError("Oferta não encontrada.");

    const currentOffer = db.offers[index];

    // Se estiver aprovando e a oferta já estiver aprovada ou publicada, não duplica na fila
    if (update.status === "aprovado") {
      if (currentOffer.status === "aprovado" && currentOffer.whatsappStatus === "agendado") {
        // Já está agendada na fila; apenas atualiza eventuais cupons/links
        const result = applyOfferUpdate(currentOffer, update);
        if (!result.ok) throw new OfferValidationError(result.error);
        db.offers[index] = result.offer;
        return result.offer;
      }

      // Calcula o próximo slot dentro da janela operacional
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

