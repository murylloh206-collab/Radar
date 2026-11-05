import { generateSmartHook, detectProductCategory } from './hook-generator';

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
 * e elimina termos terminantemente proibidos como "achado", "achadinho", "achados".
 */
export function sanitizeCopiedText(rawText: string): string {
  let cleaned = rawText;

  // Remove URLs antigas/terceiros
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, '');

  // Remove convites e arrobas de canais concorrentes
  cleaned = cleaned.replace(/@(todos|canalde|achadinhos|promos|canal\w+|achados\w*)/gi, '');
  cleaned = cleaned.replace(/entre no nosso grupo|canal vip|siga nosso canal|link na bio|corre que acaba|últimas unidades/gi, '');

  // Elimina termos proibidos
  cleaned = cleaned.replace(/\b(achadinhos?|achados?)\b/gi, 'ofertas');

  // Elimina a palavra "apenas" em contextos de preço
  cleaned = cleaned.replace(/\bpor\s+apenas\b/gi, 'Por');
  cleaned = cleaned.replace(/\bapenas\s+hoje\b/gi, 'Hoje');

  // Remove emojis repetitivos consecutivos (ex: 🔥🔥🔥🔥 -> 🔥)
  cleaned = cleaned.replace(/([🔥⚡🚨💥👏💪👟📱⌚💎✨🎉🛒])\1+/gu, '$1');

  // Normaliza quebras de linha excessivas
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

/**
 * Modelo comercial aprovado do Radar de Ofertas:
 * - 1 único gancho comercial de abertura (75% Direto / 25% Seletivo)
 * - Nome real do produto OBRIGATÓRIO em negrito (*{titulo}*)
 * - Bloco de preços com formatação nativa do WhatsApp (riscado ~ e negrito *)
 * - Sem a palavra "apenas" (sempre "Por R$ ...")
 * - Desconto limpo e positivo: "45% OFF" (sem sinal de menos e sem parênteses extras)
 * - Condição Pix opcional somente quando confirmada
 * - Cupom opcional somente quando válido
 * - Link de afiliado limpo em destaque
 * - Assinatura discreta: 🎯 Radar de Ofertas
 */
