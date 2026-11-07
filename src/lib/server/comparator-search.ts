import 'server-only';
import crypto from 'node:crypto';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ADMIN_UUID } from './auth';
import { getDecryptedCredentials, getStoreCredentialsMapWithSecrets } from './credentials-vault';
import { convertToAffiliateLink } from './affiliate-converter';
import { getDatabase, readDatabase } from './storage';
import { recordOfferPriceHistory } from './price-history';

export interface ComparatorOfferItem {
  id: string;
  store: 'mercadolivre' | 'shopee' | 'amazon' | 'netshoes' | 'magalu';
  storeDisplayName: string;
  title: string;
  price: number;
  originalPrice: number | null;
  discountPct: number | null;
  freeShipping: boolean | null;
  shippingLabel: string;
  rating: number | null;
  reviewsCount: number | null;
  soldCount: number | null;
  couponText: string | null;
  imageUrl: string | null;
  productUrl: string;
  affiliateUrl: string;
  isAffiliateLinkVerified: boolean;
  commissionRatePct: number | null;
  dataSourceLabel: string;
  costBenefitScore: number;
  isBestValue: boolean;
  bestValueReason: string | null;
}

export interface StoreSearchDiagnostic {
  store: string;
  displayName: string;
  status: 'ok' | 'requires_credentials' | 'catalog_only' | 'error';
  resultsCount: number;
  sourceUsed: string;
  message: string;
}

export interface ComparatorSearchResult {
  rawQuery: string;
  effectiveQuery: string;
  didYouMean: string | null;
  autoCorrected: boolean;
  fromCache: boolean;
  cachedAt: string;
  cacheTtlSeconds: number;
  bestOfferId: string | null;
  offers: ComparatorOfferItem[];
  storeDiagnostics: StoreSearchDiagnostic[];
}

// Cache em memória de 5 minutos (configurável)
const CACHE_TTL_MS = 5 * 60 * 1000;
const comparatorCache = new Map<
  string,
  { expiresAt: number; payload: ComparatorSearchResult }
>();

/**
 * Dicionário de termos e correções ortográficas comuns do e-commerce brasileiro.
 * Funciona em conjunto com `pg_trgm` + `unaccent` no Supabase.
 */
const DIRECT_TYPO_DICTIONARY: Record<string, string> = {
  bulsa: 'blusa',
  bluzinha: 'blusa feminina',
  bluza: 'blusa',
  cadado: 'cadeado',
  cadiado: 'cadeado',
  foni: 'fone de ouvido bluetooth',
  foneblutuf: 'fone de ouvido bluetooth',
  'fone blututh': 'fone de ouvido bluetooth',
  'fone bluetoth': 'fone de ouvido bluetooth',
  fritadera: 'fritadeira elétrica air fryer',
  airfry: 'fritadeira elétrica air fryer',
  ayrfryer: 'fritadeira elétrica air fryer',
  tenes: 'tênis de corrida',
  teniz: 'tênis de corrida',
  parafusadera: 'parafusadeira e furadeira',
  furadera: 'parafusadeira e furadeira',
  cafetera: 'cafeteira expresso',
  aspirado: 'aspirador de pó robô',
  'aspirador robo': 'aspirador de pó robô',
  smartwach: 'smartwatch relógio inteligente',
  esmartwatch: 'smartwatch relógio inteligente',
   'caixa som': 'caixa de som bluetooth',
  caixinha: 'caixa de som bluetooth',
  perfumi: 'perfume importado',
  criatina: 'creatina monohidratada',
  wei: 'whey protein',
  ventilado: 'ventilador de coluna',
  liquidificado: 'liquidificador turbo',
  travesero: 'travesseiro viscoelástico nasa',
  muxila: 'mochila impermeável notebook',
};

const CANONICAL_SEARCH_TERMS: string[] = [
  'blusa',
  'blusa feminina',
  'cadeado',
  'cadeado digital',
  'fone de ouvido bluetooth',
  'fritadeira elétrica air fryer',
  'tênis de corrida',
  'caixa de som bluetooth',
  'smartwatch relógio inteligente',
  'cafeteira expresso',
  'aspirador de pó robô',
  'perfume importado',
  'creatina monohidratada',
  'whey protein',
  'parafusadeira e furadeira',
  'teclado mecânico gamer',
  'mouse sem fio gamer',
  'monitor gamer',
  'escova secadora',
  'liquidificador turbo',
  'panela de pressão elétrica',
  'ventilador de coluna',
  'travesseiro viscoelástico nasa',
  'mochila impermeável notebook',
  'camiseta masculina algodão',
  'jogo de lençol casal',
  'kit ferramentas',
];

