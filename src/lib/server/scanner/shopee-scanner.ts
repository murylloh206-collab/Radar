import "server-only";

import { executeShopeeGraphQL, type ShopeeProductOfferV2Response, type ShopeeProductNode } from "../shopee";
import { isShopeeConfigured } from "../config";
import { extractBrand, normalizeText, type CategoryPriceRange } from "../recommendation-engine";
import { checkBlacklist } from "./validator";
import type { CandidateRawItem } from "./validator";
import type { LearnedPreferences, OfferFeedback } from "@/lib/types";

export interface ShopeeScannerConfig {
  minSales: number; // default: 100
  minRating: number; // default: 4.5
  minDiscountRate: number; // default: 20%
  maxCandidatesTarget: number; // default: 15
}

export interface ShopeeScannerStats {
  totalScanned: number;
  qualified: number;
  rejectedSales: number;
  rejectedRating: number;
  rejectedDiscount: number;
  rejectedPrice: number;
  rejectedBlacklist: number;
  rejectedBlockedBrandOrSeller: number;
  categoriesQueried: number[];
}

export const SHOPEE_PRIORITY_CATEGORIES = [
  { id: 100001, name: "Saúde e Suplementação" },
  { id: 100636, name: "Casa, Ferramentas e Cozinha" },
  { id: 100535, name: "Áudio e Eletrônicos" },
  { id: 100637, name: "Esportes e Academia" },
  { id: 100630, name: "Beleza e Cuidados Pessoais" },
  { id: 100009, name: "Acessórios e Moda" },
];

