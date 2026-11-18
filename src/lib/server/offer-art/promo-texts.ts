/*
 * Textos da arte "promo" (puros, testáveis). Nada é inventado: a forma de pagamento só aparece
 * quando a mensagem original da oferta traz essa informação.
 */

/** Lê "no Pix", "em até 10x", "à vista" da mensagem original da oferta. */
export function paymentNoteFromText(text?: string | null): string | null {
  if (!text) return null;
  const clean = text.normalize('NFC');
  const parcelas = /(?:em\s+)?at[ée]\s+(\d{1,2})\s*x\b/i.exec(clean) || /\b(\d{1,2})\s*x\s+sem\s+juros\b/i.exec(clean);
  if (parcelas) {
    const n = Number(parcelas[1]);
    if (n >= 2 && n <= 24) return `em até ${n}x${/sem\s+juros/i.test(clean) ? ' sem juros' : ''}`;
  }
  if (/\b(?:no|via|pelo|com)\s+pix\b|\bpix\b/i.test(clean)) return 'no Pix';
  if (/[àa]\s+vista\b/i.test(clean)) return 'à vista';
  return null;
}

export function paymentWarning(hasCoupon: boolean): string {
  return hasCoupon ? 'Preço e cupom válidos enquanto durar a promoção.' : 'Preço válido enquanto durar a promoção.';
}

/** Cupom só no WhatsApp (decisão do dono, 18/11): no Instagram nunca aparece. */
export function couponForChannel(channel: 'instagram' | 'whatsapp', coupon?: string | null): string | null {
  return channel === 'whatsapp' && coupon?.trim() ? coupon.trim() : null;
}
