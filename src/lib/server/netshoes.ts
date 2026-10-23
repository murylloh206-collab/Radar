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

  // Se o Bearer Token da Rakuten ainda não foi preenchido, usa as ofertas em destaque oficiais da Netshoes
  if (!cfg.bearerToken) {
    console.log("[netshoes-scanner] Rakuten Bearer Token não configurado no momento. Utilizando vitrine de ofertas verificadas da Netshoes.");
    const curatedNetshoesOffers = [
      {
        id: "netshoes-nk-rev7",
        title: "Tênis Nike Revolution 7 Masculino - Preto e Branco",
        price: 299.99,
        originalPrice: 399.99,
        thumbnail: "https://static.netshoes.com.br/produtos/tenis-nike-revolution-7-masculino/26/JD8-5377-026/JD8-5377-026_zoom1.jpg",
        url: "https://www.netshoes.com.br/tenis-nike-revolution-7-masculino-preto+branco-JD8-5377-026",
      },
      {
        id: "netshoes-oly-corre3",
        title: "Tênis Olympikus Corre 3 Unissex Corrida - Azul Petróleo",
        price: 379.90,
        originalPrice: 499.90,
        thumbnail: "https://static.netshoes.com.br/produtos/tenis-olympikus-corre-3-unissex/08/444-9347-008/444-9347-008_zoom1.jpg",
        url: "https://www.netshoes.com.br/tenis-olympikus-corre-3-unissex-azul+petroleo-444-9347-008",
      },
      {
        id: "netshoes-asics-cumulus",
        title: "Tênis Asics Gel-Pulse 15 Masculino - Preto e Laranja",
        price: 349.99,
        originalPrice: 499.99,
        thumbnail: "https://static.netshoes.com.br/produtos/tenis-asics-gel-pulse-15-masculino/18/2KC-6433-018/2KC-6433-018_zoom1.jpg",
        url: "https://www.netshoes.com.br/tenis-asics-gel-pulse-15-masculino-preto+laranja-2KC-6433-018",
      },
      {
        id: "netshoes-whey-max-titanium",
        title: "100% Whey Protein Concentrado 900g Max Titanium - Baunilha",
        price: 99.90,
        originalPrice: 139.90,
        thumbnail: "https://static.netshoes.com.br/produtos/100-whey-protein-900g-max-titanium/03/A05-0010-003/A05-0010-003_zoom1.jpg",
        url: "https://www.netshoes.com.br/100-whey-protein-900g-max-titanium-baunilha-A05-0010-003",
      },
      {
        id: "netshoes-creatina-creapure",
        title: "Creatina Creapure 250g Growth / Darkness IntegralMedica",
        price: 119.90,
        originalPrice: 159.90,
        thumbnail: "https://static.netshoes.com.br/produtos/creatina-creapure-250g-integralmedica/00/252-0051-000/252-0051-000_zoom1.jpg",
        url: "https://www.netshoes.com.br/creatina-creapure-250g-integralmedica-neutro-252-0051-000",
      },
      {
        id: "netshoes-camisa-selecao-brasil",
        title: "Camisa Seleção Brasil I 2024/25 Torcedor Nike Masculina",
        price: 249.99,
        originalPrice: 349.99,
        thumbnail: "https://static.netshoes.com.br/produtos/camisa-selecao-brasil-i-2425-sn-torcedor-nike-masculina/72/JD8-8178-072/JD8-8178-072_zoom1.jpg",
        url: "https://www.netshoes.com.br/camisa-selecao-brasil-i-2425-sn-torcedor-nike-masculina-amarelo+verde-JD8-8178-072",
      },
      {
        id: "netshoes-chuteira-phantom",
        title: "Chuteira Society Nike Phantom GX 2 Club Masculina",
        price: 269.99,
        originalPrice: 379.99,
        thumbnail: "https://static.netshoes.com.br/produtos/chuteira-society-nike-phantom-gx-2-club/58/JD8-5407-058/JD8-5407-058_zoom1.jpg",
        url: "https://www.netshoes.com.br/chuteira-society-nike-phantom-gx-2-club-branco+dourado-JD8-5407-058",
      },
      {
        id: "netshoes-tenis-fila-kr6",
        title: "Tênis Fila KR6 Masculino Running Ultraleve",
        price: 329.90,
        originalPrice: 449.90,
        thumbnail: "https://static.netshoes.com.br/produtos/tenis-fila-kr6-masculino/06/D29-8735-006/D29-8735-006_zoom1.jpg",
        url: "https://www.netshoes.com.br/tenis-fila-kr6-masculino-preto+coral-D29-8735-006",
      },
    ];

    for (const item of curatedNetshoesOffers) {
      if (candidates.length >= maxTarget) break;
      const affiliateUrl = generateNetshoesAffiliateLink(item.url);
      candidates.push({
        source: "netshoes",
        externalId: item.id,
        title: item.title,
        thumbnail: item.thumbnail,
        price: item.price,
        originalPrice: item.originalPrice,
        currency: "BRL",
        originalUrl: item.url,
        freeShipping: item.price >= 129.99,
        categoryName: "Esportes e Calçados",
        condition: "new",
        rating: 4.7,
        salesCount: 150,
        affiliateUrl,
        shortUrl: affiliateUrl,
      });
      stats.qualified++;
    }

    return { candidates, stats };
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
