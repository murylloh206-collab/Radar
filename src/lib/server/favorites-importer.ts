import "server-only";

import { recordOfferFeedback } from "./feedback-service";
import { executeShopeeGraphQL, type ShopeeProductOfferV2Response } from "./shopee";
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
  results: ImportFavoriteResult[];
}

/**
 * Resolve metadados de uma URL da Shopee via Open API
 */
async function resolveShopeeUrl(url: string): Promise<Partial<ImportFavoriteResult>> {
  // Extrai o itemId numérico (ex: i.12345.67890 ou sp.12345/67890 ou -i.12345.67890)
  const match = url.match(/-i\.(\d+)\.(\d+)/) || url.match(/\/(\d+)\/(\d+)/) || url.match(/i\.(\d+)\.(\d+)/) || url.match(/itemId=(\d+)/i);
  const itemId = match ? match[2] || match[1] : null;

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
      category: "Shopee",
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
async function resolveMercadoLivreUrl(url: string): Promise<Partial<ImportFavoriteResult>> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
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
  createOffers: boolean = false
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
      resolved = await resolveMercadoLivreUrl(trimmed);
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

  return importBrotherFavorites(uniqueLinks, createOffers);
}

