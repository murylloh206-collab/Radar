export type PostCopyStyle = 'promocional' | 'engajamento' | 'curto';

export interface PostCopyInput {
  title: string;
  priceOriginal?: string;
  priceCurrent: string;
  discountPct?: string;
  coupon?: string;
  affiliateUrl: string;
  store?: string;
}

/**
 * Gera legendas de alta conversão para publicações no Feed do Instagram e Facebook
 */
export function generatePostCaption(input: PostCopyInput, style: PostCopyStyle = 'promocional'): string {
  const cleanTitle = (input.title || '').trim();
  const cleanDiscount = (input.discountPct || '').replace(/\D/g, '');
  const hasDiscount = Number(cleanDiscount) > 0;
  const priceDe = input.priceOriginal ? `❌ De: ~R$ ${input.priceOriginal}~` : '';
  const pricePor = input.priceCurrent.startsWith('R$') ? input.priceCurrent : `R$ ${input.priceCurrent}`;
  const couponText = input.coupon ? `🎟️ Cupom exclusivo: *${input.coupon.toUpperCase()}*` : '';
  const storeText = input.store ? ` na ${input.store}` : '';

  if (style === 'engajamento') {
    return [
      `😱 Olha esse achado incrível que encontramos${storeText}!`,
      '',
      `🔥 *${cleanTitle}*`,
      '',
      priceDe ? `${priceDe}` : '',
      `✅ *Por apenas: ${pricePor}!* ${hasDiscount ? `(-${cleanDiscount}% OFF)` : ''}`,
      couponText,
      '',
      `💬 Comente *"EU QUERO"* que te envio o link promocional no seu direct agora mesmo!`,
      `Ou clique direto no link da nossa bio / stories!`,
      '',
      `👉 Link direto da oferta:`,
      `${input.affiliateUrl}`,
      '',
      `🎯 *Radar de Ofertas* — Produtos que valem a pena!`,
      '',
      `#achadinhos #ofertas #promocao #desconto #${(input.store || 'radar').toLowerCase().replace(/\s+/g, '')} #radardeofertas`,
    ]
      .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
      .join('\n');
  }

  if (style === 'curto') {
    return [
      `⚡ *${cleanTitle}*`,
      '',
      `🔥 Por apenas *${pricePor}* ${hasDiscount ? `(-${cleanDiscount}% OFF)` : ''}!`,
      couponText,
      '',
      `🛒 Compre com segurança no link:`,
      `${input.affiliateUrl}`,
      '',
      `🎯 *Radar de Ofertas* — Produtos que valem a pena!`,
    ]
      .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
      .join('\n');
  }

  // Padrão: Promocional de Alta Conversão
  return [
    `⚡ *SUPER ACHADO DO RADAR DE OFERTAS!*`,
    '',
    `📦 *${cleanTitle}*`,
    '',
    priceDe ? `${priceDe}` : '',
    `🔥 *Por apenas: ${pricePor}* ${hasDiscount ? `(-${cleanDiscount}% OFF)` : ''}`,
    couponText,
    '',
    `🛒 *Como garantir o seu com o menor preço:*`,
    `👉 Link oficial de compra: ${input.affiliateUrl}`,
    `💬 Ou comente *"EU QUERO"* para receber o link no direct!`,
    '',
    `🎯 *Radar de Ofertas* — Produtos que valem a pena!`,
    '',
    `#achadinhos #promocao #ofertas #descontos #comprasonline #radardeofertas`,
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');
}
