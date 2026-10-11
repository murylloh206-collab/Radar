import "server-only";

import { config } from "./config";

/**
 * CLIENTE DA API OFICIAL DO MERCADO LIVRE
 * ---------------------------------------
 * - Usa apenas https://api.mercadolibre.com (API oficial). Sem scraping.
 * - Desde 2025 a API exige autenticação até para buscas. Por isso usamos
 *   as credenciais do SEU aplicativo (gratuito) para pegar um token.
 * - Este módulo só DESCOBRE produtos. Ele nunca gera link de afiliado.
 */

const API_BASE = "https://api.mercadolibre.com";

/** Produto como vem do Mercado Livre, já "limpo" para o nosso formato. */
export interface MLProduct {
  externalId: string;
  title: string;
  thumbnail: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  originalUrl: string;
  freeShipping: boolean;
}

export class MercadoLivreError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "MercadoLivreError";
  }
}

// ---------------------------------------------------------------------------
// Token de acesso (guardado em memória enquanto o servidor estiver ligado)
// ---------------------------------------------------------------------------

const tokenCache = globalThis as unknown as {
  __mlToken?: { value: string; expiresAt: number };
};

async function fetchAppToken(): Promise<string> {
  const { clientId, clientSecret } = config.mercadoLivre;
  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    message?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new MercadoLivreError(
      `Não foi possível autenticar no Mercado Livre (${data.message ?? res.status}). Confira ML_CLIENT_ID e ML_CLIENT_SECRET no .env.local.`,
      res.status,
    );
  }

  const ttlMs = (data.expires_in ?? 21600) * 1000;
  // Renova 5 minutos antes de expirar.
  tokenCache.__mlToken = { value: data.access_token, expiresAt: Date.now() + ttlMs - 5 * 60_000 };
  return data.access_token;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  const { accessToken, clientId, clientSecret } = config.mercadoLivre;

  if (clientId && clientSecret) {
    const cached = tokenCache.__mlToken;
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;
    return fetchAppToken();
  }
  if (accessToken) return accessToken;

  throw new MercadoLivreError(
    "Credenciais do Mercado Livre não configuradas. Preencha ML_CLIENT_ID e ML_CLIENT_SECRET no arquivo .env.local e reinicie o painel (veja o README).",
  );
}

/** GET autenticado na API oficial, com uma nova tentativa se o token expirou. */
async function mlGet<T>(pathAndQuery: string): Promise<T> {
  let token = await getAccessToken();

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API_BASE}${pathAndQuery}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) return (await res.json()) as T;

    if (res.status === 401 && attempt === 0) {
      token = await getAccessToken(true);
      continue;
    }

    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new MercadoLivreError(body.message || `Erro ${res.status} na API do Mercado Livre`, res.status);
  }

  throw new MercadoLivreError("Falha ao consultar o Mercado Livre.");
}

// ---------------------------------------------------------------------------
// Estratégia 1: busca de anúncios  (/sites/MLB/search)
// ---------------------------------------------------------------------------

interface SearchItemRaw {
  id: string;
  title: string;
  price: number | null;
  original_price: number | null;
  currency_id: string;
  thumbnail?: string;
  permalink: string;
  shipping?: { free_shipping?: boolean };
}

async function searchListings(term: string, limit: number): Promise<MLProduct[]> {
  const q = new URLSearchParams({ q: term, limit: String(limit) });
  const data = await mlGet<{ results: SearchItemRaw[] }>(
    `/sites/${config.mercadoLivre.siteId}/search?${q}`,
  );
  return (data.results ?? [])
    .filter((r) => typeof r.price === "number" && r.price > 0 && r.permalink)
    .map((r) => ({
      externalId: r.id,
      title: r.title,
      thumbnail: toHttps(r.thumbnail),
      price: r.price as number,
      originalPrice: r.original_price ?? null,
      currency: r.currency_id || "BRL",
      originalUrl: r.permalink,
      freeShipping: Boolean(r.shipping?.free_shipping),
    }));
}

// ---------------------------------------------------------------------------
// Estratégia 2 (reserva): catálogo de produtos (/products/search)
// Alguns aplicativos recebem 403 na busca de anúncios. O catálogo oficial
// continua disponível e traz o preço do vendedor que ganha a "buy box".
// ---------------------------------------------------------------------------

interface CatalogProductRaw {
  id: string;
  name: string;
  permalink?: string;
  pictures?: { url?: string; secure_url?: string }[];
}

interface CatalogItemRaw {
  price?: number;
  original_price?: number | null;
  currency_id?: string;
  shipping?: { free_shipping?: boolean };
}

async function searchCatalog(term: string, limit: number): Promise<MLProduct[]> {
  const q = new URLSearchParams({
    status: "active",
    site_id: config.mercadoLivre.siteId,
    q: term,
    limit: String(Math.min(limit, 50)),
  });
  const data = await mlGet<{ results: CatalogProductRaw[] }>(`/products/search?${q}`);
  const products = data.results ?? [];

  // Busca o preço de cada produto em paralelo (poucos por vez).
  const results = await mapWithConcurrency(products, 4, async (p) => {
    try {
      const items = await mlGet<{ results?: CatalogItemRaw[] }>(`/products/${p.id}/items?limit=1`);
      const item = items.results?.[0];
      if (!item?.price) return null;
      const picture = p.pictures?.[0];
      const product: MLProduct = {
        externalId: p.id,
        title: p.name,
        thumbnail: toHttps(picture?.secure_url || picture?.url),
        price: item.price,
        originalPrice: item.original_price ?? null,
        currency: item.currency_id || "BRL",
        originalUrl: p.permalink || `https://www.mercadolivre.com.br/p/${p.id}`,
        freeShipping: Boolean(item.shipping?.free_shipping),
      };
      return product;
    } catch {
      return null; // produto sem anúncio ativo
    }
  });

  return results.filter((r): r is MLProduct => r !== null);
}

// ---------------------------------------------------------------------------
// Função pública
// ---------------------------------------------------------------------------

/** Busca produtos de um termo. Tenta a busca de anúncios e, se bloqueada, o catálogo. */
export async function searchProducts(term: string, limit: number): Promise<MLProduct[]> {
  try {
    return await searchListings(term, limit);
  } catch (err) {
    if (err instanceof MercadoLivreError && (err.status === 403 || err.status === 404)) {
      try {
        return await searchCatalog(term, limit);
      } catch (fallbackErr) {
        if (fallbackErr instanceof MercadoLivreError && fallbackErr.status === 403) {
          throw new MercadoLivreError(
            "O Mercado Livre recusou o acesso (403). Verifique se seu aplicativo no DevCenter está ativo e com as credenciais corretas.",
            403,
          );
        }
        throw fallbackErr;
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function toHttps(url: string | undefined | null): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//i, "https://");
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
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
