import { generateSmartHook } from './hook-generator';

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
 * Remove menções a outros canais (@canal, t.me, links de grupos alheios, telefones, excessos de emojis)
 */
export function sanitizeCopiedText(rawText: string): string {
  let cleaned = rawText;

  // Remove URLs antigas/terceiros
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, '');

  // Remove convites e arrobas de canais concorrentes
  cleaned = cleaned.replace(/@(todos|canalde|achadinhos|promos|canal\w+|achados\w*)/gi, '');
  cleaned = cleaned.replace(/entre no nosso grupo|canal vip|siga nosso canal|link na bio|corre que acaba|últimas unidades/gi, '');

  // Remove emojis repetitivos consecutivos (ex: 🔥🔥🔥🔥 -> 🔥)
  cleaned = cleaned.replace(/([🔥⚡🚨💥👏💪👟📱⌚💎✨🎉🛒])\1+/gu, '$1');

  // Normaliza quebras de linha excessivas
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

/**
 * Modelo padrão comercial aprovado do Radar de Ofertas:
 * Organizado, legível, com gancho contextual, preços claros e fechamento discreto.
 */
export const DEFAULT_TEMPLATE = `\
{gancho}

*{titulo}*

{preco_de}
🔥 *Por: {preco_por}* {desconto}
{preco_ou}
{cupom}

🛒 *Confira a oferta:*
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
    watermarkText = '🎯 *Radar de Ofertas*',
  } = options;

  let message = templateText;

  // 1. Título limpo
  const cleanTitle = title.trim().replace(/^[\s*~_-]+|[\s*~_-]+$/g, '');

  // 2. Gancho Inteligente: Se não foi fornecido gancho customizado, gera baseado na categoria do produto
  let hook = options.hookText?.trim();
  if (!hook) {
    hook = generateSmartHook(cleanTitle, { discountPct });
  }
  message = message.replace('{gancho}', hook);
  message = message.replace('{titulo}', cleanTitle);

  // 3. Validação Matemática de Desconto
  let calculatedDiscount = discountPct;
  if (originalPrice && currentPrice && originalPrice > currentPrice) {
    const rawCalc = ((originalPrice - currentPrice) / originalPrice) * 100;
    // Desconto só é válido se estiver entre 1% e 95% (evita absurdos como 99% em erros de centavos)
    if (rawCalc >= 1 && rawCalc <= 95) {
      calculatedDiscount = Math.round(rawCalc);
    } else {
      calculatedDiscount = undefined;
    }
  }

  // 4. Preço DE (Original)
  // Regra inegociável: SÓ exibe se existir de verdade e for estritamente maior que o preço atual
  if (originalPrice && originalPrice > 0 && currentPrice > 0 && originalPrice > currentPrice) {
    const formattedDe = formatBRL(originalPrice);
    message = message.replace(/~?R\$\s*\{preco_de\}~?/gi, `~${formattedDe}~`);
    message = message.replace('{preco_de}', `De: ~${formattedDe}~`);
  } else {
    // Remove a linha inteira do Preço De se não for confiável
    message = message.replace(/^[^\n]*\{preco_de\}[^\n]*\n?/gm, '');
  }

  // 5. Selo de Desconto
  if (calculatedDiscount && calculatedDiscount > 0 && calculatedDiscount < 100) {
    message = message.replace('{desconto}', `(-${Math.round(calculatedDiscount)}% OFF)`);
  } else {
    message = message.replace(/\(?\{desconto\}\)?/g, '');
  }

  // 6. Preço POR (Promocional / Atual)
  if (currentPrice && currentPrice > 0) {
    const conditionText = currentPriceCondition ? ` ${currentPriceCondition.trim()}` : '';
    const formattedPor = `${formatBRL(currentPrice)}${conditionText}`;
    message = message.replace(/R\$\s*\{preco_por\}/gi, formattedPor);
    message = message.replace('{preco_por}', formattedPor);
    message = message.replace(/R\$\s*\{preco\}/gi, formattedPor);
    message = message.replace('{preco}', formattedPor);
  } else {
    message = message.replace(/^[^\n]*\{preco_por\}[^\n]*\n?/gm, '');
    message = message.replace(/^[^\n]*\{preco\}[^\n]*\n?/gm, '');
  }

  // 7. Preço Alternativo / Parcelamento ("Ou ...")
  const cleanOu = ouPriceText?.trim();
  if (cleanOu) {
    const formattedOu = cleanOu.toLowerCase().startsWith('ou') ? cleanOu : `Ou ${cleanOu}`;
    if (message.includes('{preco_ou}') || message.includes('{ou}')) {
      message = message.replace('{preco_ou}', `💳 *${formattedOu}*`);
      message = message.replace('{ou}', `💳 *${formattedOu}*`);
    } else {
      message = message.replace(/(🔥\s*\*Por:[^\n]+\*)/, `$1\n💳 *${formattedOu}*`);
    }
  } else {
    message = message.replace(/^[^\n]*\{preco_ou\}[^\n]*\n?/gm, '');
    message = message.replace(/^[^\n]*\{ou\}[^\n]*\n?/gm, '');
  }

  // 8. Cupom Promocional
  if (couponCode && couponCode.trim()) {
    const cleanCoupon = couponCode.trim().toUpperCase();
    const discountSuffix = couponDiscount ? ` (${couponDiscount})` : '';
    const couponLine = `🎟️ Cupom: *${cleanCoupon}*${discountSuffix}`;
    if (message.includes('{cupom}')) {
      message = message.replace('{cupom}', couponLine);
    } else {
      message = message.replace(/(\n+🛒|\n+👉)/, `\n\n${couponLine}$1`);
    }
  } else {
    message = message.replace(/^[^\n]*\{cupom\}[^\n]*\n?/gm, '');
  }

  // 9. Link de Afiliado em linha dedicada
  message = message.replace('{link}', affiliateUrl.trim());

  // 10. Assinatura Discreta da Marca
  message = message.replace('{marca_dagua}', watermarkText.trim());

  // Limpeza final de espaçamentos e parênteses órfãos
  message = message.replace(/\(\s*\)/g, '');
  message = message.replace(/[ \t]+$/gm, ''); // Remove espaços no final das linhas
  message = message.replace(/\n{3,}/g, '\n\n').trim(); // Máximo de 1 linha em branco entre blocos

  return message;
}
