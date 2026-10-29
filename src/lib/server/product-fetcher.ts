import { StoreName } from '../types';

export interface ProductRealData {
  externalId: string;
  storeName: StoreName;
  title: string;
  canonicalUrl: string;
  currentPrice: number;
  originalPrice?: number;
  discountPct: number;
  rating?: number;
  reviewsCount?: number;
  salesCount?: number;
  inStock: boolean;
  imageUrl?: string;
  fetchedAt: string;
  dataSource: 'api_oficial' | 'html_metadata' | 'link_resolver' | 'manual';
  rawEvidences: Record<string, unknown>;
  missingFields: string[];
}

/**
 * Extrai o MLB ID de uma URL do Mercado Livre
 */
export function extractMercadoLivreId(urlStr: string): string | null {
  try {
    const match = urlStr.match(/MLB-?(\d+)/i) || urlStr.match(/p\/MLB(\d+)/i);
    return match ? `MLB${match[1]}` : null;
  } catch {
    return null;
  }
}

/**
 * Extrai o Shop ID e Item ID de uma URL da Shopee
 */
export function extractShopeeIds(urlStr: string): { shopId: string; itemId: string } | null {
  try {
    const matchI = urlStr.match(/-i\.(\d+)\.(\d+)/);
    if (matchI) return { shopId: matchI[1], itemId: matchI[2] };

    const matchProd = urlStr.match(/\/product\/(\d+)\/(\d+)/);
    if (matchProd) return { shopId: matchProd[1], itemId: matchProd[2] };

    return null;
  } catch {
    return null;
  }
}

/**
 * Extrai o ID ou SKU de um produto da Netshoes
 */
export function extractNetshoesId(urlStr: string): string | null {
  try {
    const match = urlStr.match(/\/([a-zA-Z0-9_-]+-[0-9]{3})(?:\?|$|\/)/);
    if (match) return match[1];
    const matchId = urlStr.match(/\/p\/([a-zA-Z0-9]+)/i);
    return matchId ? matchId[1] : null;
  } catch {
    return null;
  }
}

/**
 * Consulta a API pública do Mercado Livre para dados reais verificáveis
 */
