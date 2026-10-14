import "server-only";

import { config } from "../config";
import { MercadoLivreError } from "../mercadolivre";
import { DESIRED_CATEGORIES, type WishlistCategory } from "./terms";
import type { CandidateRawItem } from "./validator";

export interface FetcherOptions {
  token: string;
  maxTermsPerRun?: number;
  maxItemsPerTerm?: number;
  deadlineMs?: number;
}

export interface FetcherResult {
  items: CandidateRawItem[];
  termsQueried: string[];
  totalRawFound: number;
  apiErrors: string[];
}

function toHttps(url: string | undefined | null): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//i, "https://");
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 && attempt < retries) {
        const delay = (attempt + 1) * 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        attempt++;
        continue;
      }
      throw err;
    }
  }
  return fetch(url, options);
}

/**
 * Consulta itens via /sites/MLB/search com condition=new
 */
async function searchViaSiteSearch(
  query: string,
  token: string,
  limit: number
): Promise<{ ok: boolean; status: number; items: CandidateRawItem[]; error?: string }> {
  const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&condition=new&limit=${limit}`;

  try {
    const res = await fetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(3500),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, status: res.status, items: [], error: `HTTP ${res.status}: ${errText.slice(0, 100)}` };
    }

    const data = (await res.json().catch(() => ({}))) as {
      results?: Array<{
        id: string;
        title: string;
        thumbnail?: string;
        price?: number;
        original_price?: number | null;
        currency_id?: string;
        permalink?: string;
        shipping?: {
          free_shipping?: boolean;
          logistic_type?: string;
        };
        condition?: string;
      }>;
    };

    const results = data.results || [];
    const normalized: CandidateRawItem[] = results
      .filter((r) => r.id && typeof r.price === "number")
      .map((r) => ({
        externalId: r.id,
        title: r.title,
        thumbnail: toHttps(r.thumbnail),
        price: r.price as number,
        originalPrice: typeof r.original_price === "number" ? r.original_price : null,
        currency: r.currency_id || "BRL",
        originalUrl: r.permalink || `https://produto.mercadolivre.com.br/MLB-${r.id.replace(/^MLB-?/, "")}`,
        freeShipping: Boolean(r.shipping?.free_shipping),
        isFull: r.shipping?.logistic_type === "fulfillment",
        condition: r.condition || "new",
      }));

    return { ok: true, status: res.status, items: normalized };
  } catch (err) {
    return { ok: false, status: 0, items: [], error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Fallback robusto via catálogo oficial de produtos (/products/search + /products/:id/items)
 * Ativo e com suporte a Buy Box vencedora oficial
 */
async function searchViaCatalogFallback(
  query: string,
  token: string,
  limit: number,
  categoryName: string
): Promise<CandidateRawItem[]> {
  const searchUrl = `https://api.mercadolibre.com/products/search?status=active&site_id=${config.mercadoLivre.siteId}&q=${encodeURIComponent(query)}&limit=${limit}`;

  const res = await fetchWithRetry(searchUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(3500),
  });

  if (!res.ok) return [];

  const data = (await res.json().catch(() => ({}))) as {
    results?: Array<{
      id: string;
      name: string;
      permalink?: string;
      pictures?: Array<{ url?: string; secure_url?: string }>;
    }>;
  };

  const products = data.results || [];
  const candidates: CandidateRawItem[] = [];

  for (const p of products.slice(0, 6)) {
    try {
      const itRes = await fetchWithRetry(
        `https://api.mercadolibre.com/products/${p.id}/items?limit=1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(2500),
        }
      );

      if (!itRes.ok) continue;

      const itData = (await itRes.json().catch(() => ({}))) as {
        results?: Array<{
          item_id?: string;
          price?: number;
          original_price?: number | null;
          currency_id?: string;
          shipping?: { free_shipping?: boolean; logistic_type?: string };
        }>;
      };

      const item = itData.results?.[0];
      if (!item || typeof item.price !== "number") continue;

      const cleanId = (item.item_id || p.id || "").replace(/^MLB-?/, "");
      const picture = p.pictures?.[0];

      candidates.push({
        externalId: item.item_id || p.id,
        title: p.name,
        thumbnail: toHttps(picture?.secure_url || picture?.url),
        price: item.price,
        originalPrice: typeof item.original_price === "number" ? item.original_price : null,
        currency: item.currency_id || "BRL",
        originalUrl: item.item_id
          ? `https://produto.mercadolivre.com.br/MLB-${cleanId}`
          : (p.permalink || `https://produto.mercadolivre.com.br/MLB-${cleanId}`),
        freeShipping: Boolean(item.shipping?.free_shipping),
        isFull: item.shipping?.logistic_type === "fulfillment",
        categoryName,
        condition: "new",
      });
    } catch {
      // continua para o próximo produto
    }
  }

  return candidates;
}

