import "server-only";

export interface MLProductPageMetrics {
  soldQuantity: number | null;
  rating: number | null;
  reviewsCount: number | null;
}

export interface MLPublicDealCard {
  externalId: string;
  title: string;
  price: number;
  originalPrice: number | null;
  discountPercent: number | null;
  productUrl: string;
  thumbnail: string | null;
  freeShipping: boolean;
  isFull: boolean;
}

/**
 * Padrões de seletores e regex conhecidos do Mercado Livre
 */
export const ML_DOM_PATTERNS = {
  SUBTITLE_VENDIDOS: /class="ui-pdp-subtitle"[^>]*>([\s\S]*?)<\/span>/i,
  SUBTITLE_ARIA_LABEL: /class="ui-pdp-subtitle"[^>]*aria-label="([^"]+)"/i,
  REVIEW_RATING: /class="ui-pdp-review__rating"[^>]*>([\d.,]+)<\/span>/i,
  REVIEW_AMOUNT: /class="ui-pdp-review__amount"[^>]*>\(([0-9.,]+)\)<\/span>/i,
};

/**
 * Converte strings em formato numérico brasileiro (ex: "+250 mil", "1.500", "500", "50") para inteiro
 */
export function parseSoldText(text: string): number | null {
  if (!text) return null;
  const clean = text.toLowerCase().trim();

  // Caso: "+250 mil" ou "250 mil"
  const milMatch = clean.match(/(\d+[\d.,]*)\s*mil/i);
  if (milMatch) {
    const base = Number.parseFloat(milMatch[1].replace(",", "."));
    if (!Number.isNaN(base)) {
      return Math.round(base * 1000);
    }
  }

  // Caso: "Mais de 1000 vendidos" ou "+500 vendidos" ou "1.234 vendidos"
  const numMatch = clean.match(/(\d+[\d.]*)/);
  if (numMatch) {
    const rawNum = Number.parseInt(numMatch[1].replace(/\./g, ""), 10);
    if (!Number.isNaN(rawNum)) {
      return rawNum;
    }
  }

  return null;
}

/**
 * Extrai a quantidade vendida da página do produto individual
 * Estrito: Requer a presença da classe oficial .ui-pdp-subtitle
 */
export function extractSoldQuantity(html: string): number | null {
  // 1. Tenta extrair pelo atributo aria-label de .ui-pdp-subtitle
  const ariaMatch = html.match(ML_DOM_PATTERNS.SUBTITLE_ARIA_LABEL);
  if (ariaMatch?.[1]) {
    const parsed = parseSoldText(ariaMatch[1]);
    if (parsed !== null) return parsed;
  }

  // 2. Tenta extrair do texto interno de .ui-pdp-subtitle
  const subMatch = html.match(ML_DOM_PATTERNS.SUBTITLE_VENDIDOS);
  if (subMatch?.[1]) {
    const cleanText = subMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const parsed = parseSoldText(cleanText);
    if (parsed !== null) return parsed;
  }

  // Se .ui-pdp-subtitle não estiver presente, retorna null
  return null;
}

/**
 * Extrai nota média e contagem de avaliações da página do produto individual
 * Estrito: Requer a presença das classes oficiais .ui-pdp-review__rating e .ui-pdp-review__amount
 */
export function extractReviewsMetrics(html: string): { rating: number | null; reviewsCount: number | null } {
  let rating: number | null = null;
  let reviewsCount: number | null = null;

  // 1. Extrai a nota média (.ui-pdp-review__rating)
  const ratingMatch = html.match(ML_DOM_PATTERNS.REVIEW_RATING);
  if (ratingMatch?.[1]) {
    const parsedRating = Number.parseFloat(ratingMatch[1].replace(",", "."));
    if (!Number.isNaN(parsedRating) && parsedRating > 0 && parsedRating <= 5.0) {
      rating = parsedRating;
    }
  }

  // 2. Extrai a quantidade de avaliações (.ui-pdp-review__amount)
  const amountMatch = html.match(ML_DOM_PATTERNS.REVIEW_AMOUNT);
  if (amountMatch?.[1]) {
    const cleanAmount = amountMatch[1].replace(/\./g, "").replace(/,/g, "");
    const parsedAmount = Number.parseInt(cleanAmount, 10);
    if (!Number.isNaN(parsedAmount) && parsedAmount >= 0) {
      reviewsCount = parsedAmount;
    }
  }

  return { rating, reviewsCount };
}

