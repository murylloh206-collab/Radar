import 'server-only';
import { runtimeDatabase } from './copier-runtime-context';
import {
  CopySource,
  IncomingMessage,
  ProductItem,
  PublicationJob,
  StoreCredential,
  StoreName,
} from '../types';
import { convertToAffiliateLink } from './affiliate-converter';
import { getStoreCredentialsMapWithSecrets } from './credentials-vault';
import { buildWhatsAppMessage, sanitizeCopiedText } from './message-builder';
import { evaluateOfferQuality } from './quality-engine';
import {
  readDatabase,
  writeDatabase,
  ensureValidUuid,
  savePublicationJob,
  saveProductToCatalog,
  saveOfferEvaluation,
  saveIncomingMessageRecord,
  getActiveEvolutionConfig,
} from './storage';
import { isTestIsolationActive } from '../supabase';
import { fetchProductRealData } from './product-fetcher';
import { processRadarArt, selectBestProductPhoto } from './radar-art-engine';
import { checkOfferContent, isJunkProductTitle } from './offer-content-guard';
import { optimizeProductImageForWhatsApp } from './product-image-optimizer';
import { runWorkerCycle } from './worker-engine';
import { getDailyOfferQuotaStatus } from './plan-guard';
import { recordOfferPriceHistory } from './price-history';
import { getBrandSettings } from './brand-settings';

export interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
      id?: string;
      participant?: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: {
        text?: string;
      };
      imageMessage?: {
        caption?: string;
        url?: string;
      };
    };
  };
}

export interface CopierProcessResult {
  accepted: boolean;
  messageId: string;
  status: 'recebida' | 'processada' | 'descartada' | 'erro';
  reason: string;
  jobIds?: string[];
}

export function stripInvisibleChars(text: string): string {
  return String(text || '').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
}

export function extractWhatsAppMessageText(messageData: Record<string, any> | undefined): string {
  if (!messageData) return '';
  const rootMsg =
    messageData.message && typeof messageData.message === 'object' && !messageData.extendedTextMessage && !messageData.conversation
      ? messageData.message
      : messageData;

  // Desempacotar mensagens efêmeras, de visualização única ou com legendas
  const innerMsg =
    rootMsg.ephemeralMessage?.message ||
    rootMsg.viewOnceMessage?.message ||
    rootMsg.viewOnceMessageV2?.message ||
    rootMsg.documentWithCaptionMessage?.message ||
    rootMsg;

  const text =
    innerMsg?.conversation ||
    innerMsg?.extendedTextMessage?.text ||
    innerMsg?.imageMessage?.caption ||
    innerMsg?.videoMessage?.caption ||
    innerMsg?.documentMessage?.caption ||
    innerMsg?.buttonsResponseMessage?.selectedDisplayText ||
    innerMsg?.templateButtonReplyMessage?.selectedDisplayText ||
    innerMsg?.listResponseMessage?.title ||
    '';

  return stripInvisibleChars(String(text || '')).trim();
}

export function extractUrlsFromText(text: string): string[] {
  const cleaned = stripInvisibleChars(text);
  const urlRegex = /(https?:\/\/[^\s`'"<>]+)/gi;
  const matches = cleaned.match(urlRegex) || [];
  return Array.from(
    new Set(matches.map((u) => stripInvisibleChars(u).replace(/[),.;!*_~`]+$/, '')))
  );
}

