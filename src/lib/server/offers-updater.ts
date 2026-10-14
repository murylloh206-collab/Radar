import "server-only";

import { buildAffiliateUrl } from "./affiliate";
import { config } from "./config";
import { getAccessToken, MercadoLivreError } from "./mercadolivre";
import { calcDiscountPercent } from "../offer-rules";
import { getTombstones, readDatabase, updateDatabase } from "./storage";
import {
  extractBrand,
  isOfferBlocked,
  rankOffersWithExploration,
} from "./recommendation-engine";
import { getLearnedPreferences, getAllFeedbacks } from "./feedback-service";
import type { LastSearchInfo, Offer, PriceHistoryItem } from "../types";

/**
 * SERVIÇO DE COLETA E ATUALIZAÇÃO OFICIAL DO MERCADO LIVRE BRASIL (MLB)
 * -------------------------------------------------------------------
 * - Busca ofertas ativas direto da API oficial do Mercado Livre (MLB).
 * - Sem scraping HTML.
 * - Sem filtros de score bloqueantes.
 * - Priorização transparente de categorias e filtros objetivos.
 */

export interface RadarCategoryConfig {
  id: string;
  name: string;
  priority: "alta" | "media" | "menor";
  isSneaker?: boolean;
  queries: string[];
}

export const RADAR_CATEGORIES: RadarCategoryConfig[] = [
  // 1. Roupas de academia e roupas casuais: prioridade alta.
  {
    id: "moda-fitness-casual",
    name: "Roupas e Moda Fitness",
    priority: "alta",
    queries: [
      "camiseta academia masculina",
      "bermuda treino masculina",
      "conjunto fitness feminino",
      "calca moletom masculina",
      "camiseta casual algodao",
    ],
  },
  // 2. Tênis de marcas (Nike, Adidas, Puma, New Balance): prioridade alta.
  {
    id: "tenis-marcas",
    name: "Tênis de Marca",
    priority: "alta",
    isSneaker: true,
    queries: [
      "tenis nike masculino",
      "tenis adidas masculino",
      "tenis puma",
      "tenis new balance",
      "tenis corrida masculino",
    ],
  },
  // 3. Eletrodomésticos: prioridade alta.
  {
    id: "eletrodomesticos",
    name: "Eletrodomésticos",
    priority: "alta",
    queries: [
      "air fryer",
      "cafeteira eletrica",
      "liquidificador potente",
      "microondas inox",
    ],
  },
  // 4. Suplementos: prioridade média.
  {
    id: "suplementos",
    name: "Suplementos",
    priority: "media",
    queries: [
      "creatina monohidratada pura",
      "whey protein concentrado",
      "creatina 300g",
    ],
  },
  // 5. Beleza e cuidados pessoais: prioridade média.
  {
    id: "beleza-cuidados",
    name: "Beleza e Cuidados Pessoais",
    priority: "media",
    queries: [
      "perfume masculino importado",
      "perfume feminino importado",
      "protetor solar facial",
      "hidratante corporal",
    ],
  },
  // 6. Eletrônicos e games: prioridade menor.
  {
    id: "eletronicos-games",
    name: "Eletrônicos e Games",
    priority: "menor",
    queries: [
      "fone bluetooth sem fio",
      "controle gamer",
      "smartwatch esportivo",
    ],
  },
];

/**
 * Detecta réplicas ou falsificações em tênis de marcas
 */
export function isReplicaOrKnockoff(title: string): boolean {
  const normalized = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const patterns = [
    /\br[eé]plica\b/i,
    /\binspirad[oa]s?\b/i,
    /\bsimilar\b/i,
    /\bcompat[ií]vel\b/i,
    /\bprimeira linha\b/i,
    /\b1[aª] linha\b/i,
    /\blinha premium\b/i,
    /\bimitac[aã]o\b/i,
  ];

  return patterns.some((p) => p.test(normalized));
}

/**
 * Remove itens indesejados de miudezas sem apelo comercial
 */
