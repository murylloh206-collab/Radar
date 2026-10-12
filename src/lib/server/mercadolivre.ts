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
  rating?: number | null;
  reviewsCount?: number | null;
  sellerReputation?: string | null;
  categoryId?: string | null;
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

function maskSensitive(val: unknown): string {
  if (!val) return "";
  const str = typeof val === "string" ? val : JSON.stringify(val);
  return str
    .replace(/(Bearer\s+)[A-Za-z0-9_.-]+/gi, "$1[REDACTED]")
    .replace(/(APP_USR-[A-Za-z0-9_.-]+)/gi, "[REDACTED_ACCESS_TOKEN]")
    .replace(/(TG-[A-Za-z0-9_.-]+)/gi, "[REDACTED_TOKEN_CODE]")
    .replace(/(client_secret[=:]["']?)[A-Za-z0-9_.-]+/gi, "$1[REDACTED_SECRET]")
    .replace(/(client_id[=:]["']?)[A-Za-z0-9_.-]+/gi, "$1[REDACTED_CLIENT_ID]")
    .replace(/(code[=:]["']?)[A-Za-z0-9_.-]+/gi, "$1[REDACTED_CODE]");
}

import { getStoredMLTokens, saveStoredMLTokens } from "./storage";

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = config.mercadoLivre;
  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  const raw = await res.text().catch(() => "");
  const data = (() => {
    try { return JSON.parse(raw); } catch { return {}; }
  })() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user_id?: number;
    message?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    console.error(`[Mercado Livre OAuth] Falha ao renovar token (Status ${res.status}): ${maskSensitive(raw)}`);
    throw new MercadoLivreError(
      `Falha ao renovar token do Mercado Livre (${data.error_description || data.message || res.status}). Por favor, reconecte sua conta.`,
      res.status,
    );
  }

  const ttlMs = (data.expires_in ?? 21600) * 1000;
  await saveStoredMLTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + ttlMs - 5 * 60_000,
    userId: data.user_id,
  });

  console.log(`[Mercado Livre OAuth] Token renovado com sucesso para usuário ID ${data.user_id || "identificado"}`);
  return data.access_token;
}

export async function exchangeCodeForToken(code: string, redirectUri: string) {
  const { clientId, clientSecret, redirectUri: configuredUri } = config.mercadoLivre;
  const effectiveUri = configuredUri || redirectUri;

  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: effectiveUri,
    }),
    cache: "no-store",
  });

  const raw = await res.text().catch(() => "");
  const data = (() => {
    try { return JSON.parse(raw); } catch { return {}; }
  })() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user_id?: number;
    message?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    console.error(`[Mercado Livre OAuth] Erro na troca de código (Status ${res.status}): ${maskSensitive(raw)}`);
    throw new Error(data.error_description || data.message || "Erro ao autenticar com o Mercado Livre.");
  }

  const ttlMs = (data.expires_in ?? 21600) * 1000;
  await saveStoredMLTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + ttlMs - 5 * 60_000,
    userId: data.user_id,
  });

  console.log(`[Mercado Livre OAuth] Código trocado com sucesso para usuário ID ${data.user_id}`);
  return data;
}

