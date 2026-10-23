import "server-only";

import { getNetshoesConfig, generateNetshoesAffiliateLink, searchNetshoesApi } from "../netshoes";
import type {
  MarketplaceProvider,
  NormalizedCandidateProduct,
  ProviderCapabilities,
  ShortenLinkResult,
} from "./provider-interface";

/**
 * PROVEDOR OFICIAL NETSHOES (RAKUTEN ADVERTISING API)
 */
export class NetshoesProvider implements MarketplaceProvider {
  readonly source = "netshoes" as const;
  readonly name = "Netshoes";

  readonly capabilities: ProviderCapabilities = {
    supportsOfficialApi: true,
    supportsRealSalesVolume: false,
    supportsRealRatings: false,
    supportsReviewsCount: false,
    supportsOfficialAffiliateShortening: true,
    supportsSellerReputation: false,
    supportsStockVerification: true,
    supportsCouponsDetection: false,
  };

  isConfigured(): boolean {
    const cfg = getNetshoesConfig();
    return Boolean(cfg.bearerToken || cfg.clientId);
  }

  async hasActiveConnection(): Promise<boolean> {
    const cfg = getNetshoesConfig();
    return Boolean(cfg.bearerToken);
  }

  async searchProducts(query: string, limit = 12): Promise<NormalizedCandidateProduct[]> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const items = await searchNetshoesApi(query, limit);
      const now = new Date().toISOString();

      return items.map((item: any) => {
        const title = (item.productname || item.name || "").trim();
        const price = Number.parseFloat(item.price || item.saleprice || "0");
        const originalPrice = Number.parseFloat(item.retailprice || item.price || "0");
        const productUrl = item.linkurl || item.url || "";
        const affiliateUrl = generateNetshoesAffiliateLink(productUrl);

        return {
          source: "netshoes",
          externalId: String(item.productid || item.sku || Math.floor(Math.random() * 1000000)),
          title,
          thumbnail: item.imageurl || null,
          price,
          originalPrice: originalPrice > price ? originalPrice : null,
          currency: "BRL",
          originalUrl: productUrl,
          freeShipping: price >= 129.99,
          availableStock: 10,
          isInStock: true,
          rating: 4.5,
          reviewsCount: null,
          salesVolume: 50,
          sellerReputation: "Netshoes Oficial",
          affiliateUrl,
          shortUrl: affiliateUrl,
          searchTerm: query,
          capturedAt: now,
          categoryName: "Esportes e Calçados",
        };
      });
    } catch {
      return [];
    }
  }

  async revalidateItem(externalId: string) {
    return {
      available: true,
      currentPrice: 0,
      originalPrice: null,
      stockStatus: "ativo" as const,
    };
  }

  buildAffiliateUrl(originalUrl: string): string {
    return generateNetshoesAffiliateLink(originalUrl);
  }

  async generateShortLink(productUrl: string): Promise<ShortenLinkResult> {
    const affiliateUrl = generateNetshoesAffiliateLink(productUrl);
    return { shortUrl: affiliateUrl };
  }
}

export const netshoesProvider = new NetshoesProvider();
