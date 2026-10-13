import "server-only";

import type {
  MarketplaceProvider,
  NormalizedCandidateProduct,
  ProviderCapabilities,
  ShortenLinkResult,
} from "./provider-interface";

/**
 * PROVEDOR OFICIAL SHOPEE (PREPARADO PARA INTEGRAÇÃO OFICIAL)
 * -------------------------------------------------------------
 * Status: Aprovado no programa de afiliados da Shopee.
 * 
 * Requisitos para Ativação Completa:
 * 1. SHOPEE_AFFILIATE_APP_ID (App ID da Open Platform da Shopee)
 * 2. SHOPEE_AFFILIATE_SECRET (Chave Secreta da API de Afiliados)
 * 3. SHOPEE_AFFILIATE_ACCESS_TOKEN (Token oficial gerado no portal de desenvolvedores)
 * 4. Endpoints oficiais da Shopee Affiliate Open API:
 *    - GraphQL / REST endpoint: https://open-api.affiliate.shopee.com.br/graphql
 *    - Query: generateShortLink(input: { originUrl: $url })
 * 
 * REGRA ESTRITA DE COMPLIANCE:
 * Não realiza web scraping não autorizado nem contorna proteções da Shopee.
 * Permanece desativado de forma transparente até o fornecimento das credenciais oficiais.
 */

export class ShopeeProvider implements MarketplaceProvider {
  readonly source = "shopee" as const;
  readonly name = "Shopee";

  readonly capabilities: ProviderCapabilities = {
    supportsOfficialApi: false, // Inativo até confirmação de chaves
    supportsRealSalesVolume: false,
    supportsRealRatings: false,
    supportsReviewsCount: false,
    supportsOfficialAffiliateShortening: false,
    supportsSellerReputation: false,
    supportsStockVerification: false,
    supportsCouponsDetection: false,
  };

  isConfigured(): boolean {
    const appId = process.env.SHOPEE_AFFILIATE_APP_ID;
    const secret = process.env.SHOPEE_AFFILIATE_SECRET;
    return Boolean(appId && secret);
  }

  async hasActiveConnection(): Promise<boolean> {
    return this.isConfigured();
  }

  async searchProducts(): Promise<NormalizedCandidateProduct[]> {
    if (!this.isConfigured()) {
      return [];
    }
    // Stub preparado para quando as credenciais da Open Platform da Shopee forem fornecidas
    return [];
  }

  async revalidateItem(externalId: string) {
    return {
      available: false,
      currentPrice: 0,
      originalPrice: null,
      error: `Provedor Shopee inativo. Configure SHOPEE_AFFILIATE_APP_ID e SHOPEE_AFFILIATE_SECRET para validar o item ${externalId}.`,
    };
  }

  buildAffiliateUrl(originalUrl: string): string {
    // Quando a tag de afiliado da Shopee for informada via variável SHOPEE_AFFILIATE_SUB_ID
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

  async generateShortLink(): Promise<ShortenLinkResult> {
    return {
      shortUrl: null,
      error: "Shopee Open API ainda não ativada. Credenciais da API de Afiliados pendentes.",
    };
  }
}

export const shopeeProvider = new ShopeeProvider();
