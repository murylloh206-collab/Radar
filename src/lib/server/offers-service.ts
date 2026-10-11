import { config, isMercadoLivreConfigured } from "./config";
import { searchProducts, MercadoLivreError, type MLProduct } from "./mercadolivre";
import { getMockProducts } from "./mock-products";
import { readDatabase, updateDatabase } from "./storage";
import { applyOfferUpdate, calcDiscountPercent } from "../offer-rules";
import type { LastSearchInfo, Offer, OfferUpdate } from "../types";

/**
 * SERVIÇO DE OFERTAS
 * ------------------
 * Liga as peças: busca no Mercado Livre -> aplica regras -> salva no JSON.
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
  return { offers: sortOffers(db.offers), lastSearch: db.lastSearch };
}

/** Cria uma oferta nova (pendente) ou atualiza preço/título de uma existente. */
function upsertFromProduct(offers: Offer[], product: MLProduct, term: string, now: string) {
  const id = offerId(product.externalId);
  const existing = offers.find((o) => o.id === id);
  const discountPercent = calcDiscountPercent(product.price, product.originalPrice);

  if (existing) {
    // Atualiza só dados do produto. Status, link de afiliado e cupom são SEUS: não mexemos.
    Object.assign(existing, {
      title: product.title,
      thumbnail: product.thumbnail ?? existing.thumbnail,
      price: product.price,
      originalPrice: product.originalPrice,
      discountPercent,
      currency: product.currency,
      originalUrl: product.originalUrl,
      freeShipping: product.freeShipping,
      lastSeenAt: now,
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
    affiliateUrl: null,
    coupon: null,
    couponDescription: null,
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

  for (const term of terms) {
    try {
      if (!isMercadoLivreConfigured()) {
        found.push({ term, products: getMockProducts(term) });
      } else {
        found.push({ term, products: await searchProducts(term, config.resultsPerTerm) });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      errors.push({ term, message });
      // Sem credenciais: não adianta tentar os outros termos.
      if (err instanceof MercadoLivreError && err.status === undefined) break;
    }
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

  return { ...result, errors };
}

export class OfferNotFoundError extends Error {}
export class OfferValidationError extends Error {}

export async function updateOffer(id: string, update: OfferUpdate): Promise<Offer> {
  return updateDatabase((db) => {
    const index = db.offers.findIndex((o) => o.id === id);
    if (index === -1) throw new OfferNotFoundError("Oferta não encontrada.");
    const result = applyOfferUpdate(db.offers[index], update);
    if (!result.ok) throw new OfferValidationError(result.error);
    db.offers[index] = result.offer;
    return result.offer;
  });
}
