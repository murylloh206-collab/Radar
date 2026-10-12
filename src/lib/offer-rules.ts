/**
 * REGRAS DE STATUS E VALIDAÇÃO
 * ----------------------------
 * Tudo que decide "pode ou não pode" fica aqui, num só lugar.
 * São funções puras (sem banco, sem rede), fáceis de entender e testar.
 * Podem ser usadas tanto no servidor quanto na interface.
 */
import { OFFER_STATUSES, type Offer, type OfferStatus, type OfferUpdate } from "./types";

export const LIMITS = {
  affiliateUrl: 2048,
  coupon: 60,
  couponDescription: 500,
} as const;

export const STATUS_LABEL: Record<OfferStatus, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  publicado: "Publicado",
};

export function isOfferStatus(value: unknown): value is OfferStatus {
  return typeof value === "string" && (OFFER_STATUSES as string[]).includes(value);
}

/** Calcula o % de desconto. Retorna null quando não há preço anterior válido. */
export function calcDiscountPercent(price: number, originalPrice: number | null): number | null {
  if (!originalPrice || originalPrice <= 0 || price <= 0 || originalPrice <= price) return null;
  return Math.round((1 - price / originalPrice) * 100);
}

/** Remove barra final, "#..." e deixa minúsculo — só para COMPARAR links. */
function normalizeForComparison(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return (u.origin + u.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Valida o link de afiliado colado pelo usuário.
 * IMPORTANTE: o link é guardado EXATAMENTE como foi colado.
 * O sistema nunca adiciona, remove ou inventa parâmetros de afiliado.
 */
export function validateAffiliateUrl(
  raw: string | null | undefined,
  originalUrl: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const value = (raw ?? "").trim();
  if (value === "") return { ok: true, value: null };

  if (value.length > LIMITS.affiliateUrl) {
    return { ok: false, error: "O link de afiliado é longo demais." };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "Link inválido. Cole a URL completa, começando com https://" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "O link precisa começar com https:// (ou http://)." };
  }

  const isAffiliateLink =
    parsed.hostname.includes("meli.la") ||
    parsed.searchParams.has("matt_tool") ||
    parsed.searchParams.has("matt_word") ||
    parsed.searchParams.has("tracking_id");

  // Colar o link comum sem nenhuma tag de afiliado não transforma ele em link de afiliado.
  if (!isAffiliateLink && normalizeForComparison(value) === normalizeForComparison(originalUrl)) {
    return {
      ok: false,
      error:
        "Esse é o link comum do produto, sem tags de afiliado. Use o link com parâmetros de afiliado (matt_tool/matt_word) ou encurtado (meli.la).",
    };
  }

  return { ok: true, value };
}

function cleanText(raw: string | null | undefined, max: number, field: string) {
  const value = (raw ?? "").trim();
  if (value.length > max) return { ok: false as const, error: `${field}: máximo de ${max} caracteres.` };
  return { ok: true as const, value: value === "" ? null : value };
}

/**
 * Aplica uma edição do usuário numa oferta, respeitando as regras:
 *  - Para APROVAR, é obrigatório ter um link de afiliado válido.
 *  - Links nunca são alterados pelo sistema.
 *  - Ofertas rejeitadas podem voltar para pendente a qualquer momento.
 */
export function applyOfferUpdate(
  offer: Offer,
  update: OfferUpdate,
  now: string = new Date().toISOString(),
): { ok: true; offer: Offer } | { ok: false; error: string } {
  const next: Offer = { ...offer };

  if (update.affiliateUrl !== undefined) {
    const result = validateAffiliateUrl(update.affiliateUrl, offer.originalUrl);
    if (!result.ok) return result;
    next.affiliateUrl = result.value;
  }

  if (update.coupon !== undefined) {
    const result = cleanText(update.coupon, LIMITS.coupon, "Cupom");
    if (!result.ok) return result;
    next.coupon = result.value ? result.value.toUpperCase() : null;
  }

  if (update.couponDescription !== undefined) {
    const result = cleanText(update.couponDescription, LIMITS.couponDescription, "Regra do cupom");
    if (!result.ok) return result;
    next.couponDescription = result.value;
  }

  if (update.shortUrl !== undefined) {
    next.shortUrl = update.shortUrl?.trim() || null;
  }

  if (update.whatsappStatus !== undefined) {
    next.whatsappStatus = update.whatsappStatus;
  }

  if (update.whatsappMessage !== undefined) {
    next.whatsappMessage = update.whatsappMessage ?? undefined;
  }

  if (update.whatsappError !== undefined) {
    next.whatsappError = update.whatsappError;
  }

  if (update.whatsappSentAt !== undefined) {
    next.whatsappSentAt = update.whatsappSentAt;
  }

  if (update.scheduledFor !== undefined) {
    next.scheduledFor = update.scheduledFor;
  }

  if (update.status !== undefined) {
    if (!isOfferStatus(update.status)) return { ok: false, error: "Status inválido." };
    if ((update.status === "aprovado" || update.status === "publicado") && !next.affiliateUrl && !next.shortUrl) {
      return {
        ok: false,
        error: "Link oficial de afiliado é necessário antes de aprovar/publicar.",
      };
    }
    if (update.status !== offer.status) {
      next.status = update.status;
      next.statusChangedAt = now;
      if (update.status === "aprovado" && (!next.whatsappStatus || next.whatsappStatus === "rascunho")) {
        next.whatsappStatus = "agendado";
        next.whatsappQueuedAt = now;
      }
      if (update.status === "publicado") {
        next.whatsappStatus = "enviado";
        next.whatsappSentAt = now;
      }
    }
  }

  // Se o link de afiliado for apagado, a oferta aprovada/publicada volta a ficar pendente.
  if ((next.status === "aprovado" || next.status === "publicado") && !next.affiliateUrl && !next.shortUrl) {
    next.status = "pendente";
    next.statusChangedAt = now;
  }

  next.updatedAt = now;
  return { ok: true, offer: next };
}