export function normalizeOfferUrlForDedup(rawUrl?: string | null): string {
  if (!rawUrl) return '';
  const cleaned = stripInvisibleChars(String(rawUrl)).trim().replace(/[),.;!*_~`]+$/, '');
  if (!cleaned.startsWith('http')) return '';
  try {
    const parsed = new URL(cleaned);
    // Remove parâmetros de tracking de canal ou sessão
    const trackingParams = [
      'src',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'matt_word',
      'matt_tool',
      'forceInApp',
      'ref',
      'social_share',
    ];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname.replace(/\/+$/, '');
    const search = parsed.searchParams.toString();
    return `${host}${pathname}${search ? '?' + search : ''}`;
  } catch {
    return cleaned.toLowerCase();
  }
}

export function extractCanonicalProductId(urlOrId?: string | null): string {
  if (!urlOrId) return '';
  const str = stripInvisibleChars(String(urlOrId));
  const mlbMatch = str.match(/\b(MLB-?\d{7,15})\b/i);
  if (mlbMatch) {
    return `mlb:${mlbMatch[1].toUpperCase().replace('-', '')}`;
  }
  const shopeeItemMatch =
    str.match(/\/product\/(\d+)\/(\d+)/i) || str.match(/i\.(\d+)\.(\d+)/i);
  if (shopeeItemMatch) {
    return `shopee:${shopeeItemMatch[1]}:${shopeeItemMatch[2]}`;
  }
  return '';
}

export function normalizeProductTitleForDedup(title?: string | null): string {
  if (!title) return '';
  const clean = stripInvisibleChars(String(title))
    .replace(/^[*_~`]+|[*_~`]+$/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < 12) return '';
  if (isPromotionalHookLine(title)) return '';
  return clean;
}

export function extractProductTitleFromFormattedMessage(messageText?: string | null): string {
  if (!messageText) return '';
  const lines = stripInvisibleChars(String(messageText))
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (
      line.startsWith('De:') ||
      line.startsWith('~De') ||
      line.startsWith('De ~') ||
      line.startsWith('Por ') ||
      line.startsWith('💰') ||
      line.startsWith('🔥') ||
      line.startsWith('💳') ||
      line.startsWith('🎟️') ||
      line.startsWith('🛒') ||
      line.startsWith('🎯') ||
      line.startsWith('http')
    ) {
      continue;
    }
    const stripped = line
      .replace(/^(?:📦|🛍️|🏷️|✨)\s*/u, '')
      .replace(/^[*_~`]+|[*_~`]+$/g, '')
      .trim();
    if (!isPromotionalHookLine(stripped) && stripped.length >= 8) {
      return stripped;
    }
  }
  return '';
}

export function computeIncomingOfferFingerprint(rawText: string): {
  urls: string[];
  normalizedUrls: string[];
  normalizedText: string;
} {
  const urls = extractUrlsFromText(rawText)
    .map((u) => normalizeOfferUrlForDedup(u))
    .filter(Boolean);
  const normalizedText = stripInvisibleChars(rawText)
    .replace(/https?:\/\/[^\s]+/gi, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim();
  return { urls, normalizedUrls: urls, normalizedText };
}

export interface DuplicateCheckCandidate {
  targetJid: string;
  affiliateUrl?: string | null;
  originalUrl?: string | null;
  cleanUrl?: string | null;
  externalId?: string | null;
  productTitle?: string | null;
}

export function isDuplicateOfferJob(
  candidate: DuplicateCheckCandidate,
  existingJobs: Array<
    Partial<PublicationJob> & {
      runtimeDelivery?: string | null;
      cleanUrl?: string | null;
      externalId?: string | null;
    }
  >,
  windowHours = 24
): boolean {
  const cutoffMs = Date.now() - windowHours * 60 * 60 * 1000;
  const candAff = normalizeOfferUrlForDedup(candidate.affiliateUrl);
  const candOrig = normalizeOfferUrlForDedup(candidate.originalUrl);
  const candClean = normalizeOfferUrlForDedup(candidate.cleanUrl);
  const candCanonId =
    extractCanonicalProductId(candidate.externalId) ||
    extractCanonicalProductId(candidate.cleanUrl) ||
    extractCanonicalProductId(candidate.originalUrl);
  const candTitle = normalizeProductTitleForDedup(candidate.productTitle);

  return existingJobs.some((j) => {
    if (!j || j.targetJid !== candidate.targetJid) return false;

    const status = String(j.status || '');
    const delivery = String(
      j.runtimeDelivery || (j as any).runtime_delivery || ''
    );

    // Inclui 'enviado', 'agendado', 'enviando' e qualquer job com delivery 'accepted' ou 'uncertain'
    const isActiveOrDelivered =
      status === 'enviado' ||
      status === 'agendado' ||
      status === 'enviando' ||
      delivery === 'accepted' ||
      delivery === 'uncertain';

    if (!isActiveOrDelivered) return false;

    const refTimeStr = j.sentAt || j.createdAt || j.updatedAt || j.scheduledFor;
    if (refTimeStr) {
      const t = new Date(refTimeStr).getTime();
      if (!isNaN(t) && t < cutoffMs) return false;
    }

    const jobAff = normalizeOfferUrlForDedup(j.affiliateUrl);
    const jobOrig = normalizeOfferUrlForDedup(j.originalUrl);
    const jobClean = normalizeOfferUrlForDedup(j.cleanUrl);
    const jobCanonId =
      extractCanonicalProductId(j.externalId) ||
      extractCanonicalProductId(j.cleanUrl) ||
      extractCanonicalProductId(j.originalUrl);

    if (candAff && (candAff === jobAff || candAff === jobOrig || candAff === jobClean)) {
      return true;
    }
    if (candOrig && (candOrig === jobOrig || candOrig === jobAff || candOrig === jobClean)) {
      return true;
    }
    if (candClean && (candClean === jobClean || candClean === jobOrig || candClean === jobAff)) {
      return true;
    }
    if (candCanonId && jobCanonId && candCanonId === jobCanonId) {
      return true;
    }

    if (candTitle) {
      const existingTitle = normalizeProductTitleForDedup(
        extractProductTitleFromFormattedMessage(j.messageText)
      );
      if (existingTitle && candTitle === existingTitle) {
        return true;
      }
    }

    return false;
  });
}

async function shortenUrlForWhatsApp(url: string): Promise<string> {
  if (!url || !url.startsWith('http')) return url;
  // Se já for um link curto nativo (Shopee s.shopee.com.br / shope.ee, Mercado Livre /sec/ ou meli.la, is.gd, tinyurl), mantém como está
  if (
    url.length <= 45 ||
    /s\.shopee\.com\.br|shope\.ee|meli\.la|mercadolivre\.com\.br\/sec\/|is\.gd\/|tinyurl\.com\/|amazon\.com(\.br)?\/dp\/|amzn\.to\//i.test(url)
  ) {
    return url;
  }

  // 1. Tenta encurtar via is.gd (rápido e redirecionamento 301 direto)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (res.ok) {
      const short = (await res.text()).trim();
      if (short.startsWith('https://is.gd/')) {
        return short;
      }
    }
  } catch {
    // fallback para tinyurl
  }

  // 2. Fallback via TinyURL API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (res.ok) {
      const short = (await res.text()).trim();
      if (short.startsWith('https://tinyurl.com/')) {
        return short;
      }
    }
  } catch {
    // mantém a URL original caso ambos falhem
  }

  return url;
}

function orderCandidateProductUrls(rawText: string, urls: string[]): string[] {
  if (urls.length <= 1) return urls;
  const lines = rawText.split(/\r?\n/);

  const scored = urls.map((url, idx) => {
    let score = idx; // por padrão, o link do produto costuma vir por último após o link de cupom
    const lineIdx = lines.findIndex((l) => l.includes(url));
    const context =
      lineIdx >= 0
        ? `${lines[lineIdx - 1] || ''} ${lines[lineIdx] || ''}`.toLowerCase()
        : '';

    if (context.includes('cupom') || context.includes('resgate')) {
      score -= 10;
    }
    if (
      context.includes('link do produto') ||
      context.includes('compre') ||
      context.includes('🛒')
    ) {
      score += 10;
    }
    return { url, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.url);
}

function parseBRLNumber(rawNum: string): number {
  const cleaned = rawNum.trim().replace(/\s/g, '');
  if (!cleaned) return 0;
  // Formato 1.349,90 ou 1.349
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.')) || 0;
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, '')) || 0;
  }
  return parseFloat(cleaned) || 0;
}

export function extractTitleFromProductUrl(urlStr: string): string | undefined {
  try {
    const url = new URL(urlStr);
    const pathname = decodeURIComponent(url.pathname);
    const parts = pathname.split('/').filter(p => p && p !== 'p' && p !== 'dp' && p !== 'gp' && p !== 'product' && !/^MLB\d+/i.test(p) && !/^B0[A-Z0-9]+/i.test(p));
    const candidate = parts.find(p => p.includes('-') && p.length >= 8);
    if (!candidate) return undefined;
    const clean = candidate
      .replace(/-[A-Z0-9]{3,}-[0-9]+$/i, '')
      .replace(/-p$/i, '')
      .replace(/[-_+]+/g, ' ')
      .trim();
    if (clean.length < 4) return undefined;
    return clean
      .split(' ')
      .filter(w => w.length > 0)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  } catch {
    return undefined;
  }
}

export function isPromotionalHookLine(line: string): boolean {
  const clean = stripInvisibleChars(line)
    .replace(/^[*_~`]+|[*_~`]+$/g, '')
    .trim();
  if (!clean || clean.length < 4) return true;
  const lower = clean.toLowerCase();

  // Termina com exclamação, interrogação (mesmo seguidos de emojis) ou com qualquer emoji Unicode
  if (/(?:[!?]\s*(?:\p{Extended_Pictographic}|\uFE0F|\u200D|\s)*|(?:\p{Extended_Pictographic}|\uFE0F))$/u.test(clean)) {
    return true;
  }

  // Frases de abertura ou slogans de marketing comuns em grupos de ofertas
  const hookPrefixes = [
    'quando a', 'um desconto', 'quem curte', 'olha esse', 'olha essa', 'olha só',
    'corre que', 'super oferta', 'oportunidade', 'promoção', 'oferta',
    'preço que', 'cheiroso e', 'até a', 'qual dos', 'esse é o', 'essa é a', 'esse já é',
    'bora aproveitar', 'bora', 'não perca', 'achado', 'achadinho', 'imperdível',
    'apenas hoje', 'atenção', 'alerta de', 'baixou o preço', 'caiu o preço',
    '100ml de', '50ml de', 'até o nome', 'de r$', 'por r$', 'de:', 'por:',
    'chega de', 'pra quem', 'para quem', 'aquele', 'aquela', 'aqueles', 'aquelas',
    'mais um', 'mais uma', 'seu carro', 'sua casa', 'tava faltando', 'estava faltando',
    'se liga', 'já pensou', 'já imaginou', 'não deixe', 'não fique', 'quem quer',
    'quem precisa', 'precisando de', 'o básico', 'o modelo', 'o frasco', 'embalagem',
    'espuma pra', 'prepare-se', 'confira', 'achados', 'achadinhos', 'microfibra e praticidade',
    'crisp bar da', 'pra sair de casa', 'lowe summer', 'full hd, smart tv', 'alpha lupus',
    'esse nike', 'a gaveta de', 'nike nos pés', 'destaque em', 'excelente condição',
    'item de destaque', 'produto com desconto', 'preço diferenciado', 'conforto e',
    'já pode parar', 'manda um abraço', 'pra deixar a sua', 'é muita elegância',
    'pra não ficar', 'cupom de ', 'resgate às', 'tutorial para', 'o segredo do', 'baixou',
    'shopping cart icon', 'shopee brasil',
  ];
  if (hookPrefixes.some((prefix) => lower.startsWith(prefix))) return true;

  // Linhas em CAIXA ALTA contendo termos comerciais ou ganchos
  const lettersOnly = clean.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  const isAllCaps = lettersOnly.length > 0 && lettersOnly === lettersOnly.toUpperCase();
  if (isAllCaps) {
    const commercialWords = [
      'DESCONTO', 'OFERTA', 'PREÇO', 'PROMOÇÃO', 'ECONOMIA', 'FESTA',
      'OPORTUNIDADE', 'ROTINA', 'QUALIDADE', 'ATENÇÃO', 'SUPER', 'ESPECIAL',
      'IMPERDÍVEL', 'TECNOLOGIA', 'CELULAR', 'COMPRA', 'LIMPEZA', 'ACHADO',
      'ACHADINHO', 'ACHADOS', 'SAPATEIRA', 'GUERRA', 'ESTILO', 'SWOOSH',
      'CARTÃO', 'CASA', 'VERÃO', 'INVERNO', 'CUPOM', 'CLIMA', 'ABRAÇO', 'CALCINHAS',
      'SEGREDO', 'PULSEIRA INTELIGENTE', 'BAIXOU',
    ];
    if (commercialWords.some((word) => clean.toUpperCase().includes(word))) {
      return true;
    }
  }

  return false;
}

export function extractOfferDetailsFromWhatsAppText(
  rawText: string,
  storeName: string
): {
  title?: string;
  originalPrice?: number;
  currentPrice?: number;
  currentPriceCondition?: string;
  ouText?: string;
  couponCode?: string;
  discountPct?: number;
} {
  let originalPrice: number | undefined;
  let currentPrice: number | undefined;
  let currentPriceCondition: string | undefined;
  let ouText: string | undefined;
  let couponCode: string | undefined;

  // 1. Preço "De" (Preço Original / Anterior)
  // Suporta: ~De R$ 349,99~, De: ~R$ 349,99~, De: R$ 349,99, De 349,90, etc.
  const deMatch =
    rawText.match(/~?\s*de:?\s*(?:r\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:,[0-9]{1,2})?)~/i) ||
    rawText.match(/(?:^|\n)\s*~?\s*de:?\s*(?:r\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:,[0-9]{1,2})?)~?/i) ||
    rawText.match(/de:?\s*(?:r\$\s*)?~?([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:,[0-9]{1,2})?)~?\s*(?:\||por:?|->|-|\n)/i);

  if (deMatch) {
    const p = parseBRLNumber(deMatch[1]);
    if (p > 0) originalPrice = p;
  }

  // 2. Preço "Por" (Preço Promocional Atual e Condição Pix / À vista)
  // Suporta: *Por R$ 236,21 no Pix*, *Por R$ 3.149,00*, Por apenas R$ 99,90, etc.
  const porMatch = rawText.match(
    /(?:^|\n)\s*\*?\s*por(?:\s+apenas)?:?\s*(?:r\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:,[0-9]{1,2})?)(\s*(?:no\s+pix|à\s+vista|no\s+boleto))?\*?/i
  );
  if (porMatch) {
    const p = parseBRLNumber(porMatch[1]);
    if (p > 0) {
      currentPrice = p;
      if (porMatch[2]) currentPriceCondition = porMatch[2].trim();
    }
  }

  // Fallback para Preço Por: "De ... por ..." na mesma linha
  if (!currentPrice) {
    const dePorMatch = rawText.match(
      // Aceita marcação do WhatsApp (*negrito*, _itálico_, ~riscado~) em volta de "Por" e do valor: "De R$409 | Por *R$227*"
      /de:?\s*(?:r\$\s*)?~?([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:,[0-9]{1,2})?)~?\s*(?:\||por:?|->|-|\n)+\s*[*_~]*\s*(?:por(?:\s+apenas)?:?\s*)?[*_~]*\s*(?:r\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:,[0-9]{1,2})?)/i
    );
    if (dePorMatch) {
      const p1 = parseBRLNumber(dePorMatch[1]);
      const p2 = parseBRLNumber(dePorMatch[2]);
      if (p1 > 0 && p2 > 0) {
        if (!originalPrice) originalPrice = p1 > p2 ? p1 : undefined;
        currentPrice = p2;
      }
    }
  }

  // Fallback: R$ em linha que não seja De, Ou ou Cupom
  if (!currentPrice) {
    const lines = rawText.split(/\r?\n/);
    for (const line of lines) {
      if (/cupom|off|desconto|resgate|frete|^[\s~*]*de:?|^[\s*]*ou\s/i.test(line)) {
        continue;
      }
      const rMatch = line.match(/r\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+)/i);
      if (rMatch) {
        const p = parseBRLNumber(rMatch[1]);
        if (p > 0) {
          currentPrice = p;
          break;
        }
      }
    }
  }

  // 3. Preço "Ou" (Parcelamento / Condição alternativa)
  // Suporta: *Ou R$ 277,90 em até 6x*, *Ou R$ 3.499,00 em até 10x*, etc.
  const ouMatch = rawText.match(
    /(?:^|\n)\s*[*_~]?\s*(ou\s+(?:r\$\s*)?[0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?[^\n\r*~_]*)[*_~]?/i
  );
  if (ouMatch) {
    ouText = ouMatch[1].trim();
  }

  // 4. Código do Cupom
  // Suporta: `🔖Utilize o Cupom: OFERTADEZ`, `Utilize o Cupom: XYZ`, `Cupom: ABC`, etc.
  const cupomMatch = rawText.match(
    /(?:cupom\s*:|utilize\s+o\s+cupom\s*:?|use\s+o\s+cupom\s*:?|código\s+do\s+cupom\s*:?)[\s🔖]*[*_`~]?\s*([A-Z0-9_-]{4,25})/i
  );
  if (cupomMatch) {
    const candidateCoupon = cupomMatch[1].trim().toUpperCase();
    const invalidCouponWords = new Set([
      'PARA', 'PODER', 'USAR', 'AQUI', 'HOJE', 'LINK', 'MAIS', 'SITE',
      'CUPOM', 'RESGATE', 'APARTIR', 'MEIA', 'NOITE', 'ABAIXO', 'TELA', 'LOJA',
    ]);
    if (!invalidCouponWords.has(candidateCoupon)) {
      couponCode = candidateCoupon;
    }
  }

  // 5. Extrair título real da oferta a partir das linhas do texto
  const rawLines = rawText
    .replace(/https?:\/\/[^\s]+/gi, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\*+|\*+$/g, '').trim())
    .filter((l) => l.length >= 4);

  const candidateLines = rawLines.filter((line) => {
    const lower = line.toLowerCase();
    if (lower.startsWith('de:') || lower.startsWith('por:') || lower.startsWith('por apenas') || lower.startsWith('ou')) return false;
    if (/de:?\s*(?:r\$)?\s*\d+.*por:?/i.test(line)) return false;
    if (lower.includes('resgate aqui') || lower.includes('aplique o cupom') || lower.includes('resgate cupom') || lower.includes('utilize o cupom')) return false;
    if (lower.includes('link do produto') || lower.includes('compre aqui') || lower.includes('link direto') || lower === '🛒') return false;
    if (isPromotionalHookLine(line)) return false;
    return true;
  });

  let title: string | undefined;
  if (candidateLines.length > 0) {
    title = candidateLines[0];
  }

  let discountPct: number | undefined;
  if (originalPrice && currentPrice && originalPrice > currentPrice) {
    discountPct = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
  }

  return {
    title: title && title !== `Produto ${storeName.toUpperCase()}` ? title : undefined,
    originalPrice,
    currentPrice,
    currentPriceCondition,
    ouText,
    couponCode,
    discountPct,
  };
}

