import "server-only";

import { recordOfferFeedback } from "./feedback-service";
import { executeShopeeGraphQL, type ShopeeProductOfferV2Response } from "./shopee";
import { extractBrand } from "./recommendation-engine";

export interface ImportFavoriteResult {
  url: string;
  status: "importado" | "nao_resolvido";
  title?: string;
  price?: number;
  brand?: string;
  category?: string;
  source?: "shopee" | "mercadolivre";
  reason?: string;
}

export interface ImportFavoritesSummary {
  total: number;
  imported: number;
  unresolved: number;
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

    return {
      status: "importado",
      title: node.productName,
      price,
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
async function resolveMercadoLivreUrl(url: string): Promise<Partial<ImportFavoriteResult>> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      return { status: "nao_resolvido", reason: `HTTP ${res.status} ao carregar página do Mercado Livre.` };
    }

    const html = await res.text();

    // Extrai título da tag <title> ou meta og:title
    const titleMatch =
      html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
      html.match(/<title>([^<]+)<\/title>/i);
    const rawTitle = titleMatch?.[1]?.replace(/\s*\|\s*Mercado\s*Livre.*$/i, "").trim();

    if (!rawTitle) {
      return { status: "nao_resolvido", reason: "Não foi possível extrair o título do anúncio do Mercado Livre." };
    }

    // Extrai preço numérico
    const priceMatch =
      html.match(/class="[^"]*ui-pdp-price__second-line[^"]*"[\s\S]*?class="andes-money-amount__fraction"[^>]*>([\d.]+)<\/span>/i) ||
      html.match(/itemprop="price"\s+content="([\d.]+)"/i) ||
      html.match(/"price"\s*:\s*([\d.]+)/i);

    let price = 0;
    if (priceMatch?.[1]) {
      price = Number.parseFloat(priceMatch[1].replace(/\./g, "").replace(",", "."));
    }

    if (!price || price <= 0) {
      return { status: "nao_resolvido", reason: "Não foi possível identificar o preço atual na página do Mercado Livre." };
    }

    const brand = extractBrand(rawTitle);

    return {
      status: "importado",
      title: rawTitle,
      price,
      brand,
      category: "Mercado Livre",
      source: "mercadolivre",
    };
  } catch (err) {
    return { status: "nao_resolvido", reason: err instanceof Error ? err.message : "Erro de conexão com o Mercado Livre" };
  }
}

/**
 * Importa uma lista de links de favoritos (Shopee ou Mercado Livre) como aprovações ponderadas (peso 2.5).
 * Se não conseguir resolver metadados reais, registra como "não resolvido" em vez de inventar dados.
 */
export async function importBrotherFavorites(urls: string[]): Promise<ImportFavoritesSummary> {
  const results: ImportFavoriteResult[] = [];
  let importedCount = 0;
  let unresolvedCount = 0;

  for (const rawUrl of urls) {
    const trimmed = rawUrl.trim();
    if (!trimmed) continue;

    let resolved: Partial<ImportFavoriteResult> = { status: "nao_resolvido", reason: "URL não reconhecida como Shopee ou Mercado Livre." };

    if (trimmed.includes("shopee.com") || trimmed.includes("shp.ee")) {
      resolved = await resolveShopeeUrl(trimmed);
    } else if (trimmed.includes("mercadolivre.com") || trimmed.includes("produto.mercadolivre.com")) {
      resolved = await resolveMercadoLivreUrl(trimmed);
    }

    if (resolved.status === "importado" && resolved.title && typeof resolved.price === "number") {
      const externalId = `seed_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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
          searchTerm: resolved.category || "Favoritos Irmão",
          source: resolved.source || "shopee",
          originalUrl: trimmed,
        },
      });

      importedCount++;
      results.push({
        url: trimmed,
        status: "importado",
        title: resolved.title,
        price: resolved.price,
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

  return {
    total: urls.length,
    imported: importedCount,
    unresolved: unresolvedCount,
    results,
  };
}
