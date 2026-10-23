import "server-only";

import { config } from "./config";
import type { CandidateRawItem } from "./scanner/validator";
import { checkBlacklist } from "./scanner/validator";
import { extractBrand, normalizeText } from "./recommendation-engine";
import type { LearnedPreferences, OfferFeedback } from "@/lib/types";

export interface NetshoesConfig {
  clientId: string;
  clientSecret: string;
  bearerToken: string;
  siteId: string;
  mid: string;
}

export function getNetshoesConfig(): NetshoesConfig {
  return {
    clientId: process.env.RAKUTEN_CLIENT_ID || "nqPn5mjnNKj9DQq5argNCRujNMnImoOI",
    clientSecret: process.env.RAKUTEN_CLIENT_SECRET || "Px9X7qXedS5YhhPOO3O8lp8zI1LSvJSG",
    bearerToken: process.env.RAKUTEN_BEARER_TOKEN || "",
    siteId: process.env.RAKUTEN_SITE_ID || "",
    mid: process.env.NETSHOES_MID || "38302",
  };
}

/**
 * Gera URL oficial de afiliado da Netshoes via Deep Link da Rakuten LinkShare
 */
export function generateNetshoesAffiliateLink(originalUrl: string): string {
  const { siteId, mid } = getNetshoesConfig();
  if (!siteId) {
    return originalUrl;
  }
  const cleanUrl = originalUrl.split("?")[0];
  const encoded = encodeURIComponent(cleanUrl);
  return `https://click.linksynergy.com/deeplink?id=${siteId}&mid=${mid}&murl=${encoded}`;
}

/**
 * Busca produtos na Netshoes via Rakuten Product Search API
 */
export async function searchNetshoesApi(keyword: string, limit = 20): Promise<any[]> {
  const cfg = getNetshoesConfig();
  if (!cfg.bearerToken) {
    return [];
  }

  const endpoint = new URL("https://api.linksynergy.com/productsearch/1.0");
  endpoint.searchParams.set("keyword", keyword);
  if (cfg.mid) {
    endpoint.searchParams.set("mid", cfg.mid);
  }
  endpoint.searchParams.set("max", String(Math.min(limit, 50)));
  endpoint.searchParams.set("sort", "retailprice");
  endpoint.searchParams.set("sorttype", "asc");

  try {
    const res = await fetch(endpoint.toString(), {
      headers: {
        Authorization: `Bearer ${cfg.bearerToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[netshoes-api] HTTP ${res.status} ao buscar "${keyword}"`);
      return [];
    }

    const json = await res.json().catch(() => null);
    if (!json) return [];

    const items = json.item || json.productSearchResponse?.item || [];
    return Array.isArray(items) ? items : [items];
  } catch (err) {
    console.error(`[netshoes-api] Erro na busca "${keyword}":`, err);
    return [];
  }
}

/** Termos prioritários de alta conversão da Netshoes */
export const NETSHOES_PRIORITY_TERMS = [
  "tenis masculino corrida",
  "tenis feminino corrida",
  "tenis olympikus",
  "tenis asics",
  "tenis nike",
  "whey protein",
  "creatina 300g",
  "camisa futebol oficial",
  "chuteira society",
];

export interface NetshoesScannerStats {
  totalScanned: number;
  qualified: number;
  rejectedPrice: number;
  rejectedDiscount: number;
  rejectedBlacklist: number;
  errors: string[];
}

/**
 * Executa a varredura autônoma de ofertas da Netshoes
 */
export async function runNetshoesCategoryScan(options: {
  preferences: LearnedPreferences;
  feedbacks: OfferFeedback[];
  maxQuota?: number;
}): Promise<{
  candidates: CandidateRawItem[];
  stats: NetshoesScannerStats;
}> {
  const stats: NetshoesScannerStats = {
    totalScanned: 0,
    qualified: 0,
    rejectedPrice: 0,
    rejectedDiscount: 0,
    rejectedBlacklist: 0,
    errors: [],
  };

  const maxTarget = options.maxQuota ?? 15;
  const candidates: CandidateRawItem[] = [];
  const cfg = getNetshoesConfig();

  // Apenas busca produtos via API oficial da Rakuten em tempo real para garantir estoque ativo
  if (!cfg.bearerToken) {
    console.log("[netshoes-scanner] Rakuten Bearer Token pendente. Vagas alocadas para Mercado Livre e Shopee.");
    return { candidates: [], stats };
  }

  for (const term of NETSHOES_PRIORITY_TERMS) {
    if (candidates.length >= maxTarget) break;

    try {
      console.log(`[netshoes-scanner] Buscando na Netshoes termo: "${term}"...`);
      const items = await searchNetshoesApi(term, 25);
      stats.totalScanned += items.length;

      for (const item of items) {
        if (candidates.length >= maxTarget) break;

        const title = (item.productname || item.name || "").trim();
        const price = Number.parseFloat(item.price || item.saleprice || "0");
        const originalPrice = Number.parseFloat(item.retailprice || item.price || "0");
        const productUrl = item.linkurl || item.url || "";
        const imageUrl = item.imageurl || null;

        if (!title || price < 35) {
          stats.rejectedPrice++;
          continue;
        }

        const discount = originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;
        if (discount < 15) {
          stats.rejectedDiscount++;
          continue;
        }

        if (checkBlacklist(title)) {
          stats.rejectedBlacklist++;
          continue;
        }

        const affiliateUrl = generateNetshoesAffiliateLink(productUrl);

        candidates.push({
          source: "netshoes",
          externalId: String(item.productid || item.sku || Math.floor(Math.random() * 1000000)),
          title,
          thumbnail: imageUrl,
          price,
          originalPrice: originalPrice > price ? originalPrice : null,
          currency: "BRL",
          originalUrl: productUrl,
          freeShipping: price >= 129.99, // Netshoes frete grátis padrão
          categoryName: "Netshoes",
          condition: "new",
          rating: 4.6,
          salesCount: 50,
          affiliateUrl,
          shortUrl: affiliateUrl,
        });

        stats.qualified++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido Netshoes";
      stats.errors.push(msg);
    }
  }

  return { candidates, stats };
}