const JUNK_TERMS = [
  "almofada",
  "capa de almofada",
  "capa para almofada",
  "botons",
  "pin para",
  "pins para",
  "chaveiro",
  "adesivo",
  "pano de prato",
  "pano de chao",
  "palmilha",
  "cadarco",
  "presilha",
];

function isJunkItem(title: string): boolean {
  const normalized = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return JUNK_TERMS.some((term) => normalized.includes(term));
}

function toHttps(url: string | undefined | null): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//i, "https://");
}

/**
 * Fetch com retry exponencial para erros 429 e falhas de rede transitórias
 */
async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 && attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[offers-updater] Rate limit 429 em ${url}. Aguardando ${delay}ms para retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 800;
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
        continue;
      }
      throw err;
    }
  }
  return fetch(url, options);
}

export interface DiscoveredProductItem {
  externalId: string;
  title: string;
  thumbnail: string | null;
  price: number;
  originalPrice: number | null;
  discountPercent: number | null;
  currency: string;
  originalUrl: string;
  freeShipping: boolean;
  categoryName: string;
  rating: number | null;
  reviewsCount: number | null;
}

/**
 * Busca avaliações na API oficial do Mercado Livre para itens pré-selecionados
 */
async function fetchItemReviews(
  itemId: string,
  token: string
): Promise<{ rating: number | null; reviewsCount: number | null }> {
  try {
    const res = await fetchWithRetry(`https://api.mercadolibre.com/reviews/item/${itemId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return { rating: null, reviewsCount: null };
    const data = await res.json().catch(() => null);
    if (!data) return { rating: null, reviewsCount: null };

    const rating = typeof data.rating_average === "number" ? data.rating_average : null;
    const reviewsCount = typeof data.paging?.total === "number" ? data.paging.total : null;
    return { rating, reviewsCount };
  } catch {
    return { rating: null, reviewsCount: null };
  }
}

/**
 * Coleta produtos do catálogo oficial e resolve os itens e preços reais
 */
async function collectProductsFromML(token: string): Promise<DiscoveredProductItem[]> {
  const discovered: DiscoveredProductItem[] = [];
  const seenIds = new Set<string>();

  // Processa as categorias na ordem de prioridade
  for (const category of RADAR_CATEGORIES) {
    let itemsInCat = 0;
    const maxItemsPerCat = category.priority === "alta" ? 6 : category.priority === "media" ? 4 : 2;

    for (const query of category.queries) {
      if (itemsInCat >= maxItemsPerCat) break;

      try {
        const searchUrl = `https://api.mercadolibre.com/products/search?status=active&site_id=${config.mercadoLivre.siteId}&q=${encodeURIComponent(query)}&limit=5`;
        const res = await fetchWithRetry(searchUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(6000),
        });

        if (!res.ok) {
          console.warn(`[offers-updater] Busca falhou para "${query}" (${res.status}). Continuando...`);
          continue;
        }

        const data = (await res.json().catch(() => ({}))) as {
          results?: Array<{
            id: string;
            name: string;
            permalink?: string;
            pictures?: Array<{ url?: string; secure_url?: string }>;
          }>;
        };

        const products = data.results || [];

        for (const p of products) {
          if (itemsInCat >= maxItemsPerCat) break;

          // Filtro: Miudezas irrelevantes
          if (isJunkItem(p.name)) continue;

          // Filtro específico obrigatório para tênis: evitar réplicas ou cópias
          if (category.isSneaker || p.name.toLowerCase().includes("tenis")) {
            if (isReplicaOrKnockoff(p.name)) {
              console.log(`[offers-updater] Tênis réplica/inspirado ignorado: "${p.name}"`);
              continue;
            }
          }

          // Busca detalhes completos do item vencedor apenas para quem passou no filtro de título
          try {
            const itRes = await fetchWithRetry(
              `https://api.mercadolibre.com/products/${p.id}/items?limit=1`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: "application/json",
                },
                signal: AbortSignal.timeout(5000),
              }
            );

            if (!itRes.ok) continue;
            const itData = (await itRes.json().catch(() => ({}))) as {
              results?: Array<{
                item_id?: string;
                price?: number;
                original_price?: number | null;
                currency_id?: string;
                shipping?: { free_shipping?: boolean };
              }>;
            };

            const item = itData.results?.[0];
            if (!item || typeof item.price !== "number") continue;

            // Filtro obrigatório: Nunca mostrar itens abaixo de R$ 25
            if (item.price < 25.0) {
              continue;
            }

            const externalId = item.item_id || p.id;
            if (seenIds.has(externalId)) continue;
            seenIds.add(externalId);

            // Tenta buscar avaliações para o item pré-selecionado
            const reviews = await fetchItemReviews(externalId, token);

            const picture = p.pictures?.[0];
            const originalUrl = p.permalink || `https://www.mercadolivre.com.br/p/${p.id}`;
            const discountPercent = calcDiscountPercent(item.price, item.original_price ?? null);

            discovered.push({
              externalId,
              title: p.name,
              thumbnail: toHttps(picture?.secure_url || picture?.url),
              price: item.price,
              originalPrice: item.original_price ?? null,
              discountPercent,
              currency: item.currency_id || "BRL",
              originalUrl,
              freeShipping: Boolean(item.shipping?.free_shipping),
              categoryName: category.name,
              rating: reviews.rating,
              reviewsCount: reviews.reviewsCount,
            });

            itemsInCat++;
          } catch (itErr) {
            console.warn(`[offers-updater] Erro ao buscar item de ${p.id}:`, itErr);
          }
        }
      } catch (catErr) {
        console.warn(`[offers-updater] Falha ao consultar termo "${query}":`, catErr);
      }
    }
  }

  return discovered;
}

