import "server-only";

import type { MLProduct } from "./mercadolivre";
import type { PriceHistoryItem } from "../types";

/**
 * MOTOR DE PONTUAÇÃO E QUALIDADE DE OFERTAS
 * -----------------------------------------
 * Transparente, auditável e sem dados fictícios.
 */

export interface OpportunityEvaluation {
  score: number;
  reason: string;
}

export function evaluateOpportunity(
  product: Pick<MLProduct, "price" | "originalPrice" | "freeShipping" | "rating" | "reviewsCount" | "sellerReputation">,
  history?: PriceHistoryItem[],
): OpportunityEvaluation {
  let score = 50; // Pontuação base neutra
  const highlights: string[] = [];

  const price = product.price;
  const originalPrice = product.originalPrice;

  // 1. Desconto real e verificável
  if (originalPrice && originalPrice > price) {
    const discount = Math.round((1 - price / originalPrice) * 100);
    if (discount >= 50) {
      score += 35;
      highlights.push(`Super desconto ${discount}% OFF`);
    } else if (discount >= 30) {
      score += 25;
      highlights.push(`${discount}% OFF`);
    } else if (discount >= 15) {
      score += 15;
      highlights.push(`${discount}% OFF`);
    } else if (discount > 0) {
      score += 5;
    }
  }

  // 2. Preço competitivo em relação ao histórico gravado no próprio painel
  if (history && history.length >= 2) {
    const validPrices = history.map((h) => h.price).filter((p) => p > 0);
    if (validPrices.length >= 2) {
      const minHistorical = Math.min(...validPrices);
      if (price <= minHistorical) {
        score += 15;
        highlights.push("Menor preço histórico");
      }
    }
  }

  // 3. Frete grátis confirmado
  if (product.freeShipping) {
    score += 15;
    highlights.push("Frete grátis");
  }

  // 4. Avaliações oficiais comprovadas
  if (typeof product.rating === "number" && product.rating > 0) {
    if (product.rating >= 4.7) {
      score += 15;
      highlights.push(`⭐ ${product.rating.toFixed(1)}`);
    } else if (product.rating >= 4.0) {
      score += 8;
    } else if (product.rating < 3.5) {
      score -= 20; // Penalidade por nota baixa comprovada
    }
  }

  // 5. Reputação / Vendedor
  if (product.sellerReputation) {
    const rep = product.sellerReputation.toLowerCase();
    if (rep.includes("platinum") || rep.includes("gold")) {
      score += 10;
      highlights.push("Loja oficial / MercadoLíder");
    }
  }

  // 6. Filtros de segurança contra preço suspeito ou dados inconsistentes
  if (price <= 2) {
    score -= 50; // Preço anormal / brinde / erro de cadastro
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));

  let label = "Boa oportunidade";
  if (normalizedScore >= 80) label = "Excelente oportunidade";
  else if (normalizedScore >= 65) label = "Ótima oportunidade";
  else if (normalizedScore < 50) label = "Oportunidade padrão";

  const reason = highlights.length > 0 ? `${label} · ${highlights.slice(0, 3).join(" · ")}` : label;

  return {
    score: normalizedScore,
    reason,
  };
}

/**
 * Atualiza o histórico de preço sem duplicar repetições idênticas seguidas
 */
export function updatePriceHistory(
  existingHistory: PriceHistoryItem[] | undefined,
  currentPrice: number,
  now: string = new Date().toISOString(),
): PriceHistoryItem[] {
  const history = existingHistory ? [...existingHistory] : [];
  const last = history[history.length - 1];

  if (!last || last.price !== currentPrice) {
    history.push({ price: currentPrice, recordedAt: now });
  }

  // Mantém no máximo os últimos 30 registros de preço
  return history.slice(-30);
}
