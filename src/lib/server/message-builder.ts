export interface FormatMessageOptions {
  templateText?: string;
  title: string;
  originalPrice?: number;
  currentPrice: number;
  currentPriceCondition?: string;
  ouPriceText?: string;
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
{preco_ou}
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
    currentPriceCondition,
    ouPriceText,
    discountPct,
    affiliateUrl,
    couponCode,
    couponDiscount,
    hookText = '⚡ *SUPER OFERTA EXCLUSIVA!*',
    watermarkText = '🎯 *Radar de Ofertas* — Produtos que valem a pena!',
  } = options;

  let message = templateText;

  // Gancho
  message = message.replace('{gancho}', hookText);

  // Título
  message = message.replace('{titulo}', title.trim());

  // Preço DE
  if (originalPrice && originalPrice > 0 && (!currentPrice || originalPrice > currentPrice)) {
    message = message.replace(/~?R\$\s*\{preco_de\}~?/gi, `~${formatBRL(originalPrice)}~`);
    message = message.replace('{preco_de}', `De: ~${formatBRL(originalPrice)}~`);
  } else {
    message = message.replace(/^.*\{preco_de\}.*$/gm, '');
  }

  // Desconto
  if (discountPct && discountPct > 0 && currentPrice > 0) {
    message = message.replace('{desconto}', `-${Math.round(discountPct)}% OFF`);
  } else {
    message = message.replace(/\(\s*\{desconto\}\s*\)/g, '');
    message = message.replace('{desconto}', '');
  }

  // Preço POR / Preço Atual (com condição de pagamento Pix / à vista se detectada)
  if (currentPrice && currentPrice > 0) {
    const formattedPor = `${formatBRL(currentPrice)}${currentPriceCondition ? ' ' + currentPriceCondition : ''}`;
    message = message.replace(/R\$\s*\{preco_por\}/gi, formattedPor);
    message = message.replace('{preco_por}', formattedPor);
    message = message.replace(/R\$\s*\{preco\}/gi, formattedPor);
    message = message.replace('{preco}', formattedPor);
  } else {
    message = message.replace(/^.*\{preco_por\}.*$/gm, '');
    message = message.replace(/^.*\{preco\}.*$/gm, '');
  }

  // Preço OU (Parcelamento / Condição alternativa)
  const cleanOu = ouPriceText?.trim();
  if (cleanOu) {
    const formattedOu = cleanOu.toLowerCase().startsWith('ou') ? cleanOu : `Ou ${cleanOu}`;
    if (message.includes('{preco_ou}') || message.includes('{ou}')) {
      message = message.replace('{preco_ou}', `💳 *${formattedOu}*`);
      message = message.replace('{ou}', `💳 *${formattedOu}*`);
    } else {
      message = message.replace(/(🔥\s*\*Por[^\n]+\*)/, `$1\n💳 *${formattedOu}*`);
    }
  } else {
    message = message.replace(/^.*\{preco_ou\}.*$/gm, '');
    message = message.replace(/^.*\{ou\}.*$/gm, '');
  }

  // Cupom
  if (couponCode && couponCode.trim()) {
    const cleanCoupon = couponCode.trim().toUpperCase();
    const couponLine = `🎟️ Cupom: *${cleanCoupon}*${
      couponDiscount ? ` (${couponDiscount})` : ''
    }`;
    if (message.includes('{cupom}')) {
      message = message.replace('{cupom}', couponLine);
    } else {
      message = message.replace(/(\n+🛒|\n+👉)/, `\n\n${couponLine}$1`);
    }
  } else {
    message = message.replace(/^.*\{cupom\}.*$/gm, '');
  }

  // Remover parênteses vazios residuais
  message = message.replace(/\(\s*\)/g, '');

  // Link
  message = message.replace('{link}', affiliateUrl);

  // Marca d'água
  message = message.replace('{marca_dagua}', watermarkText);

  // Limpar linhas vazias repetidas
  message = message.replace(/\n{3,}/g, '\n\n').trim();

  return message;
}
