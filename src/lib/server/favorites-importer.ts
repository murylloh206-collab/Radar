import "server-only";

import { recordOfferFeedback } from "./feedback-service";
import { executeShopeeGraphQL, generateShopeeShortLink, type ShopeeProductOfferV2Response } from "./shopee";
import { isShopeeConfigured } from "./config";
import { extractBrand } from "./recommendation-engine";
import { loadDecryptedSession } from "./session-vault";
import { saveApprovedOffers } from "./scanner/database";
import type { CandidateRawItem } from "./scanner/validator";

export interface ImportFavoriteResult {
  url: string;
  status: "importado" | "nao_resolvido";
  title?: string;
  price?: number;
  originalPrice?: number | null;
  thumbnail?: string | null;
  brand?: string;
  category?: string;
  source?: "shopee" | "mercadolivre";
  freeShipping?: boolean;
  externalId?: string;
  reason?: string;
}

export interface ImportFavoritesSummary {
  total: number;
  imported: number;
  unresolved: number;
  offersSaved?: number;
  debugSnippet?: string;
  results: ImportFavoriteResult[];
}

/**
 * Expande links curtos da Shopee (shp.ee ou s.shopee.com.br)
 */
async function expandShopeeUrl(url: string): Promise<string> {
  if (!url.includes("shp.ee") && !url.includes("s.shopee.com.br")) {
    return url;
  }
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(6000),
    });
    return res.url || url;
  } catch {
    return url;
  }
}

/**
 * Extrai itemId e shopId de qualquer URL da Shopee
 */
export function extractShopeeIds(url: string): { itemId: string | null; shopId: string | null } {
  const matchI = url.match(/-?i\.(\d+)\.(\d+)/);
  if (matchI) {
    return { shopId: matchI[1], itemId: matchI[2] };
  }
  const matchProduct = url.match(/\/product\/(\d+)\/(\d+)/);
  if (matchProduct) {
    return { shopId: matchProduct[1], itemId: matchProduct[2] };
  }
  const matchSp = url.match(/\/sp\.(\d+)\/(\d+)/);
  if (matchSp) {
    return { shopId: matchSp[1], itemId: matchSp[2] };
  }
  const matchParam = url.match(/[?&]itemid=(\d+)/i);
  if (matchParam) {
    const shopParam = url.match(/[?&]shopid=(\d+)/i);
    return { itemId: matchParam[1], shopId: shopParam ? shopParam[1] : null };
  }
  return { itemId: null, shopId: null };
}

/**
 * Resolve metadados de uma URL da Shopee via Open API
 */
async function resolveShopeeUrl(url: string): Promise<Partial<ImportFavoriteResult>> {
  const expanded = await expandShopeeUrl(url);
  const { itemId, shopId } = extractShopeeIds(expanded);

  if (!itemId) {
    return { status: "nao_resolvido", reason: "Não foi possível extrair o ID do produto da URL da Shopee." };
  }

  const numericId = Number.parseInt(itemId, 10);
  if (!numericId || Number.isNaN(numericId)) {
    return { status: "nao_resolvido", reason: `ID de item Shopee inválido: ${itemId}` };
  }

  const query = `
    query ResolveShopeeItem($itemId: Int64) {
      productOfferV2(itemId: $itemId) {
        nodes {
          itemId
          productName
          price
          priceDiscountRate
          imageUrl
          shopName
          offerLink
        }
      }
    }
  `;

  try {
    const res = await executeShopeeGraphQL<ShopeeProductOfferV2Response>(query, { itemId: numericId }, 6000);
    const node = res.data?.productOfferV2?.nodes?.[0];

    if (!node || !node.productName || !node.price) {
      return { status: "nao_resolvido", reason: "Produto não encontrado ou oferta inativa na Shopee." };
    }

    const price = Number.parseFloat(node.price);
    const brand = extractBrand(node.productName);
    const thumbnail = node.imageUrl || null;
    const discountRate = node.priceDiscountRate ? Number(node.priceDiscountRate) : 0;
    const originalPrice = discountRate > 0 ? price / (1 - discountRate / 100) : null;

    return {
      status: "importado",
      externalId: String(node.itemId),
      title: node.productName,
      price,
      originalPrice,
      thumbnail,
      freeShipping: false,
      brand,
      category: "⭐ Favorito Shopee",
      source: "shopee",
    };
  } catch (err) {
    return { status: "nao_resolvido", reason: err instanceof Error ? err.message : "Falha na chamada Shopee" };
  }
}

