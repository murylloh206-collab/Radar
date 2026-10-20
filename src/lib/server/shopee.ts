import "server-only";

import crypto from "node:crypto";
import { config, isShopeeConfigured } from "./config";
import type { NormalizedCandidateProduct, ShortenLinkResult } from "./providers/provider-interface";

export interface ShopeeProductNode {
  itemId: number;
  productName: string;
  price: string;
  priceMin: string;
  priceMax: string;
  priceDiscountRate: number;
  imageUrl: string;
  shopName: string;
  shopId: number;
  shopType: number[];
  productLink: string;
  offerLink: string;
  commissionRate: string;
  commission: string;
  ratingStar: string;
  sales: number;
}

export interface ShopeeProductOfferV2Response {
  data?: {
    productOfferV2?: {
      nodes?: ShopeeProductNode[];
      pageInfo?: {
        page: number;
        limit: number;
        hasNextPage: boolean;
      };
    };
  };
  errors?: Array<{
    message: string;
    extensions?: Record<string, unknown>;
  }>;
}

export interface ShopeeShortLinkResponse {
  data?: {
    generateShortLink?: {
      shortLink: string;
    };
  };
  errors?: Array<{
    message: string;
  }>;
}

/**
 * Executa requisição autenticada à Shopee Affiliate Open API (GraphQL)
 * Assinatura obrigatória:
 *   factor = appId + timestamp + payload + secret
 *   signature = SHA256Hex(factor)
 *   header: SHA256 Credential=appId,Timestamp=timestamp,Signature=signature
 */