export async function hasActiveMLConnection(): Promise<boolean> {
  const stored = await getStoredMLTokens();
  if (stored) {
    if (stored.expiresAt > Date.now() || stored.refreshToken) return true;
    return false;
  }
  return false;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  const stored = await getStoredMLTokens();
  if (stored) {
    if (!forceRefresh && stored.expiresAt > Date.now()) {
      return stored.accessToken;
    }
    if (stored.refreshToken) {
      return refreshAccessToken(stored.refreshToken);
    }
    if (stored.accessToken && !forceRefresh) {
      return stored.accessToken;
    }
  }

  const { accessToken } = config.mercadoLivre;
  if (accessToken && !forceRefresh) return accessToken;

  throw new MercadoLivreError(
    "Conta do Mercado Livre não conectada. Conecte sua conta para buscar ofertas em tempo real.",
    401,
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

    // Se receber 401 (token expirado), tenta renovar usando o refresh_token e repete UMA ÚNICA VEZ
    if (res.status === 401 && attempt === 0) {
      console.warn(`[Mercado Livre API] Token expirado (401) em ${pathAndQuery}. Tentando renovar com refresh_token...`);
      try {
        token = await getAccessToken(true);
        continue;
      } catch (refreshErr) {
        const msg = refreshErr instanceof Error ? refreshErr.message : "Falha na renovação do token";
        console.error(`[Mercado Livre API] Falha na renovação: ${maskSensitive(msg)}`);
        throw new MercadoLivreError("Sessão expirada. Por favor, reconecte sua conta do Mercado Livre.", 401);
      }
    }

    const raw = await res.text().catch(() => "");
    const body = (() => {
      try { return JSON.parse(raw); } catch { return {}; }
    })() as { message?: string; error?: string; code?: string; status?: number; blocked_by?: string };

    const status = res.status;
    const msg = body.message || body.error || `Erro HTTP ${status}`;

    // Registra no terminal o status e a mensagem com credenciais estritamente mascaradas
    console.error(`[Mercado Livre API] Status ${status} em ${pathAndQuery}: ${maskSensitive(raw || msg)}`);

    if (status === 403) {
      if (body.code === "PA_UNAUTHORIZED_RESULT_FROM_POLICIES" || body.blocked_by === "PolicyAgent") {
        throw new MercadoLivreError(
          "O Mercado Livre recusou a busca de anúncios (403 PolicyAgent). O aplicativo possui credenciais válidas, mas a política de segurança da API oficial bloqueia a busca global para esta aplicação no DevCenter.",
          403,
        );
      }
      throw new MercadoLivreError(`O Mercado Livre recusou a requisição (403): ${msg}`, 403);
    }

    throw new MercadoLivreError(msg, status);
  }

  throw new MercadoLivreError("Falha ao consultar o Mercado Livre após tentativas.");
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
  category_id?: string;
  reviews?: { rating_average?: number; total?: number };
  seller?: { power_seller_status?: string; nickname?: string };
}

async function searchListings(term: string, limit: number, categoryId?: string): Promise<MLProduct[]> {
  const params: Record<string, string> = { limit: String(limit) };
  if (term) params.q = term;
  if (categoryId) params.category = categoryId;
  const q = new URLSearchParams(params);
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
      rating: r.reviews?.rating_average ?? null,
      reviewsCount: r.reviews?.total ?? null,
      sellerReputation: r.seller?.power_seller_status ?? null,
      categoryId: r.category_id ?? null,
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

/** Busca produtos por termo ou categoria. Tenta a busca de anúncios e, se bloqueada, o catálogo. */
export async function searchProducts(
  term: string,
  limit: number,
  categoryId?: string,
): Promise<MLProduct[]> {
  try {
    return await searchListings(term, limit, categoryId);
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

export interface MLRevalidationResult {
  valid: boolean;
  status: "active" | "paused" | "closed" | "not_found";
  price?: number;
  originalPrice?: number | null;
  freeShipping?: boolean;
  availableQuantity?: number;
  error?: string;
}

/**
 * Revalida se o item do Mercado Livre continua ativo e com estoque antes do disparo automático.
 */
export async function revalidateMLItem(externalId: string): Promise<MLRevalidationResult> {
  try {
    const isConn = await hasActiveMLConnection();
    if (!isConn) {
      // Sem conexão com a API oficial, mantém os dados atuais sem bloquear
      return { valid: true, status: "active" };
    }

    const item = await mlGet<{
      status?: string;
      price?: number;
      original_price?: number | null;
      available_quantity?: number;
      shipping?: { free_shipping?: boolean };
    }>(`/items/${externalId}`);

    const status = (item.status as "active" | "paused" | "closed") || "active";
    const availableQuantity = item.available_quantity ?? 1;

    if (status !== "active" || availableQuantity <= 0) {
      return {
        valid: false,
        status,
        availableQuantity,
        error: `Produto ${status === "paused" ? "pausado" : "sem estoque"} no Mercado Livre`,
      };
    }

    return {
      valid: true,
      status: "active",
      price: item.price,
      originalPrice: item.original_price ?? null,
      freeShipping: Boolean(item.shipping?.free_shipping),
      availableQuantity,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404")) {
      return { valid: false, status: "not_found", error: "Anúncio não encontrado no Mercado Livre" };
    }
    // Em caso de 403 de política de busca ou rate limit temporário, mantém válido
    return { valid: true, status: "active" };
  }
}
