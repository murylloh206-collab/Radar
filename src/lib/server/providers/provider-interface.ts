import "server-only";

import type { OfferSource } from "@/lib/types";

/**
 * Capacidades declaradas pelo provedor.
 * Informa ao algoritmo de pontuação quais sinais são suportados nativamente e quais estão indisponíveis.
 */
export interface ProviderCapabilities {
  supportsOfficialApi: boolean;
  supportsRealSalesVolume: boolean;
  supportsRealRatings: boolean;
  supportsReviewsCount: boolean;
  supportsOfficialAffiliateShortening: boolean;
  supportsSellerReputation: boolean;
  supportsStockVerification: boolean;
  supportsCouponsDetection: boolean;
}

/**
 * Produto candidato padronizado e normalizado de qualquer marketplace.
 */
export interface NormalizedCandidateProduct {
  source: OfferSource;
  externalId: string;
  title: string;
  thumbnail: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  originalUrl: string;
  freeShipping: boolean;
  availableStock?: number | null;
  isInStock: boolean;
  rating?: number | null;
  reviewsCount?: number | null;
  salesVolume?: number | null;
  sellerReputation?: string | null;
  coupon?: string | null;
  couponDescription?: string | null;
  affiliateUrl?: string | null;
  shortUrl?: string | null;
  searchTerm?: string;
  capturedAt: string;
  categoryName?: string;
}

export interface ShortenLinkResult {
  shortUrl: string | null;
  error?: string | null;
}

/**
 * Contrato de Provedor de Marketplace.
 */
export interface MarketplaceProvider {
  readonly source: OfferSource;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  /** Verifica se o provedor está configurado e pronto para operar */
  isConfigured(): boolean;

  /** Verifica se há conexão ativa com credenciais válidas */
  hasActiveConnection(): Promise<boolean>;

  /** Busca produtos candidatos por termo ou palavra-chave */
  searchProducts(query: string, limit?: number): Promise<NormalizedCandidateProduct[]>;

  /** Descoberta por categorias prioritárias */
  discoverCategories?(limitPerCategory?: number): Promise<NormalizedCandidateProduct[]>;

  /** Revalida preço, estoque e disponibilidade atual do item */
  revalidateItem(externalId: string): Promise<{
    available: boolean;
    currentPrice: number;
    originalPrice: number | null;
    title?: string;
    stockStatus?: "ativo" | "pausado" | "esgotado";
    error?: string;
  }>;

  /** Constrói a URL canônica de afiliado */
  buildAffiliateUrl(originalUrl: string): string;

  /** Encurta para o formato oficial (ex.: meli.la) quando suportado e autenticado */
  generateShortLink(productUrl: string): Promise<ShortenLinkResult>;
}