export async function executeShopeeGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
  timeoutMs = 6000
): Promise<T> {
  const { appId, secret, graphqlUrl } = config.shopee;

  if (!appId || !secret) {
    throw new Error("Credenciais da Shopee Open API não configuradas (SHOPEE_AFFILIATE_APP_ID / SECRET).");
  }

  const payloadObj = { query, variables };
  const payloadStr = JSON.stringify(payloadObj);
  const timestamp = Math.floor(Date.now() / 1000);
  const factor = `${appId}${timestamp}${payloadStr}${secret}`;
  const signature = crypto.createHash("sha256").update(factor, "utf8").digest("hex");
  const authHeader = `SHA256 Credential=${appId},Timestamp=${timestamp},Signature=${signature}`;

  const res = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: payloadStr,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Shopee GraphQL HTTP ${res.status}: ${errorBody.slice(0, 150)}`);
  }

  const json = (await res.json()) as T;
  return json;
}

/**
 * Busca ofertas de produtos qualificados na Shopee Open API
 */
export async function searchShopeeProducts(
  keyword: string,
  limit = 12
): Promise<NormalizedCandidateProduct[]> {
  if (!isShopeeConfigured()) {
    return [];
  }

  const query = `
    query SearchShopeeOffers($keyword: String, $page: Int, $limit: Int) {
      productOfferV2(keyword: $keyword, page: $page, limit: $limit, sortType: 2) {
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
        pageInfo {
          page
          limit
          hasNextPage
        }
      }
    }
  `;

  try {
    const res = await executeShopeeGraphQL<ShopeeProductOfferV2Response>(
      query,
      {
        keyword,
        page: 1,
        limit: Math.min(limit, 50),
      },
      7000
    );

    if (res.errors && res.errors.length > 0) {
      console.error("[Shopee API] Erros retornados na busca:", res.errors);
      return [];
    }

    const nodes = res.data?.productOfferV2?.nodes || [];
    const now = new Date().toISOString();

    const normalized: NormalizedCandidateProduct[] = [];

    for (const node of nodes) {
      if (!node.itemId || !node.price) continue;

      const currentPrice = Number.parseFloat(node.price);
      if (Number.isNaN(currentPrice) || currentPrice <= 0) continue;

      const priceMax = Number.parseFloat(node.priceMax);
      const discountRate = node.priceDiscountRate || 0;

      // Determina o preço original de referência
      let originalPrice: number | null = null;
      if (priceMax > currentPrice) {
        originalPrice = priceMax;
      } else if (discountRate > 0) {
        originalPrice = Math.round((currentPrice / (1 - discountRate / 100)) * 100) / 100;
      }

      const rating = node.ratingStar ? Number.parseFloat(node.ratingStar) : null;
      const salesVolume = typeof node.sales === "number" ? node.sales : null;

      // Link oficial de afiliado já vem pronto no campo offerLink
      const officialOfferLink = node.offerLink?.trim() || null;

      normalized.push({
        source: "shopee",
        externalId: String(node.itemId),
        title: node.productName,
        thumbnail: node.imageUrl || null,
        price: currentPrice,
        originalPrice,
        currency: "BRL",
        originalUrl: node.productLink,
        freeShipping: false, // Shopee opera com cupom de frete grátis no app
        isInStock: true,
        rating: !Number.isNaN(rating) && (rating ?? 0) > 0 ? rating : null,
        reviewsCount: null,
        salesVolume,
        sellerReputation: node.shopName || null,
        affiliateUrl: officialOfferLink || node.productLink,
        shortUrl: officialOfferLink,
        searchTerm: keyword,
        capturedAt: now,
        categoryName: "Shopee",
      });
    }

    return normalized;
  } catch (err) {
    console.error(`[Shopee API] Erro ao buscar produtos para "${keyword}":`, err);
    return [];
  }
}

/**
 * Encurta uma URL de produto da Shopee gerando um link oficial de afiliado
 */
export async function generateShopeeShortLink(originUrl: string): Promise<ShortenLinkResult> {
  if (!isShopeeConfigured()) {
    return {
      shortUrl: null,
      error: "Shopee API não configurada.",
    };
  }

  const mutation = `
    mutation GenerateShopeeShort($originUrl: String!) {
      generateShortLink(input: { originUrl: $originUrl }) {
        shortLink
      }
    }
  `;

  try {
    const res = await executeShopeeGraphQL<ShopeeShortLinkResponse>(
      mutation,
      { originUrl },
      5000
    );

    if (res.errors && res.errors.length > 0) {
      return {
        shortUrl: null,
        error: res.errors[0]?.message || "Erro desconhecido na Shopee.",
      };
    }

    const shortLink = res.data?.generateShortLink?.shortLink;
    if (shortLink) {
      return { shortUrl: shortLink };
    }

    return {
      shortUrl: null,
      error: "Shopee não retornou o link encurtado.",
    };
  } catch (err) {
    return {
      shortUrl: null,
      error: err instanceof Error ? err.message : "Falha na chamada da Shopee API.",
    };
  }
}

/**
 * Revalida o preço e status de um produto na Shopee
 */
export async function revalidateShopeeItem(externalId: string): Promise<{
  available: boolean;
  currentPrice: number;
  originalPrice: number | null;
  title?: string;
  stockStatus?: "ativo" | "pausado" | "esgotado";
  error?: string;
}> {
  if (!isShopeeConfigured()) {
    return {
      available: false,
      currentPrice: 0,
      originalPrice: null,
      error: "Shopee API não configurada.",
    };
  }

  const numericId = Number.parseInt(externalId.replace(/\D/g, ""), 10);
  if (!numericId || Number.isNaN(numericId)) {
    return {
      available: false,
      currentPrice: 0,
      originalPrice: null,
      error: `ID de item Shopee inválido: ${externalId}`,
    };
  }

  const query = `
    query {
      productOfferV2(itemId: ${numericId}) {
        nodes {
          itemId
          productName
          price
          priceMax
          priceDiscountRate
        }
      }
    }
  `;

  try {
    const res = await executeShopeeGraphQL<ShopeeProductOfferV2Response>(query, {}, 5000);
    const node = res.data?.productOfferV2?.nodes?.[0];

    if (!node) {
      return {
        available: false,
        currentPrice: 0,
        originalPrice: null,
        stockStatus: "esgotado",
        error: "Produto não encontrado ou oferta finalizada na Shopee.",
      };
    }

    const currentPrice = Number.parseFloat(node.price);
    const priceMax = Number.parseFloat(node.priceMax);
    const discountRate = node.priceDiscountRate || 0;

    let originalPrice: number | null = null;
    if (priceMax > currentPrice) {
      originalPrice = priceMax;
    } else if (discountRate > 0) {
      originalPrice = Math.round((currentPrice / (1 - discountRate / 100)) * 100) / 100;
    }

    return {
      available: true,
      currentPrice,
      originalPrice,
      title: node.productName,
      stockStatus: "ativo",
    };
  } catch (err) {
    return {
      available: false,
      currentPrice: 0,
      originalPrice: null,
      error: err instanceof Error ? err.message : "Falha ao consultar item na Shopee.",
    };
  }
}