/**
 * Ordena ofertas com base nas regras de priorização:
 * 1. Nota >= 4.4 com >= 30 avaliações (ou > R$300 com >= 4.5 e >= 10 avaliações)
 * 2. Frete grátis
 * 3. Maior desconto percentual
 * 4. Mais recente
 */
export function sortPrioritizedOffers(offers: Offer[]): Offer[] {
  function getPriorityScore(o: Offer): number {
    let score = 0;
    const r = o.rating;
    const count = o.reviewsCount;

    // Critério 1: Avaliações excelentes
    if (r !== null && r !== undefined && count !== null && count !== undefined) {
      if (r >= 4.4 && count >= 30) score += 1000;
      else if (o.price > 300 && r >= 4.5 && count >= 10) score += 1000;
      else if (r >= 4.0 && count >= 10) score += 500;
    }

    // Critério 2: Frete grátis
    if (o.freeShipping) score += 200;

    // Critério 3: Desconto comprovado
    if (o.discountPercent && o.discountPercent > 0) {
      score += Math.min(o.discountPercent, 100);
    }

    return score;
  }

  return [...offers].sort((a, b) => {
    const scoreDiff = getPriorityScore(b) - getPriorityScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return (
      b.lastSeenAt.localeCompare(a.lastSeenAt) ||
      (b.discountPercent ?? 0) - (a.discountPercent ?? 0)
    );
  });
}

let isUpdatingInProgress = false;

/**
 * Executa a atualização completa do Radar de Ofertas
 */
