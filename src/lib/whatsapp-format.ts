import type { Offer } from "./types";

function formatBRL(val: number): string {
  return val.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Formatação oficial para o envio automático de ofertas conforme especificação:
 *
 * 🔥 *{titulo}*
 *
 * 💰 De {preco_original} por *{preco_atual}*
 * 🏷️ {desconto}% OFF (se não houver cupom não aparece o desconto na mensagem)
 * 🚚 Frete grátis, quando confirmado
 * 🎟️ Cupom: *{cupom}*, quando existir
 *
 * 🛒 *COMPRAR NO MERCADO LIVRE*
 * {link_curto_oficial}
 *
 * ⚠️ Preço e estoque podem mudar.
 */
export function formatAutoDispatchMessage(offer: Offer): string {
  const title = offer.title.trim();
  const shortLink = offer.shortUrl || offer.affiliateUrl || offer.originalUrl;

  const currentFormatted = formatBRL(offer.price);
  const originalFormatted =
    offer.originalPrice && offer.originalPrice > offer.price
      ? formatBRL(offer.originalPrice)
      : null;

  const priceLine = originalFormatted
    ? `💰 De ${originalFormatted} por *${currentFormatted}*`
    : `💰 Por *${currentFormatted}*`;

  const lines: string[] = [`🔥 *${title}*`, "", priceLine];

  // Regra estrita: se não houver cupom, não aparece o desconto na mensagem
  if (offer.coupon && offer.discountPercent && offer.discountPercent > 0) {
    lines.push(`🏷️ ${offer.discountPercent}% OFF`);
  }

  // Frete grátis, quando confirmado
  if (offer.freeShipping) {
    lines.push("🚚 Frete grátis");
  }

  // Cupom: *{cupom}*, quando existir
  if (offer.coupon && offer.coupon.trim()) {
    lines.push(`🎟️ Cupom: *${offer.coupon.trim()}*`);
  }

  lines.push("");
  const isShopee =
    offer.source === "shopee" ||
    offer.id.startsWith("shopee:") ||
    shortLink.includes("shopee.com");
  lines.push(isShopee ? "🛒 *COMPRAR NA SHOPEE*" : "🛒 *COMPRAR NO MERCADO LIVRE*");
  lines.push(shortLink);
  lines.push("");
  lines.push("⚠️ Preço e estoque podem mudar.");

  return lines.join("\n");
}

/**
 * Utilitário compartilhado para copiar a mensagem pronta (mantido para compatibilidade dos cards).
 */
export function formatWhatsAppMessage(offer: Offer): string {
  return formatAutoDispatchMessage(offer);
}
