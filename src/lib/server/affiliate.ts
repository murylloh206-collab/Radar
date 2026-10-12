import "server-only";

import { config } from "./config";
import type { Offer } from "../types";

/**
 * SERVIÇO DE AFILIADOS E CUPONS DO MERCADO LIVRE
 * ----------------------------------------------
 * Constrói os links de afiliado com as tags oficiais do usuário (matt_tool e matt_word)
 * e detecta cupons de desconto aplicáveis aos produtos.
 */

import { generateMeliShortLink } from "./meli-shortener";

/**
 * Constrói a URL oficial de afiliado do Mercado Livre com a comissão vinculada.
 */
export function buildAffiliateUrl(originalUrl: string): string {
  if (!originalUrl) return "";

  const mattTool = config.mercadoLivre.affiliateMattTool || "77625408";
  const mattWord = config.mercadoLivre.affiliateMattWord || "michelhenrique1";

  try {
    const url = new URL(originalUrl);

    // Mantém a URL limpa removendo parâmetros de rastreamento anteriores
    url.searchParams.delete("tracking_id");
    url.searchParams.delete("searchVariation");
    url.searchParams.delete("c_id");

    // Adiciona os parâmetros oficiais do programa de afiliados do Mercado Livre
    url.searchParams.set("matt_tool", mattTool);
    url.searchParams.set("matt_word", mattWord);
    url.searchParams.set("forceInApp", "true");

    return url.toString();
  } catch {
    // Se a URL não for parseável diretamente, anexa os parâmetros
    const separator = originalUrl.includes("?") ? "&" : "?";
    return `${originalUrl}${separator}matt_tool=${mattTool}&matt_word=${mattWord}&forceInApp=true`;
  }
}

/**
 * Tenta resolver a URL de afiliado: primeiro tenta meli.la (se cookie configurado),
 * e usa a URL oficial comissionada como fallback.
 */
export async function resolveAffiliateUrl(originalUrl: string): Promise<string> {
  const short = await generateMeliShortLink(originalUrl);
  if (short) return short;
  return buildAffiliateUrl(originalUrl);
}

/**
 * Detecta cupom aplicável com base no título, categoria e faixa de preço.
 */
export function detectCoupon(product: {
  title: string;
  price: number;
  originalPrice?: number | null;
  searchTerm?: string;
}): { coupon: string | null; description: string | null } {
  const titleLower = (product.title || "").toLowerCase();
  const termLower = (product.searchTerm || "").toLowerCase();
  const price = product.price;

  // 1. Produtos de Moda / Calçados / Meias / Vestuário
  if (
    titleLower.includes("meia") ||
    titleLower.includes("tenis") ||
    titleLower.includes("tênis") ||
    titleLower.includes("camisa") ||
    titleLower.includes("calça") ||
    termLower.includes("moda")
  ) {
    if (price >= 120) {
      return {
        coupon: "MODA20",
        description: "R$ 20 OFF em moda e calçados acima de R$ 119",
      };
    }
    return {
      coupon: "MODA10",
      description: "10% OFF em itens de vestuário e calçados",
    };
  }

  // 2. Eletrônicos / Informática / Fones / Gamer
  if (
    titleLower.includes("fone") ||
    titleLower.includes("bluetooth") ||
    titleLower.includes("gamer") ||
    titleLower.includes("notebook") ||
    titleLower.includes("mouse") ||
    titleLower.includes("teclado")
  ) {
    if (price >= 200) {
      return {
        coupon: "TECH20",
        description: "R$ 20 OFF em eletrônicos e informática acima de R$ 199",
      };
    }
    if (price >= 80) {
      return {
        coupon: "TECH10",
        description: "10% OFF em produtos selecionados de tecnologia",
      };
    }
  }

  // 3. Eletrodomésticos / Casa / Air Fryer / Cozinha / Ferramentas
  if (
    titleLower.includes("air fryer") ||
    titleLower.includes("fritadeira") ||
    titleLower.includes("ferramenta") ||
    titleLower.includes("maleta") ||
    titleLower.includes("furadeira") ||
    titleLower.includes("cadeira") ||
    titleLower.includes("poltrona")
  ) {
    if (price >= 250) {
      return {
        coupon: "CASA30",
        description: "R$ 30 OFF para casa e ferramentas acima de R$ 249",
      };
    }
    if (price >= 99) {
      return {
        coupon: "CASA15",
        description: "R$ 15 OFF em compras para o lar a partir de R$ 99",
      };
    }
  }

  // 4. Regras gerais por valor
  if (price >= 299) {
    return {
      coupon: "MELI30",
      description: "R$ 30 OFF em compras acima de R$ 299 no Mercado Livre",
    };
  }

  if (price >= 149) {
    return {
      coupon: "MELI15",
      description: "R$ 15 OFF em compras acima de R$ 149",
    };
  }

  if (price >= 79) {
    return {
      coupon: "APP10",
      description: "R$ 10 OFF para compras no Aplicativo Mercado Livre",
    };
  }

  return { coupon: null, description: null };
}

import { formatTelegramMessage, generateTelegramHeadline, getProductEmoji } from "../telegram-format";

export { getProductEmoji, generateTelegramHeadline, formatTelegramMessage } from "../telegram-format";

/**
 * Formata a mensagem completa para o Telegram no padrão "Lobão das Promoções".
 */
export function formatTelegramPost(offer: Offer): {
  headline: string;
  emoji: string;
  photoUrl: string | null;
  text: string;
} {
  const headline = generateTelegramHeadline(offer.title, offer.searchTerm);
  const emoji = getProductEmoji(offer.title, offer.searchTerm);
  const text = formatTelegramMessage(offer);

  return {
    headline,
    emoji,
    photoUrl: offer.thumbnail,
    text,
  };
}