async function fetchMercadoLivreData(urlStr: string): Promise<ProductRealData | null> {
  const mlbId = extractMercadoLivreId(urlStr);
  const fetchedAt = new Date().toISOString();

  if (mlbId) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`https://api.mercadolibre.com/items/${mlbId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 RadarDeOfertas/1.0' },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        const item = await res.json();
        const currentPrice = Number(item.price) || 0;
        const originalPrice = item.original_price ? Number(item.original_price) : undefined;
        let discountPct = 0;
        if (originalPrice && originalPrice > currentPrice) {
          discountPct = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
        }

        const missingFields: string[] = [];
        if (!item.sold_quantity && item.sold_quantity !== 0) missingFields.push('vendas');

        return {
          externalId: item.id || mlbId,
          storeName: 'mercadolivre',
          title: item.title || 'Produto Mercado Livre',
          canonicalUrl: item.permalink || urlStr,
          currentPrice,
          originalPrice,
          discountPct,
          salesCount: typeof item.sold_quantity === 'number' ? item.sold_quantity : undefined,
          inStock: item.available_quantity > 0,
          // CRÍTICO: Buscar fotos maiores na galeria antes de thumbnails
          imageUrl: (item.pictures && item.pictures[0]?.secure_url) || item.secure_thumbnail || item.thumbnail,
          fetchedAt,
          dataSource: 'api_oficial',
          rawEvidences: {
            mlbId: item.id,
            status: item.status,
            available_quantity: item.available_quantity,
            sold_quantity: item.sold_quantity,
            pictures: item.pictures,
          },
          missingFields,
        };
      }
    } catch {
      // Fallback para parser HTML
    }
  }

  // Fallback: Parser de metadados HTML OpenGraph / JSON-LD
  return fetchHtmlMetadata(urlStr, 'mercadolivre', mlbId || 'MLB_UNKNOWN');
}

/**
 * Parser resiliente de metadados HTML (OpenGraph / JSON-LD / Twitter Cards)
 */
async function fetchHtmlMetadata(
  urlStr: string,
  store: StoreName,
  fallbackId: string
): Promise<ProductRealData> {
  const fetchedAt = new Date().toISOString();
  const missingFields: string[] = [];

  let title = '';
  let imageUrl = '';
  let currentPrice = 0;
  let originalPrice: number | undefined = undefined;
  let inStock = true;
  let rating: number | undefined = undefined;
  let reviewsCount: number | undefined = undefined;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(urlStr, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.ok) {
      const html = await res.text();

      // OpenGraph title
      const ogTitleMatch =
        html.match(/<meta property=["']og:title["'] content=["'](.*?)["']/i) ||
        html.match(/<meta name=["']twitter:title["'] content=["'](.*?)["']/i) ||
        html.match(/<title>(.*?)<\/title>/i);
      if (ogTitleMatch) {
        title = ogTitleMatch[1].replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code)).trim();
      }

      // OpenGraph image
      const ogImageMatch =
        html.match(/<meta property=["']og:image["'] content=["'](.*?)["']/i) ||
        html.match(/<meta name=["']twitter:image["'] content=["'](.*?)["']/i);
      if (ogImageMatch) {
        imageUrl = ogImageMatch[1];
      }

      // Preço via meta tags ou Schema.org JSON-LD
      const priceMatch =
        html.match(/<meta property=["']product:price:amount["'] content=["'](.*?)["']/i) ||
        html.match(/<meta property=["']og:price:amount["'] content=["'](.*?)["']/i) ||
        html.match(/"price":\s*"*([0-9.,]+)"*/i);

      if (priceMatch) {
        const parsed = parseFloat(priceMatch[1].replace(',', '.'));
        if (!isNaN(parsed) && parsed > 0) {
          currentPrice = parsed;
        }
      }

      // Preço original se houver
      const originalPriceMatch = html.match(/"originalPrice":\s*"*([0-9.,]+)"*/i);
      if (originalPriceMatch) {
        const parsedOrig = parseFloat(originalPriceMatch[1].replace(',', '.'));
        if (!isNaN(parsedOrig) && parsedOrig > currentPrice) {
          originalPrice = parsedOrig;
        }
      }

      // Avaliações via JSON-LD
      const ratingMatch = html.match(/"ratingValue":\s*"*([0-9.]+)"*/i);
      if (ratingMatch) {
        const parsedR = parseFloat(ratingMatch[1]);
        if (!isNaN(parsedR) && parsedR > 0) rating = parsedR;
      }

      const reviewsMatch = html.match(/"reviewCount":\s*"*([0-9]+)"*/i);
      if (reviewsMatch) {
        const parsedRev = parseInt(reviewsMatch[1], 10);
        if (!isNaN(parsedRev) && parsedRev > 0) reviewsCount = parsedRev;
      }
    }
  } catch (err) {
    // Falha silenciosa de rede com retorno de campos faltantes
  }

  if (!title) {
    title = `Produto ${store.toUpperCase()}`;
    missingFields.push('titulo');
  }
  if (!currentPrice || currentPrice <= 0) {
    missingFields.push('preco_atual');
  }
  if (rating === undefined) {
    missingFields.push('nota_avaliacao');
  }
  if (reviewsCount === undefined) {
    missingFields.push('quantidade_avaliacoes');
  }

  let discountPct = 0;
  if (originalPrice && originalPrice > currentPrice) {
    discountPct = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
  }

  return {
    externalId: fallbackId,
    storeName: store,
    title,
    canonicalUrl: urlStr,
    currentPrice: currentPrice || 0,
    originalPrice,
    discountPct,
    rating,
    reviewsCount,
    inStock,
    imageUrl: imageUrl || undefined,
    fetchedAt,
    dataSource: 'html_metadata',
    rawEvidences: {
      titleCaptured: Boolean(title),
      priceCaptured: currentPrice > 0,
    },
    missingFields,
  };
}

/**
 * Coletor oficial de produto real sem jamais inventar ou presumir dados
 */
export async function fetchProductRealData(
  cleanUrl: string,
  store: StoreName
): Promise<ProductRealData> {
  if (store === 'mercadolivre') {
    const mlData = await fetchMercadoLivreData(cleanUrl);
    if (mlData) return mlData;
  }

  if (store === 'shopee') {
    const ids = extractShopeeIds(cleanUrl);
    const shopeeId = ids ? `${ids.shopId}_${ids.itemId}` : 'SHOPEE_UNKNOWN';
    return fetchHtmlMetadata(cleanUrl, 'shopee', shopeeId);
  }

  if (store === 'netshoes') {
    const netshoesId = extractNetshoesId(cleanUrl) || 'NETSHOES_UNKNOWN';
    return fetchHtmlMetadata(cleanUrl, 'netshoes', netshoesId);
  }

  if (store === 'amazon') {
    const matchAsin = cleanUrl.match(/\/dp\/([A-Z0-9]{10})/i);
    const asin = matchAsin ? matchAsin[1] : 'AMZ_UNKNOWN';
    return fetchHtmlMetadata(cleanUrl, 'amazon', asin);
  }

  if (store === 'magalu') {
    const matchMagalu = cleanUrl.match(/\/p\/([a-z0-9]+)/i);
    const magId = matchMagalu ? matchMagalu[1] : 'MAGALU_UNKNOWN';
    return fetchHtmlMetadata(cleanUrl, 'magalu', magId);
  }

  return fetchHtmlMetadata(cleanUrl, store, 'PROD_UNKNOWN');
}
