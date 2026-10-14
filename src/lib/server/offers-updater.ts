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
import { enqueueMeliShorten } from "./puppeteer-meli";
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
  // 1. Tênis de marcas (Nike, Adidas, Puma): prioridade alta.
  {
    id: "tenis-marcas",
    name: "Tênis de Marca",
    priority: "alta",
    isSneaker: true,
    queries: [
      "tenis nike",
      "tenis adidas",
      "tenis puma",
      "tenis nike corrida",
      "tenis adidas running",
      "tenis puma smash",
    ],
  },
  // 2. Roupas e Moda Fitness: camiseta academia, legging fitness, bermuda treino
  {
    id: "moda-fitness-casual",
    name: "Roupas e Moda Fitness",
    priority: "alta",
    queries: [
      "camiseta academia",
      "legging fitness",
      "bermuda treino",
      "camiseta academia masculina",
      "bermuda treino masculina",
    ],
  },
  // 3. Eletrodomésticos: air fryer, cafeteira, liquidificador
  {
    id: "eletrodomesticos",
    name: "Eletrodomésticos",
    priority: "alta",
    queries: [
      "air fryer",
      "cafeteira",
      "liquidificador",
      "cafeteira eletrica",
      "liquidificador potente",
    ],
  },
  // 4. Suplementos: creatina, whey protein
  {
    id: "suplementos",
    name: "Suplementos",
    priority: "media",
    queries: [
      "creatina",
      "whey protein",
      "creatina 300g",
      "whey protein concentrado",
    ],
  },
  // 5. Beleza e cuidados pessoais: perfume, protetor solar
  {
    id: "beleza-cuidados",
    name: "Beleza e Cuidados Pessoais",
    priority: "media",
    queries: [
      "perfume",
      "protetor solar",
      "perfume masculino importado",
      "protetor solar facial",
    ],
  },
  // 6. Eletrônicos e games: fone bluetooth, controle gamer
  {
    id: "eletronicos-games",
    name: "Eletrônicos e Games",
    priority: "menor",
    queries: [
      "fone bluetooth",
      "controle gamer",
      "fone bluetooth sem fio",
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

export interface PipelineStageCounts {
  etapa1_itens_retornados_api: number;
  etapa2_apos_preco_minimo_25: number;
  etapa3_apos_bloqueio_replicas: number;
  etapa4_apos_filtros_avaliacao: number;
  etapa5_gravados_atualizados_banco: number;
  etapa6_retornados_frontend: number;
}

/**
 * Coleta produtos do catálogo oficial e resolve os itens e preços reais
 * aplicando as regras temporárias e contadores de cada etapa.
 */
async function collectProductsFromML(
  token: string,
  existingExternalIds: Set<string>,
  counters: {
    etapa1: number;
    etapa2: number;
    etapa3: number;
    etapa4: number;
  }
): Promise<DiscoveredProductItem[]> {
  const discovered: DiscoveredProductItem[] = [];
  const seenIds = new Set<string>();
  let apiErrorsCount = 0;
  let lastApiErrorMessage = "";

  // Processa as categorias na ordem de prioridade
  for (const category of RADAR_CATEGORIES) {
    let newItemsInCat = 0;
    // Limitar a até 10 novas ofertas por categoria em cada atualização
    const maxNewPerCat = 10;

    for (const query of category.queries) {
      if (newItemsInCat >= maxNewPerCat) break;

      try {
        const searchUrl = `https://api.mercadolibre.com/products/search?status=active&site_id=${config.mercadoLivre.siteId}&q=${encodeURIComponent(query)}&limit=15`;
        const res = await fetchWithRetry(searchUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
          apiErrorsCount++;
          const errBody = await res.text().catch(() => "");
          lastApiErrorMessage = `HTTP ${res.status}: ${errBody.slice(0, 150)}`;
          console.warn(`[offers-updater] Busca retornou erro para "${query}": ${lastApiErrorMessage}`);
          if (res.status === 401 || res.status === 403) {
            throw new MercadoLivreError(
              `Erro de autenticação/autorização na API Mercado Livre (${res.status}): ${errBody || "Verifique as credenciais ou reconecte o OAuth."}`,
              res.status
            );
          }
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
          if (newItemsInCat >= maxNewPerCat) break;

          // Filtro: Miudezas irrelevantes
          if (isJunkItem(p.name)) continue;

          // Busca detalhes completos do item vencedor apenas para quem passou no filtro básico
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

            // 1. Itens retornados pela API Mercado Livre com anúncio ativo e preço
            counters.etapa1++;

            // 2. Itens após preço mínimo de R$25
            if (item.price < 25.0) {
              continue;
            }
            counters.etapa2++;

            // 3. Itens após bloqueio de réplicas
            if (isReplicaOrKnockoff(p.name)) {
              console.log(`[offers-updater] Anúncio réplica/inspirado bloqueado: "${p.name}"`);
              continue;
            }
            counters.etapa3++;

            // 4. Itens após filtros de avaliação
            // Regra temporária: Aceitar anúncios sem avaliação quando a API não fornecer avaliações.
            // Não exigir histórico de preço, não exigir desconto calculado.
            counters.etapa4++;

            const externalId = item.item_id || p.id;
            if (seenIds.has(externalId)) continue;
            seenIds.add(externalId);

            // Busca avaliações se disponíveis
            const reviews = await fetchItemReviews(externalId, token);

            const picture = p.pictures?.[0];
            const cleanId = (item.item_id || p.id || "").replace(/^MLB-?/, "");
            const originalUrl = item.item_id
              ? `https://produto.mercadolivre.com.br/MLB-${cleanId}`
              : (p.permalink || `https://produto.mercadolivre.com.br/MLB-${cleanId}`);
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

            if (!existingExternalIds.has(externalId)) {
              newItemsInCat++;
            }
          } catch (itErr) {
            // Continua para o próximo item
          }
        }
      } catch (catErr) {
        if (catErr instanceof MercadoLivreError) {
          throw catErr;
        }
        console.warn(`[offers-updater] Falha ao consultar termo "${query}":`, catErr);
      }
    }
  }

  if (discovered.length === 0 && apiErrorsCount > 0 && lastApiErrorMessage) {
    throw new MercadoLivreError(
      `Falha na comunicação com a API Mercado Livre: ${lastApiErrorMessage}`,
      502
    );
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
  stageCounts: PipelineStageCounts;
}> {
  if (isUpdatingInProgress) {
    const currentDb = await readDatabase();
    const fallbackStageCounts: PipelineStageCounts = {
      etapa1_itens_retornados_api: 0,
      etapa2_apos_preco_minimo_25: 0,
      etapa3_apos_bloqueio_replicas: 0,
      etapa4_apos_filtros_avaliacao: 0,
      etapa5_gravados_atualizados_banco: 0,
      etapa6_retornados_frontend: currentDb.offers.length,
    };
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
      stageCounts: fallbackStageCounts,
    };
  }

  isUpdatingInProgress = true;

  try {
    const token = await getAccessToken();

    // Lê o estado atual do banco para rastrear itens existentes e tombstones
    const initialDb = await readDatabase();
    const existingExternalIds = new Set(initialDb.offers.map((o) => o.externalId));

    const tombstones = await getTombstones();
    const manualTombstones = new Set(
      tombstones
        .filter((t) => !t.reason?.toLowerCase().includes("score"))
        .map((t) => t.id)
    );

    // Contadores das 4 primeiras etapas
    const rawCounters = {
      etapa1: 0,
      etapa2: 0,
      etapa3: 0,
      etapa4: 0,
    };

    const candidates = await collectProductsFromML(token, existingExternalIds, rawCounters);

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

        // 1. Aplica bloqueios manuais aprendidos
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
          // Atualiza dados existentes
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
            opportunityScore: 80, // Score neutro e visível
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

      // Ordena pelo algoritmo de recomendação com exploração
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

    // 5. Itens gravados/atualizados no banco
    const etapa5_gravados_atualizados_banco = addedCount + updatedCount;

    // 6. Itens retornados ao frontend
    const etapa6_retornados_frontend = updatedDb.offers.length;

    const stageCounts: PipelineStageCounts = {
      etapa1_itens_retornados_api: rawCounters.etapa1,
      etapa2_apos_preco_minimo_25: rawCounters.etapa2,
      etapa3_apos_bloqueio_replicas: rawCounters.etapa3,
      etapa4_apos_filtros_avaliacao: rawCounters.etapa4,
      etapa5_gravados_atualizados_banco,
      etapa6_retornados_frontend,
    };

    // REGISTRO OBRIGATÓRIO NO LOG DO SERVIDOR EM CADA ETAPA
    console.log(`\n================ RELATÓRIO DO RADAR DE OFERTAS: ETAPAS ================`);
    console.log(`1. Itens retornados pela API Mercado Livre: ${stageCounts.etapa1_itens_retornados_api}`);
    console.log(`2. Itens após preço mínimo de R$25: ${stageCounts.etapa2_apos_preco_minimo_25}`);
    console.log(`3. Itens após bloqueio de réplicas: ${stageCounts.etapa3_apos_bloqueio_replicas}`);
    console.log(`4. Itens após filtros de avaliação: ${stageCounts.etapa4_apos_filtros_avaliacao}`);
    console.log(`5. Itens gravados/atualizados no banco: ${stageCounts.etapa5_gravados_atualizados_banco} (${addedCount} novas ofertas gravadas, ${updatedCount} atualizadas)`);
    console.log(`6. Itens retornados ao frontend: ${stageCounts.etapa6_retornados_frontend}`);
    console.log(`========================================================================\n`);

    // Dispara encurtamento automático meli.la para quaisquer novas ofertas pendentes
    try {
      enqueueMeliShorten();
    } catch (shortErr) {
      console.warn("[offers-updater] Falha ao disparar enfileirador de encurtamento:", shortErr);
    }

    return {
      ok: true,
      offers: updatedDb.offers,
      lastSearch: updatedDb.lastSearch,
      added: addedCount,
      updated: updatedCount,
      stageCounts,
    };
  } finally {
    isUpdatingInProgress = false;
  }
}