export interface ProcessIncomingOptions {
  isSimulation?: boolean;
  connectionId?: string;
  deferDispatch?: boolean;
}

/**
 * Processa mensagens recebidas pelo Webhook da Evolution API
 */
export async function processIncomingMessage(
  payload: EvolutionWebhookPayload,
  options?: ProcessIncomingOptions
): Promise<CopierProcessResult> {
  const isSimulation = Boolean(options?.isSimulation);
  const db = readDatabase();
  const rawItem = Array.isArray((payload as any).data)
    ? (payload as any).data[0]
    : ((payload as any).data || payload);
  const data = (rawItem as Record<string, any>) || {};
  const instanceName =
    payload.instance ||
    (payload as any).instanceName ||
    data.instanceName ||
    db.whatsapp.instanceName ||
    'default';
  const key = (data.key || (payload as any).key) as
    | { remoteJid?: string; fromMe?: boolean; id?: string; participant?: string }
    | undefined;

  if (!key) {
    return {
      accepted: false,
      messageId: 'unknown',
      status: 'descartada',
      reason: 'Payload sem dados de chave da mensagem',
    };
  }

  const messageId = key.id || `msg_${Date.now()}`;
  const remoteJid = String(key.remoteJid || '').trim();
  const senderJid = key.participant;
  const senderName = data.pushName;
  const messageData = data.message || (payload as any).message;
  const rawText = extractWhatsAppMessageText(messageData);

  // Ignorar mensagens enviadas pela própria conta quando necessário para evitar ciclos:
  // a) se vier de um grupo configurado como destino ativo, ou
  // b) se o texto já contiver a assinatura/marca d'água do próprio Copiador.
  if (key.fromMe) {
    const isFromDestinationGroup = (db.destinations || []).some(
      (d) => d.isActive && d.groupJid.trim().toLowerCase() === remoteJid.toLowerCase()
    );
    const watermark = (db.settings?.watermarkText || '').trim();
    const hasOwnWatermark =
      (watermark.length > 0 && rawText.includes(watermark)) ||
      rawText.includes('Compre aqui com segurança:') ||
      rawText.includes('[ENVIO BLOQUEADO:');

    if (isFromDestinationGroup || hasOwnWatermark) {
      return {
        accepted: false,
        messageId,
        status: 'descartada',
        reason: 'Mensagem enviada pela própria conta em grupo de destino ou com assinatura do Copiador (anti-loop).',
      };
    }
  }

  // 1. Localizar se o grupo pertence a alguma regra cadastrada
  const matchingSource = db.sources.find(
    (src) => src.groupJid.trim().toLowerCase() === remoteJid.toLowerCase()
  );

  if (!matchingSource) {
    return {
      accepted: false,
      messageId,
      status: 'descartada',
      reason: `Grupo de origem não cadastrado no Copiador: ${remoteJid}`,
    };
  }

  // 1.1 Se a regra existir mas estiver PAUSADA pelo usuário
  if (!matchingSource.isActive) {
    const pausedRecord: IncomingMessage = {
      id: ensureValidUuid(),
      userId: matchingSource.userId,
      messageId,
      instanceName,
      remoteJid,
      senderJid,
      senderName,
      rawText: String(rawText || 'Mensagem recebida com regra pausada'),
      extractedUrls: extractUrlsFromText(String(rawText || '')),
      cleanText: sanitizeCopiedText(String(rawText || '')),
      status: 'descartada',
      discardReason: `Regra de cópia "${matchingSource.name}" pausada pelo usuário.`,
      isSimulation,
      receivedAt: new Date().toISOString(),
    };

    await saveIncomingMessageRecord(pausedRecord);

    return {
      accepted: false,
      messageId,
      status: 'descartada',
      reason: `Regra "${matchingSource.name}" está pausada pelo usuário. Processamento e envios suspensos.`,
    };
  }

  const authorizedSource = matchingSource;

  // 2. Idempotência: verificar se já processamos esta mensagem
  const alreadyProcessed = db.incomingMessages.some(
    (m) => m.instanceName === instanceName && m.messageId === messageId
  );

  if (alreadyProcessed) {
    return {
      accepted: false,
      messageId,
      status: 'descartada',
      reason: 'Mensagem duplicada já recebida e processada anteriormente.',
    };
  }

  if (!rawText.trim()) {
    return {
      accepted: false,
      messageId,
      status: 'descartada',
      reason: 'Mensagem sem conteúdo textual legível.',
    };
  }

  const extractedUrls = extractUrlsFromText(rawText);
  if (extractedUrls.length === 0) {
    const incomingRecord: IncomingMessage = {
      id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: authorizedSource.userId,
      messageId,
      instanceName,
      remoteJid,
      senderJid,
      senderName,
      rawText,
      extractedUrls: [],
      cleanText: sanitizeCopiedText(rawText),
      status: 'descartada',
      discardReason: 'Mensagem não contém links de produtos ou ofertas.',
      isSimulation,
      receivedAt: new Date().toISOString(),
    };

    await saveIncomingMessageRecord(incomingRecord);

    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: 'Mensagem não continha links de produtos.',
    };
  }

  // Priorizar link do produto quando houver link de cupom e link de produto na mesma mensagem
  const orderedUrls = orderCandidateProductUrls(rawText, extractedUrls);
  let primaryUrl = orderedUrls[0];

  // Organizar credenciais por loja (incluindo segredos descriptografados do cofre)
  const credentialsMap = await getStoreCredentialsMapWithSecrets(
    authorizedSource.userId,
    db.stores
  );

  // 3. Converter para link de afiliado oficial (tentando o próximo link se o primeiro for página genérica de cupom)
  let conversionResult = await convertToAffiliateLink(primaryUrl, credentialsMap);
  if (
    orderedUrls.length > 1 &&
    (!conversionResult.success ||
      /\/m\/cupom|\/m\/frete|\/cupons/i.test(conversionResult.cleanUrl || ''))
  ) {
    for (let i = 1; i < orderedUrls.length; i++) {
      const nextTry = await convertToAffiliateLink(orderedUrls[i], credentialsMap);
      if (
        nextTry.store &&
        (nextTry.success || !/\/m\/cupom|\/m\/frete|\/cupons/i.test(nextTry.cleanUrl || ''))
      ) {
        primaryUrl = orderedUrls[i];
        conversionResult = nextTry;
        break;
      }
    }
  }

  if (!conversionResult.store) {
    const discardReason = `Falha na conversão de link próprio: ${conversionResult.error || 'Loja não suportada ou domínio não reconhecido.'}`;

    const incomingRecord: IncomingMessage = {
      id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: authorizedSource.userId,
      messageId,
      instanceName,
      remoteJid,
      senderJid,
      senderName,
      rawText,
      extractedUrls,
      cleanText: sanitizeCopiedText(rawText),
      status: 'descartada',
      discardReason,
      isSimulation,
      receivedAt: new Date().toISOString(),
    };

    await saveIncomingMessageRecord(incomingRecord);

    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: discardReason,
      jobIds: [],
    };
  }

  // 3.1 Verificar se a loja é permitida nesta origem
  if (!authorizedSource.allowedStores.includes(conversionResult.store)) {
    const discardReason = `Loja ${conversionResult.store.toUpperCase()} não está na lista de permitidas desta origem.`;
    const incomingRecord: IncomingMessage = {
      id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: authorizedSource.userId,
      messageId,
      instanceName,
      remoteJid,
      senderJid,
      senderName,
      rawText,
      extractedUrls,
      cleanText: sanitizeCopiedText(rawText),
      extractedStore: conversionResult.store,
      resolvedDestinationUrl: conversionResult.cleanUrl,
      affiliateUrl: conversionResult.affiliateUrl || undefined,
      status: 'descartada',
      discardReason,
      isSimulation,
      receivedAt: new Date().toISOString(),
    };
    await saveIncomingMessageRecord(incomingRecord);
    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: discardReason,
      jobIds: [],
    };
  }

  // 3.2 Se a conversão do link próprio falhou (credenciais ausentes, de exemplo ou rejeitadas pela API):
  // NUNCA reutilizar o link original do grupo de origem e NUNCA publicar.
  // Em modo de revisão manual, registrar na fila de revisão com estado bloqueado e motivo visível.
  if (!conversionResult.success || !conversionResult.affiliateUrl) {
    const discardReason = `Oferta bloqueada — não foi possível confirmar link próprio de afiliado (${conversionResult.store.toUpperCase()}): ${conversionResult.error || 'Credenciais de afiliado ausentes ou inválidas.'}`;

    const incomingRecord: IncomingMessage = {
      id: ensureValidUuid(),
      userId: authorizedSource.userId,
      messageId,
      instanceName,
      remoteJid,
      senderJid,
      senderName,
      rawText,
      extractedUrls,
      cleanText: sanitizeCopiedText(rawText),
      extractedStore: conversionResult.store,
      resolvedDestinationUrl: conversionResult.cleanUrl,
      status: 'descartada',
      discardReason,
      isSimulation,
      receivedAt: new Date().toISOString(),
    };

    await saveIncomingMessageRecord(incomingRecord);

    const blockedJobIds: string[] = [];
    if (!isSimulation && authorizedSource.operationMode === 'revisao_manual') {
      const sourceDestinations = db.destinations.filter(
        (d) => d.sourceId === authorizedSource.id && d.isActive
      );
      const validDestinations = sourceDestinations.filter((dest) => {
        const group = (db.groups || []).find((g) => g.groupJid === dest.groupJid);
        if (!group) return true;
        return group.canPost !== false && group.permissionStatus !== 'restricted_readonly';
      });

      const cleanTitle = sanitizeCopiedText(rawText).split('\n')[0]?.trim() || `Oferta capturada (${conversionResult.store.toUpperCase()})`;
      for (const dest of validDestinations) {
        const blockedJob: PublicationJob = {
          id: ensureValidUuid(),
          userId: authorizedSource.userId,
          originType: 'copiador',
          sourceId: authorizedSource.id,
          incomingMessageId: incomingRecord.id,
          targetJid: dest.groupJid,
          targetName: dest.name,
          messageText: `*{titulo}*\n\n⚠️ [ENVIO BLOQUEADO: Link próprio de afiliado não confirmado para ${conversionResult.store.toUpperCase()}]`.replace('{titulo}', cleanTitle),
          mediaType: 'none',
          affiliateUrl: '', // NUNCA reutiliza o link do grupo de origem
          originalUrl: primaryUrl,
          status: 'aguardando_aprovacao',
          errorDetails: discardReason,
          scheduledFor: new Date().toISOString(),
          attempts: 0,
          maxAttempts: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await savePublicationJob(blockedJob);
        blockedJobIds.push(blockedJob.id);
      }
    }

    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: discardReason,
      jobIds: blockedJobIds,
    };
  }

  // 4. Coletar dados reais do produto (combinando scraping + extração do texto real da mensagem do WhatsApp)
  const productData = await fetchProductRealData(conversionResult.cleanUrl, conversionResult.store);
  if ((!productData.imageUrl || !productData.imageUrl.startsWith('http')) && conversionResult.meta?.extractedImageUrl) {
    productData.imageUrl = conversionResult.meta.extractedImageUrl;
  }
  const parsedFromWhatsApp = extractOfferDetailsFromWhatsAppText(rawText, conversionResult.store);

  // Bloquear avisos/tutoriais genéricos de cupom sem produto e sem preço na mensagem original
  if (
    !parsedFromWhatsApp.currentPrice &&
    (/tutorial\s+para\s+resgatar|resgate\s+para\s+poder\s+usar|cupom\s+de\s+\d+%\s+no\s+(?:mercado\s+livre|shopee|amazon|magalu)/i.test(rawText) ||
      /\/m\/cupom|\/m\/frete|\/cupons/i.test(conversionResult.cleanUrl || ''))
  ) {
    const discardReason = 'Informativo de cupom geral sem produto ou preço específico — ignorado pelo copiador de ofertas.';
    const incomingRecord: IncomingMessage = {
      id: ensureValidUuid(),
      userId: authorizedSource.userId,
      connectionId: authorizedSource.connectionId || options?.connectionId,
      messageId,
      instanceName,
      remoteJid,
      senderJid,
      senderName,
      rawText,
      extractedUrls,
      cleanText: sanitizeCopiedText(rawText),
      extractedStore: conversionResult.store,
      resolvedDestinationUrl: conversionResult.cleanUrl,
      status: 'descartada',
      discardReason,
      isSimulation,
      receivedAt: new Date().toISOString(),
    };
    await saveIncomingMessageRecord(incomingRecord);
    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: discardReason,
      jobIds: [],
    };
  }

  const isGenericStoreTitle = (t?: string) =>
    !t ||
    t.toLowerCase().startsWith('produto ') ||
    t.toLowerCase().startsWith('oferta ') ||
    t.toLowerCase() === 'oferta exclusiva' ||
    isPromotionalHookLine(t) ||
    isJunkProductTitle(t);

  if (isGenericStoreTitle(productData.title)) {
    if (parsedFromWhatsApp.title && !isGenericStoreTitle(parsedFromWhatsApp.title)) {
      productData.title = parsedFromWhatsApp.title;
    } else {
      const fromUrl = extractTitleFromProductUrl(conversionResult.cleanUrl);
      if (fromUrl && !isGenericStoreTitle(fromUrl)) {
        productData.title = fromUrl;
      }
    }
  }

  if (parsedFromWhatsApp.currentPrice && parsedFromWhatsApp.currentPrice > 0) {
    productData.currentPrice = parsedFromWhatsApp.currentPrice;
  }

  if (parsedFromWhatsApp.originalPrice && parsedFromWhatsApp.originalPrice > 0) {
    productData.originalPrice = parsedFromWhatsApp.originalPrice;
  }

  if (productData.originalPrice && productData.currentPrice && productData.originalPrice > productData.currentPrice) {
    productData.discountPct = Math.round(((productData.originalPrice - productData.currentPrice) / productData.originalPrice) * 100);
  } else if (parsedFromWhatsApp.discountPct) {
    productData.discountPct = parsedFromWhatsApp.discountPct;
  }

  // Registrar no catálogo real
  const catalogProduct: ProductItem = {
    id: ensureValidUuid(),
    userId: authorizedSource.userId,
    storeName: conversionResult.store,
    externalId: productData.externalId,
    title: productData.title,
    originalPrice: productData.originalPrice,
    currentPrice: productData.currentPrice,
    discountPct: productData.discountPct,
    rating: productData.rating,
    reviewsCount: productData.reviewsCount,
    salesCount: productData.salesCount,
    imageUrl: productData.imageUrl,
    productUrl: conversionResult.cleanUrl,
    affiliateUrl: conversionResult.affiliateUrl,
    inStock: productData.inStock,
    lastCheckedAt: productData.fetchedAt,
  };
  await saveProductToCatalog(catalogProduct);

  // Salvar histórico de preço real da oferta coletada imediatamente (regra obrigatória Fase 1)
  if (!isSimulation && productData.currentPrice && productData.currentPrice > 0) {
    await recordOfferPriceHistory({
      userId: authorizedSource.userId,
      productExternalId: productData.externalId || conversionResult.cleanUrl,
      productTitle: productData.title,
      productUrl: conversionResult.cleanUrl,
      store: conversionResult.store,
      price: productData.currentPrice,
      originalPrice: productData.originalPrice,
    }).catch((err) => {
      console.warn('[PriceHistory] Aviso ao registrar histórico na coleta:', err);
    });
  }

  // 5. Avaliar qualidade da oferta com dados reais
  const storeRule = db.rules.find((r) => r.storeName === conversionResult.store) || {
    id: ensureValidUuid(),
    userId: authorizedSource.userId,
    storeName: conversionResult.store,
    minRating: 4.5,
    minReviewsCount: 10,
    minSalesCount: 5,
    minDiscountPct: 10,
    minCommissionRate: 1.0,
    requireSocialProof: false,
    requireInStock: true,
    blockedKeywords: [],
    updatedAt: new Date().toISOString(),
  };

  const evaluation = evaluateOfferQuality({
    product: {
      userId: authorizedSource.userId,
      storeName: conversionResult.store,
      title: productData.title,
      currentPrice: productData.currentPrice,
      originalPrice: productData.originalPrice,
      discountPct: productData.discountPct,
      rating: productData.rating,
      reviewsCount: productData.reviewsCount,
      salesCount: productData.salesCount,
      inStock: productData.inStock,
    },
    rule: storeRule,
    rawText,
  });

  const cleanSnippet = sanitizeCopiedText(rawText);

  const hasBlockedKeyword =
    Array.isArray(storeRule.blockedKeywords) &&
    storeRule.blockedKeywords.some(
      (kw) => kw && kw.trim().length > 0 && rawText.toLowerCase().includes(kw.toLowerCase())
    );
  const isQualityRejected = evaluation.decision === 'rejeitado';
  const shouldDiscardAuto = hasBlockedKeyword && authorizedSource.operationMode === 'automatico';

  const incomingRecord: IncomingMessage = {
    id: ensureValidUuid(),
    userId: authorizedSource.userId,
    connectionId: authorizedSource.connectionId || options?.connectionId,
    messageId,
    instanceName,
    remoteJid,
    senderJid,
    senderName,
    rawText,
    extractedUrls,
    cleanText: cleanSnippet,
    extractedStore: conversionResult.store,
    resolvedDestinationUrl: conversionResult.cleanUrl,
    affiliateUrl: conversionResult.affiliateUrl,
    status: shouldDiscardAuto ? 'descartada' : 'processada',
    discardReason: shouldDiscardAuto ? evaluation.reason : undefined,
    isSimulation,
    receivedAt: new Date().toISOString(),
  };

  await saveIncomingMessageRecord(incomingRecord);
  await saveOfferEvaluation(evaluation);

  // SE FOR SIMULAÇÃO (VERIFICAÇÃO ISOLADA SEM PUBLICAR):
  // NUNCA criar publication_jobs, NUNCA alterar a fila real nem disparar worker!
  if (isSimulation) {
    return {
      accepted: true,
      messageId,
      status: shouldDiscardAuto ? 'descartada' : 'processada',
      reason: `[Verificação Isolada] Oferta ${
        isQualityRejected ? 'com observações de qualidade' : 'aprovada'
      } (Score ${evaluation.score}/100) — Loja: ${conversionResult.store?.toUpperCase()}. Link convertido e avaliado. Fila de disparos inalterada (0 trabalhos criados).`,
      jobIds: [],
    };
  }

  // Se for modo automático e contiver palavra bloqueada, nunca gerar job automático
  if (shouldDiscardAuto) {
    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: `Oferta reprovada pelas regras de qualidade para envio automático: ${evaluation.reason}`,
      jobIds: [],
    };
  }

  // 6. Destinos associados à origem (NUNCA usar destino fictício como fallback!)
  const sourceDestinations = db.destinations.filter(
    (d) => d.sourceId === authorizedSource.id && d.isActive
  );

  if (sourceDestinations.length === 0) {
    incomingRecord.status = 'descartada';
    incomingRecord.discardReason = 'Nenhum grupo de destino configurado ou ativo para esta origem.';
    await saveIncomingMessageRecord(incomingRecord);
    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: 'Nenhum grupo de destino configurado ou ativo para esta origem.',
      jobIds: [],
    };
  }

  // Filtrar apenas destinos com permissão comprovada de postagem (regras reais do grupo)
  const validDestinations = sourceDestinations.filter((dest) => {
    const group = (db.groups || []).find((g) => g.groupJid === dest.groupJid);
    if (!group) return true; // Se não estiver em cache, mantém a verificação
    return group.canPost !== false && group.permissionStatus !== 'restricted_readonly';
  });

  if (validDestinations.length === 0) {
    incomingRecord.status = 'descartada';
    incomingRecord.discardReason = 'Todos os grupos de destino configurados estão restritos ou sem permissão de postagem.';
    await saveIncomingMessageRecord(incomingRecord);
    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: 'Grupos de destino restritos a administradores ou sem permissão de postagem. Envio bloqueado por segurança.',
      jobIds: [],
    };
  }

  // 7. Imagem do Copiador (Foto Oficial da Loja em alta resolução e formato 1:1 sem cortes)
  let finalMediaUrl: string | undefined = undefined;
  let finalMediaType: 'image' | 'video' | 'none' = 'none';
  let requiresManualReviewDueToImage = false;
  let imageReviewReason: string | undefined = undefined;

  const rawCandidatePhoto =
    productData.imageUrl && productData.imageUrl.startsWith('http')
      ? productData.imageUrl
      : undefined;

  const photoSelection = selectBestProductPhoto(
    rawCandidatePhoto,
    conversionResult.store,
    productData.rawEvidences?.pictures as Array<{ url?: string; secure_url?: string; size?: string; max_size?: string }> | undefined
  );
  const bestOfficialPhoto = photoSelection.selectedUrl || rawCandidatePhoto || '';

  if (authorizedSource.imageMode === 'none') {
    finalMediaUrl = undefined;
    finalMediaType = 'none';
  } else {
    finalMediaType = 'image';
    if (bestOfficialPhoto) {
      // Formata a fotografia oficial no tamanho quadrado perfeito (1:1, 1080x1080) com enquadramento adaptativo 'contain', fundo limpo e marca d'água do plano
      const customSourceHandle =
        authorizedSource.brandWatermarkHandle &&
        authorizedSource.brandWatermarkHandle !== '@radar.ofertas.br1'
          ? authorizedSource.brandWatermarkHandle
          : undefined;

      finalMediaUrl = await optimizeProductImageForWhatsApp(
        bestOfficialPhoto,
        authorizedSource.userId,
        {
          watermark: authorizedSource.brandWatermarkEnabled,
          watermarkHandle: customSourceHandle,
          productPageUrl: conversionResult.cleanUrl,
          store: conversionResult.store,
        }
      );
    }

    // Regra de qualidade: Toda publicação que requer imagem DEVE ter fotografia pronta e válida.
    // Se a otimização com marca d'água falhar (por exemplo, oscilação de rede externa ou bucket temporariamente inacessível),
    // utiliza a melhor foto oficial da loja como contingência de alta resolução para que o envio automático não seja interrompido.
    if (!finalMediaUrl) {
      if (bestOfficialPhoto && (bestOfficialPhoto.startsWith('http://') || bestOfficialPhoto.startsWith('https://'))) {
        finalMediaUrl = bestOfficialPhoto;
      } else {
        requiresManualReviewDueToImage = true;
        imageReviewReason = 'Fotografia do produto indisponível. Publicação sem imagem bloqueada para proteção de qualidade.';
      }
    }
  }

  // 8. Encurtar link de afiliado longo (ex: Mercado Livre) e montar mensagem final para envio
  const displayAffiliateUrl = await shortenUrlForWhatsApp(conversionResult.affiliateUrl);

  const formattedMessage = buildWhatsAppMessage({
    templateText: authorizedSource.templateText || undefined,
    title: productData.title,
    originalPrice: productData.originalPrice,
    currentPrice: productData.currentPrice,
    currentPriceCondition: parsedFromWhatsApp.currentPriceCondition,
    ouPriceText: parsedFromWhatsApp.ouText,
    discountPct: productData.discountPct,
    couponCode: parsedFromWhatsApp.couponCode,
    affiliateUrl: displayAffiliateUrl,
    watermarkText: db.settings.watermarkText,
  });

  // Trava de conteúdo: sem link exibido, sem preço ou com título inválido → revisão manual
  const contentCheck = checkOfferContent({ messageText: formattedMessage, displayUrl: displayAffiliateUrl, title: productData.title, currentPrice: productData.currentPrice });
  const contentReviewReason = contentCheck.ok ? undefined : contentCheck.reason;

  const createdJobIds: string[] = [];

  // Verificar limite diário do plano no servidor antes de agendar envio automático
  const dailyQuota = await getDailyOfferQuotaStatus(authorizedSource.userId);
  const planQuotaReached = dailyQuota.limitReached;
  const planQuotaReason = planQuotaReached && dailyQuota.dailyLimit === 0
    ? 'Assinatura inativa ou vencida: assine ou renove um plano em /planos para voltar a enviar automático.'
    : planQuotaReached
    ? `Limite diário do plano (${dailyQuota.dailyLimit} ofertas/dia) atingido (${dailyQuota.postedToday} postadas hoje). Faça upgrade em /planos para continuar enviando hoje.`
    : undefined;

  // Regra de Envio Automático:
  // Só agenda automaticamente se o modo da origem for 'automatico', não houver palavras bloqueadas,
  // a fotografia obrigatória estiver pronta e válida, o link de afiliado tiver sido confirmado, e o plano tiver saldo diário.
  const isAutomaticAllowed =
    authorizedSource.operationMode === 'automatico' &&
    !hasBlockedKeyword &&
    !requiresManualReviewDueToImage &&
    !planQuotaReached &&
    contentCheck.ok &&
    Boolean(conversionResult.success && conversionResult.affiliateUrl && conversionResult.verificationStatus === 'verificado' && conversionResult.isAutoDispatchAllowed);

  const brandPrefs = await getBrandSettings(authorizedSource.userId);
  const safeMinDelay = brandPrefs.safeDispatchEnabled ? brandPrefs.safeDispatchDelaySec : 0;
  const sourceDelay =
    typeof authorizedSource.customDelaySeconds === 'number' && authorizedSource.customDelaySeconds >= 0
      ? authorizedSource.customDelaySeconds
      : 60;
  const delaySeconds = Math.max(sourceDelay, safeMinDelay);

  const isImmediateDispatchMode = !isTestIsolationActive() && isAutomaticAllowed;

  for (const dest of validDestinations) {
    // Calcular o próximo horário de envio respeitando o intervalo configurado e evitando acúmulo de disparos de uma vez
    const pendingSameDest = db.jobs
      .filter((j) => j.targetJid === dest.groupJid && (j.status === 'agendado' || j.status === 'enviando'))
      .map((j) => new Date(j.scheduledFor).getTime())
      .filter((t) => !isNaN(t) && t > Date.now());

    const baseScheduledTime = pendingSameDest.length > 0 ? Math.max(...pendingSameDest) : Date.now();
    const scheduledTime = isImmediateDispatchMode && pendingSameDest.length === 0
      ? new Date().toISOString()
      : new Date(baseScheduledTime + delaySeconds * 1000).toISOString();
    // Deduplicação canônica: checar se este mesmo link, produto ou título foi enviado/agendado/entregue para o mesmo grupo nas últimas 24 horas
    const alreadySentRecently = isDuplicateOfferJob(
      {
        targetJid: dest.groupJid,
        affiliateUrl: conversionResult.affiliateUrl,
        originalUrl: primaryUrl,
        cleanUrl: conversionResult.cleanUrl,
        externalId: productData.externalId,
        productTitle: productData.title,
      },
      db.jobs,
      24
    );

    if (alreadySentRecently) {
      continue; // Evitar repetição e spam para o mesmo grupo de destino
    }

    const unverifiedReason =
      conversionResult.verificationStatus !== 'verificado'
        ? conversionResult.meta?.verificationReason ||
          'Link montado localmente com parâmetros da conta.'
        : undefined;

    const job: PublicationJob & { cleanUrl?: string } = {
      id: ensureValidUuid(),
      userId: authorizedSource.userId,
      connectionId: authorizedSource.connectionId || options?.connectionId,
      originType: 'copiador',
      sourceId: authorizedSource.id,
      incomingMessageId: incomingRecord.id,
      productId: catalogProduct.id,
      evaluationId: evaluation.id,
      targetJid: dest.groupJid,
      targetName: dest.name,
      messageText: formattedMessage,
      mediaType: finalMediaType,
      mediaUrl: finalMediaUrl, // URL da composição ou foto oficial configurada
      socialOffer: {
        title: productData.title,
        imageUrl: bestOfficialPhoto || null,
        currentPrice: productData.currentPrice,
        originalPrice: productData.originalPrice ?? null,
        discountPct: productData.discountPct ?? null,
        coupon: parsedFromWhatsApp.couponCode || null,
        store: conversionResult.store,
      },
      affiliateUrl: conversionResult.affiliateUrl,
      originalUrl: primaryUrl,
      cleanUrl: conversionResult.cleanUrl,
      status: (isAutomaticAllowed && !requiresManualReviewDueToImage) ? 'agendado' : 'aguardando_aprovacao',
      errorDetails: (isAutomaticAllowed && !requiresManualReviewDueToImage) ? undefined : (contentReviewReason || planQuotaReason || imageReviewReason || unverifiedReason),
      scheduledFor: scheduledTime,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await savePublicationJob(job);
    createdJobIds.push(job.id);
  }

  if (createdJobIds.length === 0) {
    incomingRecord.status = 'descartada';
    incomingRecord.discardReason =
      'Oferta duplicada bloqueada: este mesmo produto/link já foi enviado ou agendado recentemente.';
    await saveIncomingMessageRecord(incomingRecord);
    return {
      accepted: false,
      messageId,
      status: 'descartada',
      reason: incomingRecord.discardReason,
      jobIds: [],
    };
  }

  // Em produção (Render / Vercel / Local), executa o envio imediatamente na requisição para não depender de timers voláteis
  if (!runtimeDatabase() && !options?.deferDispatch && !isSimulation && isAutomaticAllowed && createdJobIds.length > 0) {
    if (isImmediateDispatchMode) {
      try {
        await runWorkerCycle();
      } catch (err) {
        console.error('[Copier Auto-Dispatch] Erro ao executar ciclo imediato do worker:', err);
      }
    } else {
      const triggerDelayMs = Math.max(500, delaySeconds * 1000 + 500);
      setTimeout(() => {
        runWorkerCycle().catch((err) => {
          console.error('[Copier Auto-Dispatch] Erro ao executar ciclo do worker:', err);
        });
      }, triggerDelayMs);
    }
  }

  const reviewReason = !conversionResult.isAutoDispatchAllowed
    ? 'Link de afiliado não verificado — bloqueado envio automático para conferência humana.'
    : 'Oferta encaminhada para fila de revisão manual conforme configuração da origem.';

  return {
    accepted: true,
    messageId,
    status: 'processada',
    reason: isAutomaticAllowed
      ? `Oferta aprovada e processada para envio automático.`
      : reviewReason,
    jobIds: createdJobIds,
  };
}