export const DEFAULT_TEMPLATE = `\
{gancho}

*{titulo}*

{preco_de}
🔥 *Por {preco_por}* {desconto}
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
    watermarkText = '🎯 Radar de Ofertas',
  } = options;

  // 1. Sanitizar template de entrada contra configurações antigas salvas no banco
  let message = (templateText || DEFAULT_TEMPLATE)
    .replace(/por\s+apenas:?\s*/gi, 'Por ')
    .replace(/por\s+somente:?\s*/gi, 'Por ')
    .replace(/s[óo]\s+por:?\s*/gi, 'Por ')
    .replace(/\(\(\{desconto\}\)\)/gi, '{desconto}')
    .replace(/\(\{desconto\}\)/gi, '{desconto}')
    .replace(/\b(achadinhos?|achados?)\b/gi, 'ofertas');

  // 2. Título do Produto OBRIGATÓRIO (NUNCA pode ser vazio ou apagado)
  let cleanTitle = (title || '').trim().replace(/^[\s*~_#-]+|[\s*~_#-]+$/g, '');
  if (!cleanTitle || cleanTitle.length < 3 || cleanTitle.toLowerCase() === 'produto' || cleanTitle.toLowerCase() === 'oferta') {
    const category = detectProductCategory(title || '');
    const categoryLabels: Record<string, string> = {
      tenis: 'Tênis Esportivo / Casual',
      caixa_de_som: 'Caixa de Som Portátil Bluetooth',
      suplementos: 'Suplemento Nutricional',
      smartphones: 'Smartphone',
      perfumes: 'Perfume / Fragrância',
      relogios: 'Relógio Smartwatch',
      ferramentas: 'Ferramenta / Equipamento',
      eletrodomesticos: 'Eletroportátil para Casa',
      roupas: 'Peça de Vestuário',
      automotivo: 'Item Automotivo',
      beleza: 'Produto de Cuidado Pessoal',
      eletronicos: 'Dispositivo Eletrônico',
      games: 'Acessório Gamer',
      geral: 'Produto em Oferta Especial',
    };
    cleanTitle = categoryLabels[category] || 'Produto em Destaque';
  }

  // 3. Validação Matemática Rigorosa de Desconto
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

  // 4. Gancho Inteligente: Exatamente UM ÚNICO gancho principal no topo da mensagem
  let hook = options.hookText?.trim();
  if (!hook) {
    hook = generateSmartHook(cleanTitle, { discountPct: calculatedDiscount });
  }

  // Se o título for idêntico ou muito parecido com o gancho, ajustamos o gancho para uma chamada direta
  // para NUNCA apagar o nome do produto! O nome do produto é inegociável.
  const normalizedHook = hook.replace(/[🔥⚡🚨💥👏💪👟📱⌚💎✨🎉🛒!]/gu, '').trim().toUpperCase();
  const normalizedTitle = cleanTitle.replace(/[🔥⚡🚨💥👏💪👟📱⌚💎✨🎉🛒!]/gu, '').trim().toUpperCase();
  if (normalizedHook.length > 5 && (normalizedTitle === normalizedHook || normalizedTitle.includes(normalizedHook))) {
    // Altera o gancho para a chamada direta padrão da categoria
    const category = detectProductCategory(cleanTitle);
    hook = `OFERTA ESPECIAL EM ${category.toUpperCase().replace(/_/g, ' ')}! 🎯`;
  }

  message = message.replace('{gancho}', hook);

  // Substitui o título mantendo formatação em negrito WhatsApp (*Nome do Produto*)
  const formattedTitle = cleanTitle.startsWith('*') && cleanTitle.endsWith('*') ? cleanTitle : `*${cleanTitle}*`;
  message = message.replace(/\*?\{titulo\}\*?/gi, formattedTitle);

  // 5. Preço DE (Original)
  // Regra inegociável: SÓ exibe se existir de verdade e for estritamente maior que o preço atual
  if (originalPrice && originalPrice > 0 && currentPrice > 0 && originalPrice > currentPrice) {
    const formattedDe = formatBRL(originalPrice);
    message = message.replace(/~?R\$\s*\{preco_de\}~?/gi, `~${formattedDe}~`);
    message = message.replace('{preco_de}', `De: ~${formattedDe}~`);
  } else {
    // Remove a linha inteira do Preço De se não for confiável
    message = message.replace(/^[^\n]*\{preco_de\}[^\n]*\n?/gm, '');
  }

  // 6. Preço POR (Promocional / Atual)
  if (currentPrice && currentPrice > 0) {
    const conditionText = currentPriceCondition ? ` ${currentPriceCondition.trim()}` : '';
    const formattedPor = `${formatBRL(currentPrice)}${conditionText}`;

    // Substitui placeholders flexíveis (forçando SEMPRE 'Por' sem 'apenas')
    message = message.replace(/Por(?:\s+apenas)?:?\s*R\$\s*\{preco_por\}/gi, `Por ${formattedPor}`);
    message = message.replace(/Por(?:\s+apenas)?:?\s*\{preco_por\}/gi, `Por ${formattedPor}`);
    message = message.replace(/R\$\s*\{preco_por\}/gi, formattedPor);
    message = message.replace('{preco_por}', formattedPor);

    message = message.replace(/Por(?:\s+apenas)?:?\s*R\$\s*\{preco\}/gi, `Por ${formattedPor}`);
    message = message.replace(/Por(?:\s+apenas)?:?\s*\{preco\}/gi, `Por ${formattedPor}`);
    message = message.replace(/R\$\s*\{preco\}/gi, formattedPor);
    message = message.replace('{preco}', formattedPor);
  } else {
    message = message.replace(/^[^\n]*\{preco_por\}[^\n]*\n?/gm, '');
    message = message.replace(/^[^\n]*\{preco\}[^\n]*\n?/gm, '');
  }

  // 7. Selo de Desconto: Formato oficial "45% OFF" (sem sinal negativo '-', sem parênteses extras)
  if (calculatedDiscount && calculatedDiscount > 0 && calculatedDiscount < 100) {
    const discountStr = `(${Math.round(calculatedDiscount)}% OFF)`;
    // Substitui {desconto} com ou sem parênteses no template
    message = message.replace(/\(?\{desconto\}\)?/gi, discountStr);
  } else {
    message = message.replace(/\s*\(?\{desconto\}\)?/gi, '');
  }

  // Normalização estrita do desconto: transforma qualquer ((-45% OFF)) ou (-45% OFF) em 45% OFF limpo
  message = message.replace(/\(\(\s*-?(\d+%\s*OFF)\s*\)\)/gi, '($1)');
  message = message.replace(/\(\s*-(\d+%\s*OFF)\s*\)/gi, '($1)');
  message = message.replace(/-\s*(\d+%\s*OFF)/gi, '$1');

  // 8. Preço Alternativo / Parcelamento ("Ou ...")
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

  // 9. Cupom Promocional
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

  // 10. Link de Afiliado em linha dedicada
  message = message.replace('{link}', affiliateUrl.trim());

  // 11. Assinatura Discreta da Marca (🎯 Radar de Ofertas)
  let cleanSignature = watermarkText.replace(/—\s*Produtos que valem a pena!/gi, '').trim();
  if (!cleanSignature) cleanSignature = '🎯 Radar de Ofertas';
  message = message.replace('{marca_dagua}', cleanSignature);

  // Sanitização final de redundâncias e parênteses órfãos
  message = message.replace(/\bpor\s+apenas\b/gi, 'Por');
  message = message.replace(/\b(achadinhos?|achados?)\b/gi, 'ofertas');
  message = message.replace(/\(\s*\)/g, '');
  message = message.replace(/^[ \t]+/gm, ''); // Remove espaços no início de linhas
  message = message.replace(/[ \t]+$/gm, ''); // Remove espaços no final das linhas
  message = message.replace(/\n{3,}/g, '\n\n').trim(); // Máximo de 1 linha em branco entre blocos

  return message;
}
