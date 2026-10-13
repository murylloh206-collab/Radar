import "server-only";

import type { OfferSource } from "@/lib/types";
import { mercadoLivreProvider, MercadoLivreProvider } from "./mercadolivre-provider";
import { shopeeProvider, ShopeeProvider } from "./shopee-provider";
import type { MarketplaceProvider } from "./provider-interface";

export * from "./provider-interface";
export * from "./mercadolivre-provider";
export * from "./shopee-provider";

const registry: Record<OfferSource, MarketplaceProvider> = {
  mercadolivre: mercadoLivreProvider,
  shopee: shopeeProvider,
};

export function getProvider(source: OfferSource): MarketplaceProvider {
  const provider = registry[source];
  if (!provider) {
    throw new Error(`Provedor desconhecido: "${source}"`);
  }
  return provider;
}

export function getAllProviders(): MarketplaceProvider[] {
  return [mercadoLivreProvider, shopeeProvider];
}

export function getActiveProviders(): MarketplaceProvider[] {
  return getAllProviders().filter((p) => p.isConfigured());
}
