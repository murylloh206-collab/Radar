import "server-only";

import type { OfferSource } from "@/lib/types";

export interface CandidateRawItem {
  externalId: string;
  title: string;
  thumbnail: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  originalUrl: string;
  freeShipping: boolean;
  isFull?: boolean;
  categoryName?: string;
  condition?: string;
  rating?: number | null;
  reviewsCount?: number | null;
  salesCount?: number | null;
  source?: OfferSource;
  affiliateUrl?: string | null;
  shortUrl?: string | null;
}

export interface ValidationResult {
  valid: boolean;
  reason: string;
  rejectionCode?:
    | "MIN_PRICE"
    | "MAX_PRICE"
    | "NO_ORIGINAL_PRICE"
    | "LOW_DISCOUNT"
    | "BLACKLIST_TERM"
    | "REPLICA_OR_USED";
  discountPercent?: number;
}

/** Configuração dos filtros de corte do pipeline */
export const VALIDATION_RULES = {
  MIN_PRICE: 80.0,
  MAX_PRICE: 450.0, // Teto máximo padrão para evitar itens caros/extrapolados
  MIN_DISCOUNT_PERCENT: 15,
};

/**
 * Blacklist rigorosa de termos que indicam bugigangas, acessórios baratos e itens não-desejados
 */
export const TITLE_BLACKLIST = [
  "capa",
  "capas",
  "capinha",
  "capinhas",
  "pelicula",
  "película",
  "peliculas",
  "películas",
  "cabo",
  "cabos",
  "suporte",
  "suportes",
  "adaptador",
  "adaptadores",
  "refil",
  "adesivo",
  "adesivos",
  "usado",
  "usada",
  "usados",
  "usadas",
  "recondicionado",
  "recondicionada",
  "recondicionados",
  "personalizado",
  "personalizada",
  "personalizados",
  "case",
  "cases",
  "pulseira",
  "pulseiras",
  "chaveiro",
  "chaveiros",
  "almofada",
  "pano de prato",
  "pano de chao",
  "palmilha",
  "cadarco",
  "presilha",
  "protetor de cabo",
  "induzido",
  "estator",
  "carcaca",
  "carcaça",
  "peça de reposição",
  "peca de reposicao",
  "bateria avulsa",
] as const;

/**
 * Padrões de réplicas, pirataria e produtos não-originais
 */
const REPLICA_PATTERNS = [
  /\br[eé]plica\b/i,
  /\binspirad[oa]s?\b/i,
  /\bsimilar\b/i,
  /\bcompat[ií]vel\b/i,
  /\bprimeira linha\b/i,
  /\b1[aª] linha\b/i,
  /\blinha premium\b/i,
  /\bimitac[aã]o\b/i,
];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Verifica se o título contém termos da blacklist
 */
export function checkBlacklist(title: string): string | null {
  const normalized = normalizeText(title);

  // 1. Verifica termos da lista proibida com limites de palavra ou substrings relevantes
  for (const term of TITLE_BLACKLIST) {
    const termNorm = normalizeText(term);
    const regex = new RegExp(`\\b${termNorm}\\b`, "i");
    if (regex.test(normalized)) {
      return term;
    }
  }

  // 2. Verifica padrões de réplica / cópia
  for (const pattern of REPLICA_PATTERNS) {
    if (pattern.test(normalized)) {
      return "réplica/não-original";
    }
  }

  return null;
}

/**
 * PIPELINE DE VALIDAÇÃO EM CAMADAS RIGOROSO
 * -----------------------------------------
 * Aplica os 3 filtros eliminatórios sequencialmente com logs explícitos:
 * 1. Piso de Preço: price >= R$ 80,00
 * 2. Blacklist de Termos: sem acessórios, capas, usados, etc.
 * 3. Validação Matemática de Desconto Real: original_price > price e desconto >= 15%
 */
