import "server-only";

import { buildAffiliateUrl, detectCoupon } from "../affiliate";
import { discoverCategoryOffers } from "../category-discovery";
import { config, isMercadoLivreConfigured } from "../config";
import { generateMeliShortLinkDetailed } from "../meli-shortener";
import {
  hasActiveMLConnection,
  revalidateMLItem,
  searchProducts,
  type MLProduct,
} from "../mercadolivre";
import { getMockProducts } from "../mock-products";
import type {
  MarketplaceProvider,
  NormalizedCandidateProduct,
  ProviderCapabilities,
  ShortenLinkResult,
} from "./provider-interface";

export class MercadoLivreProvider implements MarketplaceProvider {
  readonly source = "mercadolivre" as const;
  readonly name = "Mercado Livre";

  readonly capabilities: ProviderCapabilities = {
    supportsOfficialApi: true,
    supportsRealSalesVolume: false, // ML Search API não expõe sold_quantity oficial sem OAuth de vendedor
    supportsRealRatings: true,
    supportsReviewsCount: true,
    supportsOfficialAffiliateShortening: true, // via meli.la
    supportsSellerReputation: true,
    supportsStockVerification: true,
    supportsCouponsDetection: true,
  };

  isConfigured(): boolean {
    return isMercadoLivreConfigured();
  }

  async hasActiveConnection(): Promise<boolean> {
    return hasActiveMLConnection();
  }

  private normalizeProduct(
    product: MLProduct,
    term: string,
    categoryName?: string
  ): NormalizedCandidateProduct {
    const couponInfo = detectCoupon({
      title: product.title,
      price: product.price,
      originalPrice: product.originalPrice,
      searchTerm: term,
    });

    return {
      source: "mercadolivre",
      externalId: product.externalId,
      title: product.title,
      thumbnail: product.thumbnail,
      price: product.price,
      originalPrice: product.originalPrice,
      currency: product.currency || "BRL",
      originalUrl: product.originalUrl,
      freeShipping: Boolean(product.freeShipping),
      isInStock: true,
      rating: product.rating ?? null,
      reviewsCount: product.reviewsCount ?? null,
      salesVolume: null, // Dado indisponível na API de busca pública do ML
      sellerReputation: product.sellerReputation ?? null,
      coupon: couponInfo.coupon,
      couponDescription: couponInfo.description,
      affiliateUrl: this.buildAffiliateUrl(product.originalUrl),
      shortUrl: null,
      searchTerm: term,
      capturedAt: new Date().toISOString(),
      categoryName,
      categoryId: product.categoryId ?? null,
    };
  }

  async searchProducts(query: string, limit = 12): Promise<NormalizedCandidateProduct[]> {
    const isConnected = await this.hasActiveConnection();
    let rawProducts: MLProduct[] = [];

    if (isConnected) {
      try {
        rawProducts = await searchProducts(query, limit);
      } catch (err) {
        console.warn(`[MercadoLivreProvider] Falha ao buscar "${query}", recorrendo ao catálogo:`, err);
        rawProducts = getMockProducts(query);
      }
    } else {
      rawProducts = getMockProducts(query);
    }

    return rawProducts.map((p) => this.normalizeProduct(p, query));
  }

  async discoverCategories(limitPerCategory = 10): Promise<NormalizedCandidateProduct[]> {
    const discoveries = await discoverCategoryOffers(undefined, limitPerCategory);
    const candidates: NormalizedCandidateProduct[] = [];

    for (const d of discoveries) {
      for (const p of d.products) {
        candidates.push(this.normalizeProduct(p, d.category.name, d.category.name));
      }
    }

    return candidates;
  }

  async revalidateItem(externalId: string): Promise<{
    available: boolean;
    currentPrice: number;
    originalPrice: number | null;
    title?: string;
    stockStatus?: "ativo" | "pausado" | "esgotado";
    error?: string;
  }> {
    const result = await revalidateMLItem(externalId);
    return {
      available: result.valid,
      currentPrice: result.price ?? 0,
      originalPrice: result.originalPrice ?? null,
      stockStatus: result.valid ? "ativo" : "esgotado",
      error: result.error,
    };
  }

  buildAffiliateUrl(originalUrl: string): string {
    return buildAffiliateUrl(originalUrl);
  }

  async generateShortLink(productUrl: string): Promise<ShortenLinkResult> {
    const res = await generateMeliShortLinkDetailed(productUrl);
    return {
      shortUrl: res.shortUrl,
      error: res.error,
    };
  }
}

export const mercadoLivreProvider = new MercadoLivreProvider();