export function normalizeTextUnaccent(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcula similaridade de trigramas (equivalente ao `similarity()` do `pg_trgm` no PostgreSQL)
 */
export function computeTrigramSimilarity(aRaw: string, bRaw: string): number {
  const a = `  ${normalizeTextUnaccent(aRaw)} `;
  const b = `  ${normalizeTextUnaccent(bRaw)} `;
  if (a.trim() === b.trim()) return 1;
  if (a.length < 3 || b.length < 3) return 0;

  const trigramsA = new Set<string>();
  const trigramsB = new Set<string>();

  for (let i = 0; i <= a.length - 3; i++) {
    trigramsA.add(a.slice(i, i + 3));
  }
  for (let i = 0; i <= b.length - 3; i++) {
    trigramsB.add(b.slice(i, i + 3));
  }

  let intersection = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersection++;
  }

  const union = trigramsA.size + trigramsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Resolve sugestões "Você quis dizer: ...?" combinando:
 * 1. Dicionário direto de erros de digitação ("bulsa" → "blusa", "cadado" → "cadeado")
 * 2. Função RPC `suggest_search_term` no Supabase (`pg_trgm` + `unaccent`)
 * 3. Motor de similaridade de trigramas local
 */
export async function resolveDidYouMeanSuggestion(rawQuery: string): Promise<{
  didYouMean: string | null;
  effectiveQuery: string;
  autoCorrected: boolean;
}> {
  const cleanRaw = rawQuery.trim();
  const norm = normalizeTextUnaccent(cleanRaw);

  if (!norm) {
    return { didYouMean: null, effectiveQuery: cleanRaw, autoCorrected: false };
  }

  // 1. Verificar correspondência exata no dicionário de erros de digitação (palavra inteira ou token a token)
  if (DIRECT_TYPO_DICTIONARY[norm]) {
    const corrected = DIRECT_TYPO_DICTIONARY[norm];
    return {
      didYouMean: corrected,
      effectiveQuery: corrected,
      autoCorrected: true,
    };
  }

  const tokens = norm.split(' ');
  let tokenReplaced = false;
  const correctedTokens = tokens.map((tk) => {
    if (DIRECT_TYPO_DICTIONARY[tk]) {
      tokenReplaced = true;
      return DIRECT_TYPO_DICTIONARY[tk];
    }
    return tk;
  });

  if (tokenReplaced) {
    const joined = correctedTokens.join(' ');
    return {
      didYouMean: joined,
      effectiveQuery: joined,
      autoCorrected: true,
    };
  }

  // 2. Consultar função `suggest_search_term` no Supabase (pg_trgm + unaccent)
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('suggest_search_term', {
        raw_query: cleanRaw,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        const top = data[0];
        const suggested = String(top.suggested_term || '').trim();
        const score = Number(top.similarity_score || 0);
        if (
          suggested &&
          normalizeTextUnaccent(suggested) !== norm &&
          score >= 0.35
        ) {
          return {
            didYouMean: suggested,
            effectiveQuery: score >= 0.5 ? suggested : cleanRaw,
            autoCorrected: score >= 0.5,
          };
        }
      }
    } catch {}
  }

  // 3. Fallback determinístico por trigramas no dicionário canônico
  let bestTerm: string | null = null;
  let bestScore = 0;

  for (const candidate of CANONICAL_SEARCH_TERMS) {
    const candNorm = normalizeTextUnaccent(candidate);
    if (candNorm === norm) {
      return { didYouMean: null, effectiveQuery: candidate, autoCorrected: false };
    }

    // Comparar também com a primeira palavra do termo canônico quando a busca tem 1 palavra
    const firstWordScore =
      tokens.length === 1
        ? computeTrigramSimilarity(norm, candNorm.split(' ')[0])
        : 0;
    const fullScore = computeTrigramSimilarity(norm, candNorm);
    const score = Math.max(firstWordScore, fullScore);

    if (score > bestScore) {
      bestScore = score;
      bestTerm = tokens.length === 1 && firstWordScore >= fullScore ? candidate.split(' ')[0] : candidate;
    }
  }

  if (bestTerm && bestScore >= 0.36 && normalizeTextUnaccent(bestTerm) !== norm) {
    return {
      didYouMean: bestTerm,
      effectiveQuery: bestScore >= 0.45 ? bestTerm : cleanRaw,
      autoCorrected: bestScore >= 0.45,
    };
  }

  return { didYouMean: null, effectiveQuery: cleanRaw, autoCorrected: false };
}