/**
 * Resolve metadados de uma URL do Mercado Livre via página pública de produto
 */
/**
 * Concorrência controlada para resolução rápida de múltiplos links
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
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
 * Resolve metadados de uma URL do Mercado Livre via página pública de produto
 */
async function resolveMercadoLivreUrl(url: string, cookie?: string): Promise<Partial<ImportFavoriteResult>> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Cookie": cookie || "cp=13780103; inferredZipcode=true; orgnickp=MICHELHENRIQUE1; orguseridp=353946553;",
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!res.ok) {
      return { status: "nao_resolvido", reason: `HTTP ${res.status} ao carregar página do Mercado Livre.` };
    }

    const html = await res.text();

    // Extrai título com suporte a múltiplas estruturas do Mercado Livre
    const titleMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
      html.match(/<h1[^>]*class="[^"]*ui-pdp-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

    let rawTitle = titleMatch?.[1]
      ?.replace(/<[^>]+>/g, "")
      ?.replace(/\s*\|\s*Mercado\s*Livre.*$/i, "")
      ?.replace(/\s*\|\s*Parcelamento.*$/i, "")
      ?.trim();

    if (rawTitle) {
      rawTitle = rawTitle.replace(/\s*[-|]\s*R\$\s*[\d.,]+.*$/i, "").trim();
    }

    // Fallback inteligente: slug da URL
    if (!rawTitle) {
      const slugMatch = url.match(/mercadolivre\.com\.br\/([^\/]+)\/p\//i);
      if (slugMatch?.[1]) {
        rawTitle = slugMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }

    if (!rawTitle) {
      return { status: "nao_resolvido", reason: "Não foi possível extrair o título do anúncio do Mercado Livre." };
    }

    // Extrai preço numérico com múltiplos seletores de fallback
    const priceMatch =
      html.match(/class="[^"]*ui-pdp-price__second-line[^"]*"[\s\S]*?class="andes-money-amount__fraction"[^>]*>([\d.]+)<\/span>/i) ||
      html.match(/<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([\d.]+)["']/i) ||
      html.match(/<meta[^>]+content=["']([\d.]+)["'][^>]+property=["']product:price:amount["']/i) ||
      html.match(/itemprop=["']price["'][^>]+content=["']([\d.]+)["']/i) ||
      html.match(/content=["']([\d.]+)["'][^>]+itemprop=["']price["']/i) ||
      html.match(/"price"\s*:\s*([\d.]+)/i) ||
      titleMatch?.[1]?.match(/[-|]\s*R\$\s*([\d.,]+)/i);

    let price = 0;
    if (priceMatch?.[1]) {
      price = Number.parseFloat(priceMatch[1].replace(/\./g, "").replace(",", "."));
    }

    if (!price || price <= 0) {
      // Tenta extrair qualquer menção de R$ no HTML ou no título original
      const anyPrice =
        html.match(/R\$\s*([\d.]+,\d{2})/i) ||
        html.match(/class="andes-money-amount__fraction"[^>]*>([\d.]+)<\/span>/i);
      if (anyPrice?.[1]) {
        price = Number.parseFloat(anyPrice[1].replace(/\./g, "").replace(",", "."));
      }
    }

    if (!price || price <= 0) {
      const titleRawStr = titleMatch?.[1] || "";
      return {
        status: "nao_resolvido",
        reason: `Preço não identificado (HTML: ${html.length}b, titleMatch: "${titleRawStr}").`,
      };
    }

    // Imagem / Thumbnail com suporte a meta content antes ou depois de property
    const imgMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<img[^>]*class="[^"]*ui-pdp-image[^"]*"[^>]*src="([^"]+)"/i);
    const thumbnail = imgMatch?.[1] || null;

    // ID MLB
    const mlbMatch = url.match(/\/p\/(MLB\d+)/i) || url.match(/\/(MLB-?\d+)/i);
    const externalId = mlbMatch ? mlbMatch[1].replace("-", "") : `MLB${Date.now()}`;
    const freeShipping = /frete\s+gr[aá]tis/i.test(html);

    // Preço original anterior
    let originalPrice: number | null = null;
    const origMatch =
      html.match(
        /class="[^"]*(?:andes-money-amount--previous|ui-pdp-price__original-value)[^"]*"[\s\S]*?class="andes-money-amount__fraction"[^>]*>([\d.]+)<\/span>/i
      ) || html.match(/"original_price"\s*:\s*([\d.]+)/i);
    if (origMatch?.[1]) {
      const parsedOrig = Number.parseFloat(origMatch[1].replace(/\./g, "").replace(",", "."));
      if (!Number.isNaN(parsedOrig) && parsedOrig > price) {
        originalPrice = parsedOrig;
      }
    }

    const brand = extractBrand(rawTitle);

    return {
      status: "importado",
      externalId,
      title: rawTitle,
      price,
      originalPrice,
      thumbnail,
      freeShipping,
      brand,
      category: "⭐ Favorito do Usuário",
      source: "mercadolivre",
    };
  } catch (err) {
    return { status: "nao_resolvido", reason: err instanceof Error ? err.message : "Erro de conexão com o Mercado Livre" };
  }
}

/**
 * Importa uma lista de links de favoritos (Shopee ou Mercado Livre) como aprovações ponderadas (peso 2.5).
 * Se createOffers for true, também insere cada produto como oferta pendente na fila do painel!
 */
export async function importBrotherFavorites(
  urls: string[],
  createOffers: boolean = false,
  cookie?: string
): Promise<ImportFavoritesSummary> {
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
  const candidatesToSave: CandidateRawItem[] = [];

  // Resolução rápida com concorrência de 5 requisições paralelas
  const resolvedItems = await mapWithConcurrency(cleanUrls, 5, async (trimmed) => {
    let resolved: Partial<ImportFavoriteResult> = {
      status: "nao_resolvido",
      reason: "URL não reconhecida como Shopee ou Mercado Livre.",
    };

    if (trimmed.includes("shopee.com") || trimmed.includes("shp.ee")) {
      resolved = await resolveShopeeUrl(trimmed);
    } else if (trimmed.includes("mercadolivre.com") || trimmed.includes("produto.mercadolivre.com")) {
      resolved = await resolveMercadoLivreUrl(trimmed, cookie);
    }

    return { url: trimmed, resolved };
  });

  const results: ImportFavoriteResult[] = [];
  let importedCount = 0;
  let unresolvedCount = 0;

  for (const { url: trimmed, resolved } of resolvedItems) {
    if (resolved.status === "importado" && resolved.title && typeof resolved.price === "number") {
      const externalId = resolved.externalId || `seed_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const offerId = `${resolved.source || "seed"}:${externalId}`;

      await recordOfferFeedback({
        offerId,
        externalId,
        action: "aprovar",
        customBrand: resolved.brand,
        metadata: {
          source: "seed_favoritos_irmao",
          originalSource: resolved.source,
          url: trimmed,
        },
        offerData: {
          id: offerId,
          externalId,
          title: resolved.title,
          price: resolved.price,
          brand: resolved.brand,
          searchTerm: resolved.category || "⭐ Favorito do Usuário",
          source: resolved.source || "mercadolivre",
          originalUrl: trimmed,
        },
      });

      if (createOffers) {
        candidatesToSave.push({
          externalId,
          title: resolved.title,
          thumbnail: resolved.thumbnail || null,
          price: resolved.price,
          originalPrice: resolved.originalPrice || resolved.price,
          currency: "BRL",
          originalUrl: trimmed,
          freeShipping: resolved.freeShipping ?? true,
          categoryName: "⭐ Favorito do Usuário",
          condition: "new",
          source: resolved.source || "mercadolivre",
        });
      }

      importedCount++;
      results.push({
        url: trimmed,
        status: "importado",
        title: resolved.title,
        price: resolved.price,
        originalPrice: resolved.originalPrice,
        thumbnail: resolved.thumbnail,
        freeShipping: resolved.freeShipping,
        brand: resolved.brand,
        category: resolved.category,
        source: resolved.source,
      });
      console.log(`[favorites-importer] Favorito importado com sucesso: "${resolved.title}" (R$ ${resolved.price.toFixed(2)})`);
    } else {
      unresolvedCount++;
      results.push({
        url: trimmed,
        status: "nao_resolvido",
        reason: resolved.reason || "Metadados não resolvidos.",
      });
      console.warn(`[favorites-importer] Link não resolvido ("${trimmed}"): ${resolved.reason}`);
    }
  }

  let offersSaved = 0;
  if (createOffers && candidatesToSave.length > 0) {
    try {
      const saveResult = await saveApprovedOffers(candidatesToSave);
      offersSaved = saveResult.added + saveResult.updated;
      console.log(`[favorites-importer] ${saveResult.added} nova(s) oferta(s) inserida(s) no painel, ${saveResult.updated} atualizada(s)!`);
    } catch (saveErr) {
      console.error("[favorites-importer] Erro ao salvar ofertas no banco:", saveErr);
    }
  }

  return {
    total: urls.length,
    imported: importedCount,
    unresolved: unresolvedCount,
    offersSaved,
    results,
  };
}

/**
 * Extrai e importa automaticamente toda a lista de favoritos da conta do Mercado Livre
 * utilizando os cookies salvos no Session Vault Server-Side ou fornecidos diretamente.
 * Se createOffers for true (padrão), também gera os cards reais na fila de ofertas!
 */
export async function syncMercadoLivreBookmarksFromSession(
  customCookie?: string,
  createOffers: boolean = true
): Promise<ImportFavoritesSummary> {
  let cookieToUse = customCookie;
  if (!cookieToUse) {
    const session = await loadDecryptedSession("mercadolivre");
    cookieToUse = session?.rawCookie;
  }

  if (!cookieToUse || !cookieToUse.trim()) {
    throw new Error("Nenhuma sessão ou cookie do Mercado Livre encontrado no cofre.");
  }

  const res = await fetch("https://myaccount.mercadolivre.com.br/bookmarks/list", {
    headers: {
      "cookie": cookieToUse,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Falha ao acessar lista de favoritos do Mercado Livre (HTTP ${res.status}). A sessão pode ter expirado.`);
  }

  const html = await res.text();
  const links = Array.from(
    html.matchAll(/href="(https:\/\/www\.mercadolivre\.com\.br\/[^"']*\/p\/MLB\d+[^"']*)"/gi)
  ).map((m) => m[1].replace(/&amp;/g, "&").split("?")[0]);

  const firstLinkIdx = html.indexOf("/p/MLB");
  const cardSnippet = firstLinkIdx !== -1 ? html.substring(Math.max(0, firstLinkIdx - 300), firstLinkIdx + 2000) : "";

  // Extrai itens diretamente do HTML da página de favoritos (sem bloqueio de bot e instantâneo!)
  const parsedDirectly: CandidateRawItem[] = [];

  // Encontra todas as âncoras de título de produto (classe poly-component__title)
  const titleRegex = /<a[^>]+href="(https:\/\/www\.mercadolivre\.com\.br\/[^\s"'<>]*\/p\/(MLB\d+)[^"']*)"[^>]*class="[^"]*poly-component__title[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = titleRegex.exec(html)) !== null) {
    const rawUrl = match[1].replace(/&amp;/g, "&").split("?")[0];
    const externalId = match[2];
    const title = match[3].replace(/<[^>]+>/g, "").trim();
    const matchIndex = match.index;

    // Busca o bloco logo após o título (até 1200 caracteres à frente) para extrair preços
    const forwardHtml = html.substring(matchIndex, matchIndex + 1200);

    // Preço Atual
    let price = 0;
    const currentAria = forwardHtml.match(/aria-label="Agora:\s*([\d.]+)\s*reais(?:\s*com\s*(\d+)\s*centavos)?"/i);
    if (currentAria?.[1]) {
      price = Number.parseFloat(currentAria[1].replace(/\./g, "")) + (currentAria[2] ? Number.parseInt(currentAria[2], 10) / 100 : 0);
    } else {
      const fracMatch = forwardHtml.match(/class="[^"]*andes-money-amount__fraction[^"]*"[^>]*>([\d.]+)<\/span>/i);
      const centsMatch = forwardHtml.match(/class="[^"]*andes-money-amount__cents[^"]*"[^>]*>(\d+)<\/span>/i);
      if (fracMatch?.[1]) {
        price = Number.parseFloat(fracMatch[1].replace(/\./g, "")) + (centsMatch?.[1] ? Number.parseInt(centsMatch[1], 10) / 100 : 0);
      }
    }

    // Preço Anterior / Original
    let originalPrice: number | null = null;
    const origAria = forwardHtml.match(/aria-label="Antes:\s*([\d.]+)\s*reais(?:\s*com\s*(\d+)\s*centavos)?"/i);
    if (origAria?.[1]) {
      originalPrice = Number.parseFloat(origAria[1].replace(/\./g, "")) + (origAria[2] ? Number.parseInt(origAria[2], 10) / 100 : 0);
    }

    // Imagem (busca até 800 caracteres antes da âncora do título)
    const backwardHtml = html.substring(Math.max(0, matchIndex - 800), matchIndex);
    const imgMatch =
      backwardHtml.match(/(?:data-src|src)="([^"]*(?:mlstatic\.com|http2\.mlstatic\.com)[^"]+)"/i) ||
      forwardHtml.match(/(?:data-src|src)="([^"]*(?:mlstatic\.com|http2\.mlstatic\.com)[^"]+)"/i);
    const thumbnail = imgMatch?.[1] || null;

    if (title && price > 0) {
      parsedDirectly.push({
        externalId,
        title,
        thumbnail,
        price,
        originalPrice: originalPrice && originalPrice > price ? originalPrice : price,
        currency: "BRL",
        originalUrl: rawUrl,
        freeShipping: true,
        categoryName: "⭐ Favorito do Usuário",
        condition: "new",
        source: "mercadolivre",
      });
    }
  }

  // Se conseguimos extrair diretamente da página de favoritos (sem bloqueio de bot!)
  if (parsedDirectly.length > 0) {
    console.log(`[syncMercadoLivreBookmarks] Extraídos ${parsedDirectly.length} itens DIRETAMENTE da página de favoritos!`);
    let offersSaved = 0;
    if (createOffers) {
      const saveResult = await saveApprovedOffers(parsedDirectly);
      offersSaved = saveResult.added + saveResult.updated;
    }

    // Grava feedbacks para o cérebro
    for (const p of parsedDirectly) {
      const offerId = `mercadolivre:${p.externalId}`;
      const brand = extractBrand(p.title);
      await recordOfferFeedback({
        offerId,
        externalId: p.externalId,
        action: "aprovar",
        customBrand: brand,
        metadata: {
          source: "seed_favoritos_irmao",
          originalSource: "mercadolivre",
          url: p.originalUrl,
        },
        offerData: {
          id: offerId,
          externalId: p.externalId,
          title: p.title,
          price: p.price,
          brand,
          searchTerm: "⭐ Favorito do Usuário",
          source: "mercadolivre",
          originalUrl: p.originalUrl,
        },
      });
    }

    return {
      total: parsedDirectly.length,
      imported: parsedDirectly.length,
      unresolved: 0,
      offersSaved,
      results: parsedDirectly.map((p) => ({
        url: p.originalUrl,
        status: "importado" as const,
        title: p.title,
        price: p.price,
        thumbnail: p.thumbnail,
        category: "⭐ Favorito do Usuário",
        source: "mercadolivre",
      })),
      debugSnippet: cardSnippet,
    } as ImportFavoritesSummary & { debugSnippet?: string };
  }

  const uniqueLinks = [...new Set(links)];
  if (uniqueLinks.length === 0) {
    return {
      total: 0,
      imported: 0,
      unresolved: 0,
      offersSaved: 0,
      results: [],
    };
  }

  const fallbackRes = await importBrotherFavorites(uniqueLinks, createOffers, cookieToUse);
  return {
    ...fallbackRes,
    debugSnippet: cardSnippet,
  };
}

export interface SyncShopeeBookmarksOptions {
  customCookie?: string;
  urls?: string[];
  createOffers?: boolean;
}

/**
 * Extrai e importa automaticamente toda a lista de favoritos (itens curtidos) da conta da Shopee
 * utilizando os cookies salvos no Session Vault Server-Side ou fornecidos diretamente.
 * Também aceita uma lista de URLs diretas de produtos favoritos da Shopee.
 * As ofertas entram na fila em status 'pendente' com source 'shopee' e treinam o cérebro!
 */
export async function syncShopeeBookmarksFromSession(
  optionsOrCookie?: string | SyncShopeeBookmarksOptions,
  createOffersParam: boolean = true
): Promise<ImportFavoritesSummary> {
  let customCookie: string | undefined;
  let inputUrls: string[] = [];
  let createOffers = createOffersParam;

  if (typeof optionsOrCookie === "string") {
    customCookie = optionsOrCookie;
  } else if (optionsOrCookie && typeof optionsOrCookie === "object") {
    customCookie = optionsOrCookie.customCookie;
    inputUrls = optionsOrCookie.urls || [];
    createOffers = optionsOrCookie.createOffers ?? true;
  }

  let cookieToUse = customCookie?.trim();
  if (!cookieToUse) {
    const session = await loadDecryptedSession("shopee");
    cookieToUse = session?.rawCookie?.trim();
  }

  interface ShopeeRawItem {
    itemId: string;
    shopId?: string;
    title?: string;
    price?: number;
    originalPrice?: number | null;
    image?: string;
    productUrl?: string;
  }

  const collectedItems: ShopeeRawItem[] = [];

  // 1. Coleta itens a partir dos cookies de sessão (API de itens curtidos da Shopee Web)
  if (cookieToUse) {
    try {
      const likedUrl = "https://shopee.com.br/api/v4/pages/get_liked_items?limit=50&offset=0";
      const res = await fetch(likedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Cookie": cookieToUse,
          "x-api-source": "rweb",
          "x-shopee-language": "pt-BR",
          "Referer": "https://shopee.com.br/buyer/likes",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const json = await res.json().catch(() => null);
        const rawItems = json?.data?.items || json?.items || json?.data?.liked_items || [];
        if (Array.isArray(rawItems) && rawItems.length > 0) {
          for (const item of rawItems) {
            const rawId = item.itemid || item.itemId || item.id;
            if (!rawId) continue;
            const itemId = String(rawId);
            const shopId = item.shopid ? String(item.shopid) : undefined;
            const title = item.name || item.product_name || item.title || "";
            const rawPrice = Number(item.price);
            const price = rawPrice > 10000 ? rawPrice / 100000 : rawPrice;
            const rawOrig = Number(item.price_before_discount || item.priceBeforeDiscount || 0);
            const originalPrice = rawOrig > 10000 ? rawOrig / 100000 : rawOrig > 0 ? rawOrig : null;
            let image = item.image || item.imageUrl || null;
            if (image && typeof image === "string" && !image.startsWith("http")) {
              image = `https://down-br.img.susercontent.com/file/${image}`;
            }

            collectedItems.push({
              itemId,
              shopId,
              title,
              price: price > 0 ? price : undefined,
              originalPrice,
              image: image || undefined,
              productUrl: shopId ? `https://shopee.com.br/product/${shopId}/${itemId}` : undefined,
            });
          }
          console.log(`[syncShopeeBookmarks] Extraídos ${collectedItems.length} itens favoritados via API get_liked_items da Shopee!`);
        }
      }
    } catch (fetchErr) {
      console.warn("[syncShopeeBookmarks] Aviso ao consultar get_liked_items da Shopee:", fetchErr);
    }
  }

  // 2. Coleta itens a partir das URLs manuais fornecidas
  if (inputUrls.length > 0) {
    for (const url of inputUrls) {
      const trimmed = url.trim();
      if (!trimmed) continue;
      const expanded = await expandShopeeUrl(trimmed);
      const { itemId, shopId } = extractShopeeIds(expanded);
      if (itemId) {
        // Evita duplicatas se já foi coletado pelo cookie
        if (!collectedItems.some((ci) => ci.itemId === itemId)) {
          collectedItems.push({
            itemId,
            shopId: shopId || undefined,
            productUrl: expanded,
          });
        }
      }
    }
  }

  if (collectedItems.length === 0) {
    if (!cookieToUse && inputUrls.length === 0) {
      throw new Error(
        "Nenhuma sessão ou cookie da Shopee encontrado no cofre. Cole o cookie de sessão da Shopee ou uma lista de links para puxar os favoritos."
      );
    }
    return {
      total: 0,
      imported: 0,
      unresolved: 0,
      offersSaved: 0,
      results: [],
    };
  }

  // 3. Resolve metadados completos de cada item (priorizando Open API oficial para comissões e links oficiais)
  const candidatesToSave: CandidateRawItem[] = [];
  const results: ImportFavoriteResult[] = [];
  let importedCount = 0;
  let unresolvedCount = 0;

  const resolvedShopeeItems = await mapWithConcurrency(collectedItems, 5, async (item) => {
    const numericId = Number.parseInt(item.itemId, 10);
    const productUrl =
      item.productUrl ||
      (item.shopId ? `https://shopee.com.br/product/${item.shopId}/${item.itemId}` : `https://shopee.com.br/product/0/${item.itemId}`);

    // Tenta primeiro via GraphQL Open API oficial
    if (numericId && isShopeeConfigured()) {
      try {
        const query = `
          query ResolveShopeeItem($itemId: Int64) {
            productOfferV2(itemId: $itemId) {
              nodes {
                itemId
                productName
                price
                priceDiscountRate
                imageUrl
                shopName
                offerLink
                ratingStar
                sales
              }
            }
          }
        `;
        const res = await executeShopeeGraphQL<ShopeeProductOfferV2Response>(query, { itemId: numericId }, 6000);
        const node = res.data?.productOfferV2?.nodes?.[0];
        if (node && node.productName && node.price) {
          const currentPrice = Number.parseFloat(node.price);
          const discountRate = node.priceDiscountRate ? Number(node.priceDiscountRate) : 0;
          const originalPrice = discountRate > 0 ? currentPrice / (1 - discountRate / 100) : null;
          const rating = node.ratingStar ? Number.parseFloat(node.ratingStar) : null;
          const sales = typeof node.sales === "number" ? node.sales : null;

          return {
            status: "importado" as const,
            itemId: item.itemId,
            title: node.productName,
            price: currentPrice,
            originalPrice,
            thumbnail: node.imageUrl || item.image || null,
            affiliateUrl: node.offerLink || null,
            originalUrl: productUrl,
            brand: extractBrand(node.productName),
            rating: rating && !Number.isNaN(rating) ? rating : null,
            salesVolume: sales,
          };
        }
      } catch {
        // Fallback para dados locais do item
      }
    }

    // Fallback: se os dados já vieram da lista de likes da Shopee
    if (item.title && item.price && item.price > 0) {
      let shortUrl: string | null = null;
      try {
        const directShort = await generateShopeeShortLink(productUrl);
        shortUrl = directShort.shortUrl || null;
      } catch {
        // sem encurtador
      }

      return {
        status: "importado" as const,
        itemId: item.itemId,
        title: item.title,
        price: item.price,
        originalPrice: item.originalPrice || null,
        thumbnail: item.image || null,
        affiliateUrl: shortUrl || productUrl,
        originalUrl: productUrl,
        brand: extractBrand(item.title),
        rating: null,
        salesVolume: null,
      };
    }

    return {
      status: "nao_resolvido" as const,
      itemId: item.itemId,
      originalUrl: productUrl,
      reason: "Não foi possível recuperar os dados de preço e título do produto na Shopee.",
    };
  });

  // 4. Salva itens aprovados na fila como 'pendente' e grava aprendizado para o cérebro
  for (const resolved of resolvedShopeeItems) {
    if (resolved.status === "importado" && resolved.title && resolved.price) {
      const externalId = resolved.itemId;
      const offerId = `shopee:${externalId}`;

      await recordOfferFeedback({
        offerId,
        externalId,
        action: "aprovar",
        customBrand: resolved.brand,
        metadata: {
          source: "seed_favoritos_irmao",
          originalSource: "shopee",
          url: resolved.originalUrl,
        },
        offerData: {
          id: offerId,
          externalId,
          title: resolved.title,
          price: resolved.price,
          brand: resolved.brand,
          searchTerm: "⭐ Favorito Shopee",
          source: "shopee",
          originalUrl: resolved.originalUrl,
        },
      });

      if (createOffers) {
        candidatesToSave.push({
          externalId,
          title: resolved.title,
          thumbnail: resolved.thumbnail || null,
          price: resolved.price,
          originalPrice: resolved.originalPrice || resolved.price,
          currency: "BRL",
          originalUrl: resolved.originalUrl,
          freeShipping: false,
          categoryName: "⭐ Favorito Shopee",
          condition: "new",
          source: "shopee",
          affiliateUrl: resolved.affiliateUrl || undefined,
          shortUrl: resolved.affiliateUrl || undefined,
          rating: resolved.rating ?? undefined,
          salesCount: resolved.salesVolume ?? undefined,
        });
      }

      importedCount++;
      results.push({
        url: resolved.originalUrl,
        status: "importado",
        title: resolved.title,
        price: resolved.price,
        originalPrice: resolved.originalPrice,
        thumbnail: resolved.thumbnail,
        brand: resolved.brand,
        category: "⭐ Favorito Shopee",
        source: "shopee",
      });
      console.log(`[syncShopeeBookmarks] Favorito Shopee importado: "${resolved.title}" (R$ ${resolved.price.toFixed(2)})`);
    } else {
      unresolvedCount++;
      results.push({
        url: resolved.originalUrl,
        status: "nao_resolvido",
        reason: resolved.reason || "Erro ao resolver item da Shopee.",
      });
    }
  }

  let offersSaved = 0;
  if (createOffers && candidatesToSave.length > 0) {
    try {
      const saveResult = await saveApprovedOffers(candidatesToSave);
      offersSaved = saveResult.added + saveResult.updated;
      console.log(`[syncShopeeBookmarks] ${saveResult.added} nova(s) oferta(s) Shopee inserida(s) no painel, ${saveResult.updated} atualizada(s)!`);
    } catch (saveErr) {
      console.error("[syncShopeeBookmarks] Erro ao salvar ofertas Shopee no banco:", saveErr);
    }
  }

  return {
    total: collectedItems.length,
    imported: importedCount,
    unresolved: unresolvedCount,
    offersSaved,
    results,
  };
}

