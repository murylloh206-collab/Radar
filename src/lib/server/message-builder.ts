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

  // Remove termos como achados/achadinhos
  cleaned = cleaned.replace(/\b(achadinhos?|achados?)\b/gi, 'ofertas');

  // Remove emojis repetitivos consecutivos (ex: 🔥🔥🔥🔥 -> 🔥)
  cleaned = cleaned.replace(/([🔥⚡🚨💥👏💪👟📱⌚💎✨🎉🛒])\1+/gu, '$1');

  // Normaliza quebras de linha excessivas
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

/**
 * Modelo padrão comercial aprovado do Radar de Ofertas:
 * - 1 único gancho comercial de abertura
 * - Nome do produto em linha dedicada
 * - Bloco de preços compacto com formatação nativa do WhatsApp (riscado ~ e negrito *)
 * - Desconto positivo e limpo: 34% OFF (sem sinal negativo e sem parênteses extras)
 * - Condição Pix opcional somente quando confirmada
 * - Cupom opcional somente quando válido
 * - Link destacado
 * - Assinatura curta: 🎯 Radar de Ofertas
 */
export const DEFAULT_TEMPLATE = `\
{gancho}

{titulo}

{preco_de}
🔥 *Por {preco_por}*
{desconto}
{preco_ou}
{cupom}

🛒 Confira a oferta:
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
    watermarkText = '🎯 Radar de Ofertas',
  } = options;

  let message = templateText;

  // 1. Título limpo do produto
  let cleanTitle = (title || '').trim().replace(/^[\s*~_-]+|[\s*~_-]+$/g, '');

  // 2. Validação Matemática Rigorosa de Desconto
  // Fórmula: ((precoOriginal - precoPromocional) / precoOriginal) * 100
  let calculatedDiscount: number | undefined = undefined;
  if (originalPrice && currentPrice && originalPrice > currentPrice && originalPrice > 0 && currentPrice > 0) {
    const rawCalc = ((originalPrice - currentPrice) / originalPrice) * 100;
    if (rawCalc >= 1 && rawCalc <= 95) {
      calculatedDiscount = Math.round(rawCalc);
    }
  } else if (discountPct && discountPct > 0 && discountPct < 100) {
    calculatedDiscount = Math.round(discountPct);
  }

  // 3. Gancho Inteligente: Exatamente UM ÚNICO gancho principal no topo da mensagem
  let hook = options.hookText?.trim();
  if (!hook) {
    hook = generateSmartHook(cleanTitle, { discountPct: calculatedDiscount });
  }

  // Prevenir duplicação se o cleanTitle acidentalmente repetiu o gancho
  const normalizedHook = hook.replace(/[🔥⚡🚨💥👏💪👟📱⌚💎✨🎉🛒!]/gu, '').trim().toUpperCase();
  const normalizedTitle = cleanTitle.replace(/[🔥⚡🚨💥👏💪👟📱⌚💎✨🎉🛒!]/gu, '').trim().toUpperCase();
  if (normalizedHook.length > 5 && (normalizedTitle === normalizedHook || normalizedTitle.includes(normalizedHook))) {
    cleanTitle = '';
  }

  message = message.replace('{gancho}', hook);
  message = message.replace('{titulo}', cleanTitle ? (cleanTitle.startsWith('*') ? cleanTitle : `*${cleanTitle}*`) : '');

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

  // 5. Preço POR (Promocional / Atual)
  if (currentPrice && currentPrice > 0) {
    const conditionText = currentPriceCondition ? ` ${currentPriceCondition.trim()}` : '';
    const formattedPor = `${formatBRL(currentPrice)}${conditionText}`;

    // Substitui placeholders flexíveis (com ou sem 'Por:', com ou sem 'R$')
    message = message.replace(/Por:?\s*R\$\s*\{preco_por\}/gi, `Por ${formattedPor}`);
    message = message.replace(/Por:?\s*\{preco_por\}/gi, `Por ${formattedPor}`);
    message = message.replace(/R\$\s*\{preco_por\}/gi, formattedPor);
    message = message.replace('{preco_por}', formattedPor);
    message = message.replace(/Por:?\s*R\$\s*\{preco\}/gi, `Por ${formattedPor}`);
    message = message.replace(/Por:?\s*\{preco\}/gi, `Por ${formattedPor}`);
    message = message.replace(/R\$\s*\{preco\}/gi, formattedPor);
    message = message.replace('{preco}', formattedPor);
  } else {
    message = message.replace(/^[^\n]*\{preco_por\}[^\n]*\n?/gm, '');
    message = message.replace(/^[^\n]*\{preco\}[^\n]*\n?/gm, '');
  }

  // 6. Selo de Desconto: Formato oficial "34% OFF" (sem sinal negativo '-', sem parênteses extras)
  if (calculatedDiscount && calculatedDiscount > 0 && calculatedDiscount < 100) {
    const discountStr = `${Math.round(calculatedDiscount)}% OFF`;
    message = message.replace(/\(?\{desconto\}\)?/g, discountStr);
  } else {
    message = message.replace(/^[^\n]*\(?\{desconto\}\)?[^\n]*\n?/gm, '');
  }

  // Remove qualquer parênteses duplicados remanescentes ou sinais negativos de desconto
  message = message.replace(/\(\((-?\d+%?\s*OFF)\)\)/gi, '$1');
  message = message.replace(/\(-(\d+%\s*OFF)\)/gi, '$1');
  message = message.replace(/-\s*(\d+%\s*OFF)/gi, '$1');

  // 7. Preço Alternativo / Parcelamento ("Ou ...")
  const cleanOu = ouPriceText?.trim();
  if (cleanOu) {
    const formattedOu = cleanOu.toLowerCase().startsWith('ou') ? cleanOu : `Ou ${cleanOu}`;
    const ouLine = `💳 *${formattedOu}*`;
    if (message.includes('{preco_ou}') || message.includes('{ou}')) {
      message = message.replace('{preco_ou}', ouLine);
      message = message.replace('{ou}', ouLine);
    } else {
      message = message.replace(/(🔥\s*\*Por[^\n]+\*)/, `$1\n${ouLine}`);
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

  // 10. Assinatura Discreta da Marca (🎯 Radar de Ofertas)
  let cleanSignature = watermarkText.replace(/—\s*Produtos que valem a pena!/gi, '').trim();
  if (!cleanSignature) cleanSignature = '🎯 Radar de Ofertas';
  message = message.replace('{marca_dagua}', cleanSignature);

  // Limpeza final de espaçamentos, linhas vazias consecutivas e parênteses órfãos
  message = message.replace(/\(\s*\)/g, '');
  message = message.replace(/^[ \t]+/gm, ''); // Remove espaços no início de linhas
  message = message.replace(/[ \t]+$/gm, ''); // Remove espaços no final das linhas
  message = message.replace(/\n{3,}/g, '\n\n').trim(); // Máximo de 1 linha em branco entre blocos

  return message;
}