export async function runShopeeCategoryScan(options: {
  preferences: LearnedPreferences;
  feedbacks: OfferFeedback[];
  priceRangeByCat?: (category: string) => CategoryPriceRange;
  maxPendingQuota?: number;
}): Promise<{
  candidates: CandidateRawItem[];
  stats: ShopeeScannerStats;
}> {
  const stats: ShopeeScannerStats = {
    totalScanned: 0,
    qualified: 0,
    rejectedSales: 0,
    rejectedRating: 0,
    rejectedDiscount: 0,
    rejectedPrice: 0,
    rejectedBlacklist: 0,
    rejectedBlockedBrandOrSeller: 0,
    categoriesQueried: [],
  };

  if (!isShopeeConfigured()) {
    console.warn("[shopee-scanner] Shopee Open API não configurada.");
    return { candidates: [], stats };
  }

  const blockedBrandsSet = new Set((options.preferences.blockedBrands || []).map((b) => normalizeText(b)));
  const blockedSellersSet = new Set((options.preferences.blockedSellers || []).map((s) => normalizeText(s)));
  const blockedCategoriesSet = new Set((options.preferences.blockedCategories || []).map((c) => normalizeText(c)));
  const blockedKeywords = (options.preferences.blockedKeywords || []).map((k) => normalizeText(k)).filter(Boolean);

  const maxTarget = options.maxPendingQuota ?? 15;
  const candidates: CandidateRawItem[] = [];

  // Rotação dinâmica por productCatId a cada ciclo
  const rotationIndex = Math.floor(Date.now() / (30 * 60 * 1000)) % SHOPEE_PRIORITY_CATEGORIES.length;
  // Embaralha para cobrir até 3 categorias por ciclo de 30 min
  const activeCategories = [
    SHOPEE_PRIORITY_CATEGORIES[rotationIndex],
    SHOPEE_PRIORITY_CATEGORIES[(rotationIndex + 1) % SHOPEE_PRIORITY_CATEGORIES.length],
    SHOPEE_PRIORITY_CATEGORIES[(rotationIndex + 2) % SHOPEE_PRIORITY_CATEGORIES.length],
  ];

  const query = `
    query AutonomousShopeeScan($productCatId: Int, $page: Int, $limit: Int) {
      productOfferV2(productCatId: $productCatId, page: $page, limit: $limit, sortType: 2) {
        nodes {
          itemId
          productName
          price
          priceMin
          priceMax
          priceDiscountRate
          imageUrl
          shopName
          shopId
          shopType
          productLink
          offerLink
          commissionRate
          commission
          ratingStar
          sales
        }
      }
    }
  `;

  for (const cat of activeCategories) {
    if (candidates.length >= maxTarget) break;

    const normCat = normalizeText(cat.name);
    if (blockedCategoriesSet.has(normCat)) {
      console.log(`[shopee-scanner] Categoria bloqueada ignorada: "${cat.name}"`);
      continue;
    }

    stats.categoriesQueried.push(cat.id);
    console.log(`[shopee-scanner] Escaneando Shopee Categoria: ${cat.name} (productCatId: ${cat.id}, sortType: 2 Top Sales)...`);

    try {
      const res = await executeShopeeGraphQL<ShopeeProductOfferV2Response>(
        query,
        {
          productCatId: cat.id,
          page: 1,
          limit: 30,
        },
        7000
      );

      const nodes = res.data?.productOfferV2?.nodes || [];
      stats.totalScanned += nodes.length;

      for (const node of nodes) {
        if (candidates.length >= maxTarget) break;

        const title = node.productName?.trim() || "";
        const price = Number.parseFloat(node.price || "0");
        const sales = typeof node.sales === "number" ? node.sales : 0;
        const rating = node.ratingStar ? Number.parseFloat(node.ratingStar) : 0;
        const discountRate = node.priceDiscountRate || 0;
        const sellerName = node.shopName || "";
        const brand = extractBrand(title);

        // 1. Filtro estrito: Vendas >= 100
        if (sales < 100) {
          stats.rejectedSales++;
          continue;
        }

        // 2. Filtro estrito: Avaliação >= 4.5
        if (Number.isNaN(rating) || rating < 4.5) {
          stats.rejectedRating++;
          continue;
        }

        // 3. Filtro estrito: Desconto >= 20%
        if (discountRate < 20) {
          stats.rejectedDiscount++;
          continue;
        }

        // 4. Bloqueios aprendidos (Vendedor, Marca, Palavras-chave)
        const sellerNorm = normalizeText(sellerName);
        const brandNorm = normalizeText(brand);
        const titleNorm = normalizeText(title);

        if (blockedSellersSet.has(sellerNorm) || blockedBrandsSet.has(brandNorm)) {
          stats.rejectedBlockedBrandOrSeller++;
          continue;
        }

        let hasBlockedWord = false;
        for (const kw of blockedKeywords) {
          if (titleNorm.includes(kw)) {
            hasBlockedWord = true;
            break;
          }
        }
        if (hasBlockedWord) {
          stats.rejectedBlockedBrandOrSeller++;
          continue;
        }

        // 5. Blacklist de Miudezas / Acessórios baratos
        const blacklisted = checkBlacklist(title);
        if (blacklisted) {
          stats.rejectedBlacklist++;
          continue;
        }

        // 6. Faixa de Preço por Categoria (Piso e Teto)
        const catPriceRange = options.priceRangeByCat ? options.priceRangeByCat(cat.name) : { minPrice: 80, maxPrice: 450 };
        if (price < catPriceRange.minPrice || price > catPriceRange.maxPrice) {
          stats.rejectedPrice++;
          continue;
        }

        // Produto rigorosamente qualificado
        const priceMax = Number.parseFloat(node.priceMax || "0");
        const originalPrice = priceMax > price ? priceMax : Math.round((price / (1 - discountRate / 100)) * 100) / 100;
        const officialOfferLink = node.offerLink?.trim() || node.productLink;

        candidates.push({
          source: "shopee",
          externalId: String(node.itemId),
          title,
          thumbnail: node.imageUrl || null,
          price,
          originalPrice,
          currency: "BRL",
          originalUrl: node.productLink,
          freeShipping: false,
          categoryName: cat.name,
          condition: "new",
          rating,
          reviewsCount: null,
          salesCount: sales,
          affiliateUrl: officialOfferLink,
          shortUrl: officialOfferLink,
        });

        stats.qualified++;
      }
    } catch (err) {
      console.warn(`[shopee-scanner] Falha na categoria ${cat.name}:`, err);
    }
  }

  console.log(`[shopee-scanner] Varredura concluída: ${candidates.length} produtos Shopee qualificados (máx ${maxTarget}).`);
  console.log(`   - Descartados por vendas < 100: ${stats.rejectedSales}`);
  console.log(`   - Descartados por nota < 4.5: ${stats.rejectedRating}`);
  console.log(`   - Descartados por desconto < 20%: ${stats.rejectedDiscount}`);
  console.log(`   - Descartados por preço fora da faixa: ${stats.rejectedPrice}`);
  console.log(`   - Descartados por blacklist: ${stats.rejectedBlacklist}`);

  return { candidates, stats };
}