/**
 * Busca na API Oficial Pública do Mercado Livre (api.mercadolibre.com/sites/MLB/search)
 */
async function searchMercadoLivreOfficialApi(
  query: string,
  userId: string
): Promise<{
  offers: Omit<ComparatorOfferItem, 'costBenefitScore' | 'isBestValue' | 'bestValueReason'>[];
  diagnostic: StoreSearchDiagnostic;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=6`;

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RadarDeOfertasSaaS/2.0',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        offers: [],
        diagnostic: {
          store: 'mercadolivre',
          displayName: 'Mercado Livre',
          status: 'error',
          resultsCount: 0,
          sourceUsed: 'API Oficial Mercado Livre (sites/MLB/search)',
          message: `A API pública do Mercado Livre retornou HTTP ${res.status} neste momento.`,
        },
      };
    }

    const json = await res.json();
    const results = Array.isArray(json?.results) ? json.results.slice(0, 6) : [];
    const offers: Omit<ComparatorOfferItem, 'costBenefitScore' | 'isBestValue' | 'bestValueReason'>[] = [];
    const db = readDatabase();
    const credsMap = await getStoreCredentialsMapWithSecrets(userId, db.stores);

    for (const item of results) {
      const price = Number(item.price || 0);
      if (!price || price <= 0) continue;

      const originalPrice =
        item.original_price && Number(item.original_price) > price
          ? Number(item.original_price)
          : null;
      const discountPct =
        originalPrice && originalPrice > price
          ? Math.round(((originalPrice - price) / originalPrice) * 100)
          : null;

      const freeShipping = Boolean(item.shipping?.free_shipping);
      const soldCount = typeof item.sold_quantity === 'number' ? item.sold_quantity : null;
      const productUrl = String(item.permalink || '').trim();
      if (!productUrl) continue;

      const hiResThumb = String(item.thumbnail || '').replace(/-I\.jpg$/i, '-O.jpg');

      // Converter para link de afiliado caso o usuário tenha tag do Mercado Livre configurada
      const conv = await convertToAffiliateLink(productUrl, credsMap);
      const affiliateUrl = conv.affiliateUrl || productUrl;

      // Salvar automaticamente no histórico de preços (price_history)
      void recordOfferPriceHistory({
        productUrl,
        productTitle: String(item.title || 'Produto Mercado Livre'),
        store: 'mercadolivre',
        price,
        originalPrice: originalPrice ?? undefined,
      });

      offers.push({
        id: `ml-${item.id || crypto.randomUUID()}`,
        store: 'mercadolivre',
        storeDisplayName: 'Mercado Livre',
        title: String(item.title || 'Produto Mercado Livre'),
        price,
        originalPrice,
        discountPct,
        freeShipping,
        shippingLabel: freeShipping ? 'Frete Grátis Full/Envios' : 'Frete calculado no checkout',
        rating: null,
        reviewsCount: null,
        soldCount,
        couponText: discountPct && discountPct >= 15 ? `${discountPct}% OFF aplicado` : null,
        imageUrl: hiResThumb || null,
        productUrl,
        affiliateUrl,
        isAffiliateLinkVerified: conv.verificationStatus === 'verificado',
        commissionRatePct: null,
        dataSourceLabel: 'API Oficial Mercado Livre',
      });
    }

    return {
      offers,
      diagnostic: {
        store: 'mercadolivre',
        displayName: 'Mercado Livre',
        status: 'ok',
        resultsCount: offers.length,
        sourceUsed: 'API Oficial Mercado Livre (sites/MLB/search)',
        message: `${offers.length} oferta(s) consultada(s) em tempo real na API Oficial do Mercado Livre.`,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      offers: [],
      diagnostic: {
        store: 'mercadolivre',
        displayName: 'Mercado Livre',
        status: 'error',
        resultsCount: 0,
        sourceUsed: 'API Oficial Mercado Livre',
        message: `Não foi possível consultar a API do Mercado Livre no momento (${msg}).`,
      },
    };
  }
}

/**
 * Busca na API Oficial de Afiliados da Shopee (`productOfferV2` GraphQL)
 */
async function searchShopeeOfficialAffiliateApi(
  query: string,
  userId: string
): Promise<{
  offers: Omit<ComparatorOfferItem, 'costBenefitScore' | 'isBestValue' | 'bestValueReason'>[];
  diagnostic: StoreSearchDiagnostic;
}> {
  const creds = await getDecryptedCredentials(userId, 'shopee');
  if (!creds || !creds.appId || !creds.appSecret) {
    return {
      offers: [],
      diagnostic: {
        store: 'shopee',
        displayName: 'Shopee',
        status: 'requires_credentials',
        resultsCount: 0,
        sourceUsed: 'API Oficial Shopee Affiliate (productOfferV2)',
        message:
          'Conecte seu App ID e App Secret da Shopee em Conexões para buscar ofertas ao vivo na API Oficial da Shopee.',
      },
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const gqlQuery = `query {
    productOfferV2(keyword: ${JSON.stringify(query)}, sortType: 2, limit: 6) {
      nodes {
        itemId
        productName
        priceMin
        priceMax
        priceDiscountRate
        sales
        ratingStar
        commissionRate
        imageUrl
        productLink
        offerLink
      }
    }
  }`;

  const payload = JSON.stringify({ query: gqlQuery });
  const cleanAppId = creds.appId.trim();
  const cleanSecret = creds.appSecret.trim();
  const signature = crypto
    .createHash('sha256')
    .update(`${cleanAppId}${nowSec}${payload}${cleanSecret}`, 'utf8')
    .digest('hex');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500);

    const res = await fetch('https://open-api.affiliate.shopee.com.br/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `SHA256 Credential=${cleanAppId}, Timestamp=${nowSec}, Signature=${signature}`,
      },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.errors?.length) {
      const apiErr = json?.errors?.[0]?.message || `HTTP ${res.status}`;
      return {
        offers: [],
        diagnostic: {
          store: 'shopee',
          displayName: 'Shopee',
          status: 'error',
          resultsCount: 0,
          sourceUsed: 'API Oficial Shopee Affiliate (productOfferV2)',
          message: `Aviso da API Oficial da Shopee: ${apiErr}`,
        },
      };
    }

    const nodes = Array.isArray(json?.data?.productOfferV2?.nodes)
      ? json.data.productOfferV2.nodes
      : [];
    const offers: Omit<ComparatorOfferItem, 'costBenefitScore' | 'isBestValue' | 'bestValueReason'>[] = [];

    for (const n of nodes) {
      const price = Number(n.priceMin || n.priceMax || 0);
      if (!price || price <= 0) continue;

      const discountPct = Number(n.priceDiscountRate || 0) > 0 ? Math.round(Number(n.priceDiscountRate)) : null;
      const originalPrice =
        discountPct && discountPct < 90
          ? Number((price / (1 - discountPct / 100)).toFixed(2))
          : null;
      const rating = n.ratingStar ? Number(Number(n.ratingStar).toFixed(1)) : null;
      const soldCount = typeof n.sales === 'number' ? n.sales : null;
      const commPct = n.commissionRate ? Number((Number(n.commissionRate) * 100).toFixed(1)) : null;
      const productUrl = String(n.productLink || n.offerLink || '').trim();
      const affiliateUrl = String(n.offerLink || n.productLink || '').trim();

      if (!productUrl) continue;

      void recordOfferPriceHistory({
        productUrl,
        productTitle: String(n.productName || 'Produto Shopee'),
        store: 'shopee',
        price,
        originalPrice: originalPrice ?? undefined,
      });

      offers.push({
        id: `shopee-${n.itemId || crypto.randomUUID()}`,
        store: 'shopee',
        storeDisplayName: 'Shopee',
        title: String(n.productName || 'Produto Shopee'),
        price,
        originalPrice,
        discountPct,
        freeShipping: null,
        shippingLabel: 'Cupom de Frete Grátis Shopee no App',
        rating,
        reviewsCount: null,
        soldCount,
        couponText: commPct ? `Comissão afiliado: ${commPct}%` : null,
        imageUrl: n.imageUrl || null,
        productUrl,
        affiliateUrl,
        isAffiliateLinkVerified: Boolean(n.offerLink),
        commissionRatePct: commPct,
        dataSourceLabel: 'API Oficial Shopee Affiliate',
      });
    }

    return {
      offers,
      diagnostic: {
        store: 'shopee',
        displayName: 'Shopee',
        status: 'ok',
        resultsCount: offers.length,
        sourceUsed: 'API Oficial Shopee Affiliate (productOfferV2)',
        message: `${offers.length} oferta(s) consultada(s) ao vivo na API Oficial de Afiliados da Shopee.`,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      offers: [],
      diagnostic: {
        store: 'shopee',
        displayName: 'Shopee',
        status: 'error',
        resultsCount: 0,
        sourceUsed: 'API Oficial Shopee Affiliate',
        message: `Erro ao consultar API Oficial da Shopee: ${msg}`,
      },
    };
  }
}

/**
 * Calcula pontuação de custo-benefício transparente e destaca a melhor oferta.
 */
function rankAndHighlightBestValue(
  items: Omit<ComparatorOfferItem, 'costBenefitScore' | 'isBestValue' | 'bestValueReason'>[]
): {
  offers: ComparatorOfferItem[];
  bestOfferId: string | null;
} {
  if (items.length === 0) {
    return { offers: [], bestOfferId: null };
  }

  const prices = items.map((i) => i.price).filter((p) => p > 0);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceSpan = Math.max(1, maxPrice - minPrice);

  const scored: ComparatorOfferItem[] = items.map((it) => {
    // 1. Pontuação de preço (0 a 55 pontos — menor preço ganha mais)
    const priceScore = 55 * (1 - (it.price - minPrice) / priceSpan);
    // 2. Frete grátis (+15 pontos)
    const shippingScore = it.freeShipping ? 15 : 0;
    // 3. Desconto real (+0 a 15 pontos)
    const discountScore = Math.min(15, (it.discountPct || 0) * 0.4);
    // 4. Avaliação e volume de vendas (+0 a 15 pontos)
    const ratingScore = it.rating ? Math.max(0, (it.rating - 3.5) * 6) : 4;
    const salesScore = it.soldCount ? Math.min(6, Math.log10(it.soldCount + 1) * 2) : 0;

    const totalScore = Math.round(priceScore + shippingScore + discountScore + ratingScore + salesScore);

    return {
      ...it,
      costBenefitScore: totalScore,
      isBestValue: false,
      bestValueReason: null,
    };
  });

  scored.sort((a, b) => b.costBenefitScore - a.costBenefitScore || a.price - b.price);

  const best = scored[0];
  if (best) {
    best.isBestValue = true;
    const reasons: string[] = [];
    if (best.price === minPrice) reasons.push('Menor preço entre as lojas');
    if (best.freeShipping) reasons.push('Frete Grátis incluso');
    if (best.discountPct && best.discountPct >= 10) reasons.push(`${best.discountPct}% de desconto`);
    if (best.rating && best.rating >= 4.5) reasons.push(`Nota ${best.rating}★`);
    best.bestValueReason =
      reasons.length > 0 ? reasons.join(' · ') : 'Melhor relação entre preço, frete e reputação';
  }

  return {
    offers: scored,
    bestOfferId: best?.id || null,
  };
}

export interface ComparatorStoreProvider {
  id: string;
  storeSlug: 'mercadolivre' | 'shopee' | 'amazon' | 'netshoes' | 'magalu';
  displayName: string;
  sourceType: 'official_api' | 'catalog_fallback' | 'future_provider';
  enabled: boolean;
  priority: number;
  description: string;
  executeSearch?: (
    query: string,
    userId: string
  ) => Promise<{
    offers: Omit<ComparatorOfferItem, 'costBenefitScore' | 'isBestValue' | 'bestValueReason'>[];
    diagnostic: StoreSearchDiagnostic;
  }>;
}

/**
 * PONTO DE EXPANSÃO OFICIAL DO BUSCADOR COMPARADOR:
 * Lista modular de provedores de busca por loja. Para conectar uma nova fonte
 * futura (ex: Amazon Creators API / PA-API 5.0, Rakuten Netshoes API, Lomadee/Magalu),
 * basta adicionar um item neste registro ou chamar `registerComparatorStoreProvider(...)`.
 */
export const COMPARATOR_STORE_PROVIDERS: ComparatorStoreProvider[] = [
  {
    id: 'shopee-official-graphql',
    storeSlug: 'shopee',
    displayName: 'Shopee (API Oficial Affiliate GraphQL)',
    sourceType: 'official_api',
    enabled: true,
    priority: 1,
    description: 'Consulta ao vivo via productOfferV2 na API Oficial de Afiliados da Shopee.',
    executeSearch: searchShopeeOfficialAffiliateApi,
  },
  {
    id: 'mercadolivre-official-rest',
    storeSlug: 'mercadolivre',
    displayName: 'Mercado Livre (API Oficial MLB Search)',
    sourceType: 'official_api',
    enabled: true,
    priority: 2,
    description: 'Consulta pública oficial em api.mercadolibre.com/sites/MLB/search com conversão de tag.',
    executeSearch: searchMercadoLivreOfficialApi,
  },
  {
    id: 'amazon-paapi-slot',
    storeSlug: 'amazon',
    displayName: 'Amazon Associados (PA-API 5.0 / Creators API)',
    sourceType: 'catalog_fallback',
    enabled: false,
    priority: 3,
    description: 'Ponto de expansão reservado para Amazon PA-API 5.0 (atualmente usa catálogo local validado).',
  },
  {
    id: 'netshoes-rakuten-slot',
    storeSlug: 'netshoes',
    displayName: 'Netshoes / Zattini (Rakuten Advertising API)',
    sourceType: 'catalog_fallback',
    enabled: false,
    priority: 4,
    description: 'Ponto de expansão reservado para API Rakuten Advertising (atualmente usa catálogo local validado).',
  },
  {
    id: 'magalu-partner-slot',
    storeSlug: 'magalu',
    displayName: 'Parceiro Magalu',
    sourceType: 'catalog_fallback',
    enabled: false,
    priority: 5,
    description: 'Ponto de expansão reservado para Parceiro Magalu (atualmente usa catálogo local validado).',
  },
];

export function registerComparatorStoreProvider(provider: ComparatorStoreProvider): void {
  const existingIdx = COMPARATOR_STORE_PROVIDERS.findIndex((p) => p.id === provider.id);
  if (existingIdx >= 0) {
    COMPARATOR_STORE_PROVIDERS[existingIdx] = provider;
  } else {
    COMPARATOR_STORE_PROVIDERS.push(provider);
  }
  COMPARATOR_STORE_PROVIDERS.sort((a, b) => a.priority - b.priority);
}

/**
 * Executa a busca comparadora multiloja com tolerância a erros de digitação e cache de 5 minutos.
 */
export async function runComparatorSearch(params: {
  query: string;
  userId?: string;
  forceRefresh?: boolean;
}): Promise<ComparatorSearchResult> {
  const userId = params.userId || ADMIN_UUID;
  const rawQuery = (params.query || '').trim();

  const suggestion = await resolveDidYouMeanSuggestion(rawQuery);
  const effectiveQuery = suggestion.effectiveQuery || rawQuery;

  const cacheKey = `${userId}::${normalizeTextUnaccent(effectiveQuery)}`;
  if (!params.forceRefresh) {
    const cached = comparatorCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.payload,
        rawQuery,
        didYouMean: suggestion.didYouMean,
        autoCorrected: suggestion.autoCorrected,
        fromCache: true,
      };
    }
  }

  // 1. Consultar provedores oficiais ativos registrados em COMPARATOR_STORE_PROVIDERS
  const activeProviders = COMPARATOR_STORE_PROVIDERS.filter(
    (p) => p.enabled && typeof p.executeSearch === 'function'
  );
  const providerResults = await Promise.all(
    activeProviders.map((prov) => prov.executeSearch!(effectiveQuery, userId))
  );

  const liveOffers = providerResults.flatMap((r) => r.offers);
  const liveDiagnostics = providerResults.map((r) => r.diagnostic);

  // 2. Consultar produtos já validados no catálogo local do usuário (Shopee, ML, Amazon, Netshoes)
  let db;
  try {
    db = await getDatabase();
  } catch {
    db = readDatabase();
  }

  const queryTokens = normalizeTextUnaccent(effectiveQuery)
    .split(' ')
    .filter((t) => t.length >= 2);

  const catalogMatches: Omit<ComparatorOfferItem, 'costBenefitScore' | 'isBestValue' | 'bestValueReason'>[] = [];
  for (const prod of db.products || []) {
    if (!prod.currentPrice || prod.currentPrice <= 0) continue;
    const titleNorm = normalizeTextUnaccent(prod.title);
    const matches =
      queryTokens.some((tk) => titleNorm.includes(tk)) ||
      computeTrigramSimilarity(effectiveQuery, prod.title) >= 0.25;

    if (matches) {
      const discountPct =
        prod.originalPrice && prod.originalPrice > prod.currentPrice
          ? Math.round(((prod.originalPrice - prod.currentPrice) / prod.originalPrice) * 100)
          : null;

      catalogMatches.push({
        id: `cat-${prod.id}`,
        store: prod.storeName,
        storeDisplayName:
          prod.storeName === 'mercadolivre'
            ? 'Mercado Livre'
            : prod.storeName === 'shopee'
            ? 'Shopee'
            : prod.storeName === 'amazon'
            ? 'Amazon'
            : prod.storeName === 'netshoes'
            ? 'Netshoes'
            : 'Magalu',
        title: prod.title,
        price: prod.currentPrice,
        originalPrice: prod.originalPrice || null,
        discountPct,
        freeShipping: null,
        shippingLabel: 'Consultar no link oficial',
        rating: prod.rating || null,
        reviewsCount: prod.reviewsCount || null,
        soldCount: prod.salesCount || null,
        couponText: null,
        imageUrl: prod.imageUrl || null,
        productUrl: prod.productUrl || prod.affiliateUrl,
        affiliateUrl: prod.affiliateUrl || prod.productUrl,
        isAffiliateLinkVerified: true,
        commissionRatePct: null,
        dataSourceLabel: 'Catálogo Verificado do Painel',
      });
    }
  }

  const combinedRaw = [...liveOffers, ...catalogMatches];
  const { offers, bestOfferId } = rankAndHighlightBestValue(combinedRaw);

  const amazonCatCount = catalogMatches.filter((c) => c.store === 'amazon').length;
  const netshoesCatCount = catalogMatches.filter((c) => c.store === 'netshoes').length;

  const storeDiagnostics: StoreSearchDiagnostic[] = [
    ...liveDiagnostics,
    {
      store: 'amazon',
      displayName: 'Amazon',
      status: 'catalog_only',
      resultsCount: amazonCatCount,
      sourceUsed: 'Catálogo Local + Conversor de Tag Associados',
      message:
        'A busca ao vivo na Amazon exige chave da Amazon Creators/PA-API 5.0. Para evitar scraping frágil ou bloqueios, exibimos ofertas da Amazon já capturadas no seu catálogo.',
    },
    {
      store: 'netshoes',
      displayName: 'Netshoes / Magalu',
      status: 'catalog_only',
      resultsCount: netshoesCatCount,
      sourceUsed: 'Catálogo Local (Rakuten / Parceiro Magalu)',
      message:
        'Netshoes e Magalu não fornecem API pública aberta de busca por termo sem contrato enterprise. Exibindo itens já validados no seu catálogo.',
    },
  ];

  const payload: ComparatorSearchResult = {
    rawQuery,
    effectiveQuery,
    didYouMean: suggestion.didYouMean,
    autoCorrected: suggestion.autoCorrected,
    fromCache: false,
    cachedAt: new Date().toISOString(),
    cacheTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
    bestOfferId,
    offers,
    storeDiagnostics,
  };

  comparatorCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });

  return payload;
}