/**
 * Extrai todos os cards de ofertas públicas a partir do HTML da página mercadolivre.com.br/ofertas
 */
export function extractDealCardsFromOfertasHtml(html: string): MLPublicDealCard[] {
  const cards: MLPublicDealCard[] = [];
  const seenIds = new Set<string>();

  // Expressão regular para capturar links de produtos /p/MLB... ou /MLB-... (relativos ou absolutos)
  const linkMatches = Array.from(
    html.matchAll(/href="([^"']*\/p\/(MLB\d+)[^"']*)"/gi)
  );

  for (const match of linkMatches) {
    const rawUrl = match[1];
    const mlbId = match[2];

    if (!mlbId || seenIds.has(mlbId)) continue;
    seenIds.add(mlbId);

    const fullUrl = rawUrl.startsWith("http") ? rawUrl : `https://www.mercadolivre.com.br${rawUrl}`;

    // Tenta encontrar o contexto do card (até 1500 caracteres antes ou depois do link)
    const pos = match.index ?? -1;
    if (pos === -1) continue;
    const cardSnippet = html.slice(Math.max(0, pos - 800), Math.min(html.length, pos + 1200));

    // Extrai título
    const titleMatch =
      cardSnippet.match(/class="[^"]*poly-component__title[^"]*"[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ||
      cardSnippet.match(/<a[^>]*class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)<\/a>/i) ||
      cardSnippet.match(/<a[^>]*href="[^"]*\/p\/MLB\d+[^"]*"[^>]*>([^<]+)<\/a>/i) ||
      cardSnippet.match(/class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)<\/h[23]>/i) ||
      cardSnippet.match(/title="([^"]+)"/i) ||
      cardSnippet.match(/alt="([^"]+)"/i);
    const title = titleMatch?.[1]?.trim() || "";
    if (!title || title.length < 5) continue;

    // Extrai preço atual
    const priceMatch =
      cardSnippet.match(/class="[^"]*poly-price__current[^"]*"[\s\S]*?class="andes-money-amount__fraction"[^>]*>([\d.]+)<\/span>/i) ||
      cardSnippet.match(/class="andes-money-amount__fraction"[^>]*>([\d.]+)<\/span>/i);
    if (!priceMatch?.[1]) continue;

    const price = Number.parseFloat(priceMatch[1].replace(/\./g, "").replace(",", "."));
    if (Number.isNaN(price) || price <= 0) continue;

    // Extrai preço original anterior
    let originalPrice: number | null = null;
    const origMatch = cardSnippet.match(
      /class="[^"]*(?:poly-price__original|andes-money-amount--previous)[^"]*"[\s\S]*?class="andes-money-amount__fraction"[^>]*>([\d.]+)<\/span>/i
    );
    if (origMatch?.[1]) {
      const parsedOrig = Number.parseFloat(origMatch[1].replace(/\./g, "").replace(",", "."));
      if (!Number.isNaN(parsedOrig) && parsedOrig > price) {
        originalPrice = parsedOrig;
      }
    }

    // Desconto
    const discMatch = cardSnippet.match(/(\d+)%\s*OFF/i);
    const discountPercent = discMatch?.[1] ? Number.parseInt(discMatch[1], 10) : null;

    // Thumbnail
    const imgMatch =
      cardSnippet.match(/data-src="([^"]+)"/i) ||
      cardSnippet.match(/src="(https:\/\/http2\.mlstatic\.com\/[^"]+)"/i);
    const thumbnail = imgMatch?.[1] || null;

    const freeShipping = /frete\s+gr[aá]tis/i.test(cardSnippet);
    const isFull = /full/i.test(cardSnippet);

    cards.push({
      externalId: mlbId,
      title,
      price,
      originalPrice,
      discountPercent,
      productUrl: fullUrl,
      thumbnail,
      freeShipping,
      isFull,
    });
  }

  return cards;
}