/**
 * Consulta a API do Mercado Livre iterando sobre as categorias e termos de desejo
 */
export async function fetchDesiredOffers(options: FetcherOptions): Promise<FetcherResult> {
  const { token, maxTermsPerRun = 6, maxItemsPerTerm = 8, deadlineMs = 17_000 } = options;
  const deadlineAt = Date.now() + deadlineMs;

  const rawFound: CandidateRawItem[] = [];
  const termsQueried: string[] = [];
  const apiErrors: string[] = [];

  // Ordena categorias por prioridade (alta > media > menor)
  const priorityOrder: Record<WishlistCategory["priority"], number> = { alta: 1, media: 2, menor: 3 };
  const sortedCategories = [...DESIRED_CATEGORIES].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );

  let termsExecuted = 0;

  for (const category of sortedCategories) {
    if (termsExecuted >= maxTermsPerRun || Date.now() > deadlineAt) {
      break;
    }

    // Rotaciona os termos da categoria a cada ciclo de minuto para varredura constante
    const termIndex = Math.floor(Date.now() / 60_000) % category.terms.length;
    const term = category.terms[termIndex] || category.terms[0];
    termsQueried.push(term);
    termsExecuted++;

    console.log(`[fetcher] Escaneando termo de desejo: "${term}" (${category.name})...`);

    try {
      // 1. Tenta consulta direta /sites/MLB/search com condition=new
      const direct = await searchViaSiteSearch(term, token, maxItemsPerTerm);

      if (direct.ok && direct.items.length > 0) {
        console.log(`[fetcher] Retornados ${direct.items.length} itens via /sites/MLB/search para "${term}"`);
        for (const it of direct.items) {
          it.categoryName = category.name;
          rawFound.push(it);
        }
      } else {
        // Se retornar 403 Forbidden ou não encontrar, aciona o fallback de catálogo com Buy Box oficial
        if (direct.status === 403) {
          console.log(`[fetcher] /sites/MLB/search restrito (403). Usando catálogo oficial para "${term}"...`);
        }
        const fallbackItems = await searchViaCatalogFallback(term, token, maxItemsPerTerm, category.name);
        console.log(`[fetcher] Retornados ${fallbackItems.length} itens oficiais do catálogo para "${term}"`);
        rawFound.push(...fallbackItems);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      apiErrors.push(`"${term}": ${msg}`);
      console.warn(`[fetcher] Falha ao consultar "${term}":`, msg);
    }
  }

  // Priorização de itens na fila de candidatos:
  // 1. Logística Full (fulfillment)
  // 2. Frete Grátis
  // 3. Maior desconto aparente
  rawFound.sort((a, b) => {
    if (Boolean(a.isFull) !== Boolean(b.isFull)) {
      return a.isFull ? -1 : 1;
    }
    if (Boolean(a.freeShipping) !== Boolean(b.freeShipping)) {
      return a.freeShipping ? -1 : 1;
    }
    const discA = a.originalPrice && a.originalPrice > a.price ? (a.originalPrice - a.price) / a.originalPrice : 0;
    const discB = b.originalPrice && b.originalPrice > b.price ? (b.originalPrice - b.price) / b.originalPrice : 0;
    return discB - discA;
  });

  return {
    items: rawFound,
    termsQueried,
    totalRawFound: rawFound.length,
    apiErrors,
  };
}