export function validateOfferCandidate(
  item: CandidateRawItem,
  customPriceRange?: { minPrice: number; maxPrice: number; isLearned?: boolean }
): ValidationResult {
  const title = item.title?.trim() || "";
  const price = typeof item.price === "number" ? item.price : 0;
  const originalPrice = typeof item.originalPrice === "number" ? item.originalPrice : null;
  const minPriceLimit = customPriceRange?.minPrice ?? VALIDATION_RULES.MIN_PRICE;
  const maxPriceLimit = customPriceRange?.maxPrice ?? VALIDATION_RULES.MAX_PRICE;

  // Barreira 1: Piso de Preço
  if (price < minPriceLimit) {
    console.log(
      `[REJEITADO] Preço abaixo do mínimo: R$ ${price.toFixed(2)} < R$ ${minPriceLimit.toFixed(2)} | "${title}"`
    );
    return {
      valid: false,
      rejectionCode: "MIN_PRICE",
      reason: `Preço R$ ${price.toFixed(2)} abaixo do piso mínimo de R$ ${minPriceLimit.toFixed(2)}.`,
    };
  }

  // Barreira 2: Blacklist de Termos e Palavras Proibidas
  const blacklistedTerm = checkBlacklist(title);
  if (blacklistedTerm) {
    console.log(`[REJEITADO] Contém termo da blacklist: "${blacklistedTerm}" | "${title}"`);
    return {
      valid: false,
      rejectionCode: "BLACKLIST_TERM",
      reason: `Título contém termo proibido da blacklist ("${blacklistedTerm}").`,
    };
  }

  // Barreira 3: Validação Matemática de Desconto Real
  if (!originalPrice || originalPrice <= price) {
    console.log(
      `[REJEITADO] Sem preço original de referência ou sem desconto real | "${title}" (Preço atual: R$ ${price.toFixed(2)}, Preço original: ${originalPrice !== null ? `R$ ${originalPrice.toFixed(2)}` : "não informado"})`
    );
    return {
      valid: false,
      rejectionCode: "NO_ORIGINAL_PRICE",
      reason: "Produto sem preço original de referência comprovado para cálculo de desconto real.",
    };
  }

  const realDiscountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);

  if (realDiscountPercent < VALIDATION_RULES.MIN_DISCOUNT_PERCENT) {
    console.log(
      `[REJEITADO] Desconto real insuficiente: ${realDiscountPercent}% < ${VALIDATION_RULES.MIN_DISCOUNT_PERCENT}% (De R$ ${originalPrice.toFixed(2)} por R$ ${price.toFixed(2)}) | "${title}"`
    );
    return {
      valid: false,
      rejectionCode: "LOW_DISCOUNT",
      reason: `Desconto real de ${realDiscountPercent}% abaixo do mínimo exigido de ${VALIDATION_RULES.MIN_DISCOUNT_PERCENT}%.`,
      discountPercent: realDiscountPercent,
    };
  }

  // Barreira 4: Teto de Preço (dinâmico ou padrão R$ 450,00)
  if (price > maxPriceLimit) {
    console.log(
      `[REJEITADO] Preço acima do teto permitido: R$ ${price.toFixed(2)} > R$ ${maxPriceLimit.toFixed(2)} | "${title}"`
    );
    return {
      valid: false,
      rejectionCode: "MAX_PRICE",
      reason: `Preço R$ ${price.toFixed(2)} excede o teto permitido de R$ ${maxPriceLimit.toFixed(2)}.`,
    };
  }

  // Todas as barreiras foram superadas com sucesso
  console.log(
    `[APROVADO] Produto qualificado: "${title}" - De R$ ${originalPrice.toFixed(2)} por R$ ${price.toFixed(2)} (${realDiscountPercent}% OFF)${item.freeShipping ? " [Frete Grátis]" : ""}${item.isFull ? " [Full]" : ""}`
  );

  return {
    valid: true,
    discountPercent: realDiscountPercent,
    reason: `Oferta qualificada com ${realDiscountPercent}% de desconto real comprovado.`,
  };
}
