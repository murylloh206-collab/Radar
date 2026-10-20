import "server-only";

import { isShopeeConfigured } from "../config";
import {
  searchShopeeProducts,
  generateShopeeShortLink,
  revalidateShopeeItem,
} from "../shopee";
import type {
  MarketplaceProvider,
  NormalizedCandidateProduct,
  ProviderCapabilities,
  ShortenLinkResult,
} from "./provider-interface";

/**
 * PROVEDOR OFICIAL SHOPEE (API GRAPHQL OPEN PLATFORM)
 * -------------------------------------------------------------
 * Status: Conectado e ativo via Shopee Affiliate Open API oficial.
 * - Busca ofertas ativas de afiliados (productOfferV2)
 * - Coleta avaliações reais e volume de vendas
 * - Gera links de afiliados encurtados oficiais (https://s.shopee.com.br/...)
 * - Revalidação oficial de preços e disponibilidade por itemId
 */
export class ShopeeProvider implements MarketplaceProvider {
  readonly source = "shopee" as const;
  readonly name = "Shopee";

  readonly capabilities: ProviderCapabilities = {
    supportsOfficialApi: true,
    supportsRealSalesVolume: true,
    supportsRealRatings: true,
    supportsReviewsCount: false,
    supportsOfficialAffiliateShortening: true,
    supportsSellerReputation: true,
    supportsStockVerification: true,
    supportsCouponsDetection: false,
  };

  isConfigured(): boolean {
    return isShopeeConfigured();
  }

  async hasActiveConnection(): Promise<boolean> {
    return this.isConfigured();
  }

  async searchProducts(query: string, limit = 12): Promise<NormalizedCandidateProduct[]> {
    if (!this.isConfigured()) {
      return [];
    }
    return searchShopeeProducts(query, limit);
  }

  async revalidateItem(externalId: string) {
    if (!this.isConfigured()) {
      return {
        available: false,
        currentPrice: 0,
        originalPrice: null,
        error: `Provedor Shopee inativo. Configure SHOPEE_AFFILIATE_APP_ID e SHOPEE_AFFILIATE_SECRET.`,
      };
    }
    return revalidateShopeeItem(externalId);
  }

  buildAffiliateUrl(originalUrl: string): string {
    const subId = process.env.SHOPEE_AFFILIATE_SUB_ID || "";
    if (!subId) return originalUrl;
    try {
      const url = new URL(originalUrl);
      url.searchParams.set("sub_id", subId);
      return url.toString();
    } catch {
      return originalUrl;
    }
  }

  async generateShortLink(productUrl: string): Promise<ShortenLinkResult> {
    if (!this.isConfigured()) {
      return {
        shortUrl: null,
        error: "Shopee Open API não configurada.",
      };
    }
    return generateShopeeShortLink(productUrl);
  }
}

export const shopeeProvider = new ShopeeProvider();
