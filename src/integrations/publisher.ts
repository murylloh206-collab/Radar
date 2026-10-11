/**
 * PREPARAÇÃO PARA PUBLICAÇÃO FUTURA (Telegram, WhatsApp...)
 * ==========================================================
 * Nesta fase NADA é publicado. Este arquivo só define o "formato"
 * que um publicador precisará seguir quando for implementado.
 * Nenhum token é lido e nenhuma API externa é chamada aqui.
 */
import type { Offer } from "@/lib/types";

/** Contrato que qualquer canal de publicação deverá implementar no futuro. */
export interface OfferPublisher {
  /** Nome do canal, ex.: "telegram". */
  readonly channel: string;
  /** Publica UMA oferta aprovada. Deve ser chamada só por ação manual sua. */
  publish(offer: Offer): Promise<{ ok: boolean; messageId?: string; error?: string }>;
}

/**
 * Monta o texto da mensagem a partir de uma oferta APROVADA.
 * Usa somente o link de afiliado que você colou — nunca o link original.
 * (Função pura: não envia nada.)
 */
export function buildOfferMessage(offer: Offer): string | null {
  if (offer.status !== "aprovado" || !offer.affiliateUrl) return null;

  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const lines = [`🔥 ${offer.title}`, ""];

  if (offer.originalPrice && offer.discountPercent) {
    lines.push(`De ${brl(offer.originalPrice)} por ${brl(offer.price)} (-${offer.discountPercent}%)`);
  } else {
    lines.push(`Por ${brl(offer.price)}`);
  }
  if (offer.coupon) {
    lines.push(`🎟️ Cupom: ${offer.coupon}${offer.couponDescription ? ` — ${offer.couponDescription}` : ""}`);
  }
  lines.push("", `👉 ${offer.affiliateUrl}`, "", "Preço e estoque podem mudar a qualquer momento.");
  return lines.join("\n");
}