export async function runRadarUpdate(): Promise<{
  ok: boolean;
  offers: Offer[];
  lastSearch: LastSearchInfo;
  added: number;
  updated: number;
}> {
  if (isUpdatingInProgress) {
    const currentDb = await readDatabase();
    return {
      ok: true,
      offers: sortPrioritizedOffers(currentDb.offers),
      lastSearch: currentDb.lastSearch || {
        at: new Date().toISOString(),
        terms: [],
        found: 0,
        added: 0,
        updated: 0,
      },
      added: 0,
      updated: 0,
    };
  }

  isUpdatingInProgress = true;

  try {
    const token = await getAccessToken();
    const candidates = await collectProductsFromML(token);
    const tombstones = await getTombstones();
    const manualTombstones = new Set(
      tombstones
        .filter((t) => !t.reason?.toLowerCase().includes("score"))
        .map((t) => t.id)
    );

    // Carrega preferências aprendidas e feedbacks históricos
    const preferences = await getLearnedPreferences();
    const feedbacks = await getAllFeedbacks();

    const now = new Date().toISOString();
    let addedCount = 0;
    let updatedCount = 0;
    const termsFound = new Set<string>();

    const updatedDb = await updateDatabase((db) => {
      for (const item of candidates) {
        termsFound.add(item.categoryName);
        const id = `mercadolivre:${item.externalId}`;

        // Se foi excluído manualmente pelo usuário anteriormente, respeita o tombstone
        if (manualTombstones.has(id)) {
          continue;
        }

        const brand = extractBrand(item.title);

        // 1. Aplica primeiro os bloqueios manuais (marcas, vendedores, termos)
        const { blocked, reason: blockReason } = isOfferBlocked(
          {
            title: item.title,
            brand,
            searchTerm: item.categoryName,
          },
          preferences
        );

        if (blocked) {
          console.log(`[offers-updater] Oferta descartada por bloqueio manual (${blockReason}): "${item.title}"`);
          continue;
        }

        const existing = db.offers.find((o) => o.id === id || o.externalId === item.externalId);

        if (existing) {
          // Atualiza dados e adiciona snapshot de histórico se o preço mudou
          existing.title = item.title;
          existing.brand = brand;
          existing.thumbnail = item.thumbnail ?? existing.thumbnail;
          existing.freeShipping = item.freeShipping;
          existing.rating = item.rating ?? existing.rating ?? null;
          existing.reviewsCount = item.reviewsCount ?? existing.reviewsCount ?? null;
          existing.lastSeenAt = now;
          existing.originalUrl = item.originalUrl || existing.originalUrl;

          if (item.price !== existing.price) {
            existing.price = item.price;
            existing.originalPrice = item.originalPrice ?? existing.originalPrice ?? null;
            existing.discountPercent = item.discountPercent;

            const history: PriceHistoryItem[] = existing.priceHistory || [];
            history.push({ price: item.price, recordedAt: now });
            existing.priceHistory = history.slice(-30);
          }

          updatedCount++;
        } else {
          // Insere nova oferta válida com status 'pendente'
          const affiliateUrl = buildAffiliateUrl(item.originalUrl);

          db.offers.push({
            id,
            source: "mercadolivre",
            externalId: item.externalId,
            title: item.title,
            thumbnail: item.thumbnail,
            price: item.price,
            originalPrice: item.originalPrice,
            discountPercent: item.discountPercent,
            currency: item.currency,
            originalUrl: item.originalUrl,
            freeShipping: item.freeShipping,
            searchTerm: item.categoryName,
            status: "pendente",
            affiliateUrl,
            shortUrl: null,
            shortUrlStatus: "pendente",
            coupon: null,
            couponDescription: null,
            rating: item.rating,
            reviewsCount: item.reviewsCount,
            sellerReputation: null,
            commission: null,
            opportunityScore: 80, // Score neutro para compatibilidade
            opportunityReason: "Oferta encontrada agora",
            priceHistory: [{ price: item.price, recordedAt: now }],
            whatsappStatus: "rascunho",
            createdAt: now,
            updatedAt: now,
            lastSeenAt: now,
            statusChangedAt: now,
            brand,
            sellerName: "Mercado Livre",
            preferenceScore: 0.5,
            recommendationReason: "Oferta em destaque",
            isExploration: false,
          });

          addedCount++;
        }
      }

      // 2. Ordena pelo aprendizado de preferência com 15% de exploração reservada
      const rankedOffers = rankOffersWithExploration(db.offers, feedbacks, preferences);
      db.offers = rankedOffers;

      const lastSearch: LastSearchInfo = {
        at: now,
        terms: Array.from(termsFound),
        found: candidates.length,
        added: addedCount,
        updated: updatedCount,
      };

      db.lastSearch = lastSearch;

      return {
        offers: rankedOffers,
        lastSearch,
      };
    });

    return {
      ok: true,
      offers: updatedDb.offers,
      lastSearch: updatedDb.lastSearch,
      added: addedCount,
      updated: updatedCount,
    };
  } finally {
    isUpdatingInProgress = false;
  }
}
