import type { Offer } from "./types";

/**
 * Utilitário de formatação de mensagens promocionais para o Telegram
 * no estilo "Lobão das Promoções" (Foto + Headline em MAIÚSCULAS + Emoji + De/Por + Cupom + Link de afiliado).
 */

export function getProductEmoji(title: string, searchTerm?: string): string {
  const text = `${title} ${searchTerm || ""}`.toLowerCase();
  if (text.includes("meia")) return "🧦";
  if (text.includes("ferramenta") || text.includes("maleta") || text.includes("chave")) return "🧰";
  if (text.includes("poltrona") || text.includes("cadeira") || text.includes("sofa") || text.includes("sofá")) return "🛋️";
  if (text.includes("fone") || text.includes("headset") || text.includes("earphone") || text.includes("bluetooth")) return "🎧";
  if (text.includes("air fryer") || text.includes("fritadeira") || text.includes("panela")) return "🍟";
  if (text.includes("garrafa") || text.includes("treino") || text.includes("squeeze") || text.includes("copo")) return "🍶";
  if (text.includes("mala") || text.includes("mochila") || text.includes("viagem")) return "🧳";
  if (text.includes("notebook") || text.includes("computador") || text.includes("pc") || text.includes("gamer")) return "💻";
  if (text.includes("tenis") || text.includes("tênis") || text.includes("sapato") || text.includes("chinelo")) return "👟";
  if (text.includes("relogio") || text.includes("relógio") || text.includes("smartwatch")) return "⌚";
  if (text.includes("celular") || text.includes("smartphone") || text.includes("iphone")) return "📱";
  if (text.includes("tv") || text.includes("smart tv") || text.includes("monitor")) return "📺";
  return "📦";
}

export function generateTelegramHeadline(title: string, searchTerm?: string): string {
  const text = `${title} ${searchTerm || ""}`.toLowerCase();

  if (text.includes("meia")) {
    return "É MEIA QUE VOCÊ PRECISA?";
  }
  if (text.includes("ferramenta") || text.includes("maleta") || text.includes("chave")) {
    return "CHEGA DE PROCURAR CHAVE DE FENDA EM GAVETA";
  }
  if (text.includes("poltrona") || text.includes("cadeira do papai") || text.includes("reclinável")) {
    return "FAMOSA CADEIRINHA DO PAPAI";
  }
  if (text.includes("fone") || text.includes("bluetooth")) {
    return "CHEGA DE FIO EMBARAÇANDO NA SUA ROTINA";
  }
  if (text.includes("air fryer") || text.includes("fritadeira")) {
    return "SUA COZINHA NUNCA MAIS SERÁ A MESMA";
  }
  if (text.includes("garrafa") || text.includes("treino") || text.includes("squeeze")) {
    return "HIDRATAÇÃO GARANTIDA NO SEU TREINO";
  }
  if (text.includes("mala") || text.includes("viagem")) {
    return "SUA PRÓXIMA VIAGEM COM MUITO MAIS ESTILO";
  }
  if (text.includes("notebook") || text.includes("gamer")) {
    return "UPGRADE PESADO NO SEU SETUP COM DESCONTO";
  }
  if (text.includes("tenis") || text.includes("tênis")) {
    return "CONFORTO E ESTILO PRO SEU DIA A DIA";
  }

  // Headline padrão de alto impacto baseada no primeiro nome do produto
  const firstWord = title.trim().split(" ")[0]?.toUpperCase() || "PRODUTO";
  return `${firstWord} COM SUPER DESCONTO NO MERCADO LIVRE!`;
}

export function formatTelegramMessage(offer: Offer): string {
  const headline = generateTelegramHeadline(offer.title, offer.searchTerm);
  const emoji = getProductEmoji(offer.title, offer.searchTerm);
  const link = offer.affiliateUrl || offer.originalUrl;

  const originalPriceFormatted = offer.originalPrice ? Math.round(offer.originalPrice) : null;
  const currentPriceFormatted = Math.round(offer.price);

  let priceLine = "";
  if (originalPriceFormatted && originalPriceFormatted > currentPriceFormatted) {
    priceLine = `💵 De: R$ ${originalPriceFormatted} Por: R$ ${currentPriceFormatted}`;
  } else {
    priceLine = `💵 Por: R$ ${currentPriceFormatted}`;
  }

  const lines: string[] = [
    headline,
    "",
    `${emoji} ${offer.title}`,
    priceLine,
  ];

  if (offer.coupon) {
    const couponLine = offer.couponDescription
      ? `🎟️ Cupom: ${offer.coupon} (${offer.couponDescription})`
      : `🎟️ Cupom: ${offer.coupon}`;
    lines.push(couponLine);
  }

  lines.push("");
  lines.push(link);

  return lines.join("\n");
}
