export interface FormatMessageOptions {
  templateText?: string;
  title: string;
  originalPrice?: number;
  currentPrice: number;
  discountPct?: number;
  affiliateUrl: string;
  couponCode?: string;
  couponDiscount?: string;
  hookText?: string;
  watermarkText?: string;
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
    .format(value)
    .replace(/\s/g, ' ');
}

/**
 * Sanitiza texto vindo de origens de cópia ou webhooks:
 * Remove menções a outros canais (@canal, t.me, bit.ly alheios, telefones)
 */
export function sanitizeCopiedText(rawText: string): string {
  let cleaned = rawText;

  // Remove URLs antigas/terceiros
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, '');

  // Remove convites e arrobas de canais concorrentes
  cleaned = cleaned.replace(/@(todos|canalde|achadinhos|promos|canal\w+)/gi, '');
  cleaned = cleaned.replace(/entre no nosso grupo|canal vip|siga nosso canal|link na bio/gi, '');

  // Normaliza quebras de linha excessivas
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

export const DEFAULT_TEMPLATE = `\
{gancho}

*{titulo}*

{preco_de}
🔥 *Por apenas {preco_por}* ({desconto})
{cupom}

🛒 *Compre aqui com segurança:*
{link}

{marca_dagua}`;

export function buildWhatsAppMessage(options: FormatMessageOptions): string {
  const {
    templateText = DEFAULT_TEMPLATE,
    title,
    originalPrice,
    currentPrice,
    discountPct,
    affiliateUrl,
    couponCode,
    couponDiscount,
    hookText = '⚡ *SUPER OFERTA EXCLUSIVA!*',
    watermarkText = '🎯 _Radar de Ofertas_',
  } = options;

  let message = templateText;

  // Gancho
  message = message.replace('{gancho}', hookText);

  // Título
  message = message.replace('{titulo}', title.trim());

  // Preço DE
  if (originalPrice && originalPrice > currentPrice) {
    message = message.replace('{preco_de}', `De: ~${formatBRL(originalPrice)}~`);
  } else {
    message = message.replace('{preco_de}', '');
  }

  // Preço POR / Preço Atual
  message = message.replace('{preco_por}', formatBRL(currentPrice));
  message = message.replace('{preco}', formatBRL(currentPrice));

  // Desconto
  if (discountPct && discountPct > 0) {
    message = message.replace('{desconto}', `-${Math.round(discountPct)}% OFF`);
  } else {
    message = message.replace('{desconto}', '');
  }

  // Cupom
  if (couponCode && couponCode.trim()) {
    const couponLine = `🎟️ Cupom: *${couponCode.trim().toUpperCase()}*${
      couponDiscount ? ` (${couponDiscount})` : ''
    }`;
    message = message.replace('{cupom}', couponLine);
  } else {
    message = message.replace('{cupom}', '');
  }

  // Link
  message = message.replace('{link}', affiliateUrl);

  // Marca d'água
  message = message.replace('{marca_dagua}', watermarkText);

  // Limpar linhas vazias repetidas
  message = message.replace(/\n{3,}/g, '\n\n').trim();

  return message;
}