let isSyncingOriginMessages = false;
let lastOriginSyncAtMs = 0;

/**
 * Busca ativamente na Evolution API as últimas mensagens dos grupos de origem ativos
 * para recuperar ofertas caso o webhook tenha sofrido oscilação ou cold start.
 */
export async function syncRecentOriginMessagesFromEvolution(force = false): Promise<number> {
  if (isTestIsolationActive()) return 0;
  if (isSyncingOriginMessages) return 0;
  if (!force && Date.now() - lastOriginSyncAtMs < 25000) return 0;

  isSyncingOriginMessages = true;
  lastOriginSyncAtMs = Date.now();
  let newlyProcessed = 0;

  try {
    const db = readDatabase();
    const activeSources = (db.sources || []).filter((s) => s.isActive && s.groupJid);
    if (activeSources.length === 0) return 0;

    const evoConfig = getActiveEvolutionConfig(db.whatsapp);
    if (!evoConfig.baseUrl || !evoConfig.apiKey || !evoConfig.instanceName) return 0;

    const cleanBaseUrl = evoConfig.baseUrl.replace(/\/+$/, '');
    const maxAgeSec = 2 * 3600; // Últimas 2 horas
    const nowSec = Math.floor(Date.now() / 1000);

    for (const source of activeSources) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(
          `${cleanBaseUrl}/chat/findMessages/${encodeURIComponent(evoConfig.instanceName)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: evoConfig.apiKey,
            },
            body: JSON.stringify({
              where: { key: { remoteJid: source.groupJid } },
              limit: 2,
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);
        if (!res.ok) continue;

        const data = await res.json().catch(() => null);
        const records: any[] =
          data?.messages?.records || data?.records || (Array.isArray(data) ? data : []);

        // Limita estritamente às 2 mensagens mais recentes para evitar disparo de histórico antigo
        const recentRecords = records
          .slice(0, 2)
          .filter((m) => {
            const msgId = m?.key?.id;
            if (!msgId) return false;
            const ts = Number(m?.messageTimestamp || 0);
            if (ts > 0 && nowSec - ts > maxAgeSec) return false;
            const currentDb = readDatabase();
            return !currentDb.incomingMessages.some((inc) => inc.messageId === msgId);
          })
          .reverse();

        for (const msg of recentRecords) {
          const resProc = await processIncomingMessage({
            event: 'messages.upsert',
            instance: evoConfig.instanceName,
            data: {
              key: msg.key,
              pushName: msg.pushName || 'Grupo',
              message: msg.message,
            },
          });
          if (resProc.accepted && resProc.status === 'processada') {
            newlyProcessed++;
          }
        }
      } catch {
        clearTimeout(timeout);
      }
    }
  } finally {
    isSyncingOriginMessages = false;
  }

  return newlyProcessed;
}
