/**
 * Tipos compartilhados entre a interface (navegador) e o servidor.
 * Este arquivo NÃO pode importar nada de Node.js (fs, path...).
 */

export type OfferStatus = "pendente" | "aprovado" | "rejeitado";

export const OFFER_STATUSES: OfferStatus[] = ["pendente", "aprovado", "rejeitado"];

/** Uma oferta salva no painel. */
export interface Offer {
  /** Identificador interno (ex.: "mercadolivre:MLB123456"). */
  id: string;
  /** De onde veio a oferta. Hoje só existe Mercado Livre. */
  source: "mercadolivre";
  /** ID do item/produto no Mercado Livre. */
  externalId: string;
  title: string;
  thumbnail: string | null;
  /** Preço atual em reais. */
  price: number;
  /** Preço "de" (anterior), quando o Mercado Livre informa. */
  originalPrice: number | null;
  /** Desconto calculado a partir de price e originalPrice. */
  discountPercent: number | null;
  currency: string;
  /** Link ORIGINAL do produto (não é link de afiliado). */
  originalUrl: string;
  freeShipping: boolean;
  /** Termo de busca que encontrou este produto. */
  searchTerm: string;

  status: OfferStatus;
  /** Link de afiliado colado MANUALMENTE por você. Nunca é gerado pelo sistema. */
  affiliateUrl: string | null;
  coupon: string | null;
  couponDescription: string | null;

  createdAt: string;
  updatedAt: string;
  /** Última vez que a oferta apareceu numa busca (preço atualizado). */
  lastSeenAt: string;
  statusChangedAt: string | null;
}

/** Campos que o usuário pode editar pela interface. */
export interface OfferUpdate {
  status?: OfferStatus;
  affiliateUrl?: string | null;
  coupon?: string | null;
  couponDescription?: string | null;
}

export interface LastSearchInfo {
  at: string;
  terms: string[];
  found: number;
  added: number;
  updated: number;
}

/** Resposta de GET /api/offers */
export interface OffersResponse {
  offers: Offer[];
  lastSearch: LastSearchInfo | null;
  config: {
    defaultTerms: string[];
    resultsPerTerm: number;
    mercadoLivreConfigured: boolean;
  };
}

/** Resposta de POST /api/offers/search */
export interface SearchResponse {
  offers: Offer[];
  lastSearch: LastSearchInfo;
  errors: { term: string; message: string }[];
}

export interface ApiError {
  error: string;
}
