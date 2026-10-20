import "server-only";

import {
  extractDealCardsFromOfertasHtml,
  extractSoldQuantity,
  extractReviewsMetrics,
  type MLPublicDealCard,
} from "./ml-dom-extractor";
import { checkBlacklist, type CandidateRawItem } from "./validator";
import { extractBrand, normalizeText, type CategoryPriceRange } from "../recommendation-engine";
import type { LearnedPreferences, OfferFeedback } from "@/lib/types";

export interface MLWebScannerStats {
  cardsFound: number;
  filteredBeforePage: number;
  pagesVisited: number;
  qualified: number;
  rejectedPrice: number;
  rejectedBlacklist: number;
  rejectedBlockedBrandOrKeyword: number;
  rejectedMissingMetrics: number; // descartados porque vendidos ou avaliações não puderam ser lidos
  rejectedSalesUnder100: number;
  rejectedReviewsUnder100: number;
  rejectedLowRating: number;
  errors: string[];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Escaneia a vitrine pública de ofertas do Mercado Livre (mercadolivre.com.br/ofertas)
 * 1. Coleta os cards públicos sem sessão.
 * 2. Pré-filtra no próprio card (preço, desconto, blacklist de termos e bloqueios aprendidos).
 * 3. Para até 20 candidatos pré-qualificados, abre a página individual com pausa de 2 a 5s para ler vendidos e avaliações.
 * 4. NUNCA aprova se faltar dado de vendas ou avaliações (regra rigorosa).
 */
export async function runMercadoLivreWebScan(options: {
  preferences: LearnedPreferences;
  feedbacks: OfferFeedback[];
  priceRangeByCat?: (category: string) => CategoryPriceRange;
  maxPagesPerCycle?: number;
}): Promise<{
  candidates: CandidateRawItem[];
  stats: MLWebScannerStats;
}> {
  const stats: MLWebScannerStats = {
    cardsFound: 0,
    filteredBeforePage: 0,
    pagesVisited: 0,
    qualified: 0,
    rejectedPrice: 0,
    rejectedBlacklist: 0,
    rejectedBlockedBrandOrKeyword: 0,
    rejectedMissingMetrics: 0,
    rejectedSalesUnder100: 0,
    rejectedReviewsUnder100: 0,
    rejectedLowRating: 0,
    errors: [],
  };

  const blockedBrandsSet = new Set((options.preferences.blockedBrands || []).map((b) => normalizeText(b)));
  const blockedKeywords = (options.preferences.blockedKeywords || []).map((k) => normalizeText(k)).filter(Boolean);

  console.log("[ml-web-scanner] 1. Acessando vitrine pública mercadolivre.com.br/ofertas...");

  let ofertasHtml = "";
  try {
    const res = await fetch("https://www.mercadolivre.com.br/ofertas", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ao carregar mercadolivre.com.br/ofertas`);
    }

    ofertasHtml = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[ml-web-scanner] Erro ao carregar ofertas:", msg);
    stats.errors.push(msg);
    return { candidates: [], stats };
  }

  // Extrai cards
  const dealCards = extractDealCardsFromOfertasHtml(ofertasHtml);
  stats.cardsFound = dealCards.length;
  console.log(`[ml-web-scanner] Encontrados ${dealCards.length} cards com links de produto na vitrine.`);

  // 2. PRÉ-FILTRAGEM NOS CARDS (Antes de abrir qualquer página individual)
  const preQualifiedCards: MLPublicDealCard[] = [];

  for (const card of dealCards) {
    const titleNorm = normalizeText(card.title);
    const brand = extractBrand(card.title);
    const brandNorm = normalizeText(brand);

    // a) Blacklist de miudezas/acessórios
    const blacklisted = checkBlacklist(card.title);
    if (blacklisted) {
      stats.rejectedBlacklist++;
      stats.filteredBeforePage++;
      continue;
    }

    // b) Bloqueios aprendidos (marca / palavras proibidas)
    if (blockedBrandsSet.has(brandNorm)) {
      stats.rejectedBlockedBrandOrKeyword++;
      stats.filteredBeforePage++;
      continue;
    }

    let hasBlockedWord = false;
    for (const kw of blockedKeywords) {
      if (titleNorm.includes(kw)) {
        hasBlockedWord = true;
        break;
      }
    }
    if (hasBlockedWord) {
      stats.rejectedBlockedBrandOrKeyword++;
      stats.filteredBeforePage++;
      continue;
    }

    // c) Preço e Desconto preliminares
    const priceRange = options.priceRangeByCat ? options.priceRangeByCat("Geral") : { minPrice: 80, maxPrice: 450 };
    if (card.price < priceRange.minPrice || card.price > priceRange.maxPrice) {
      stats.rejectedPrice++;
      stats.filteredBeforePage++;
      continue;
    }

    preQualifiedCards.push(card);
  }

  console.log(
    `[ml-web-scanner] ${preQualifiedCards.length} cards aprovados na pré-filtragem (descartados preliminarmente: ${stats.filteredBeforePage}).`
  );

  // 3. VISITA CONTROLADA ÀS PÁGINAS INDIVIDUAIS (Máximo de 20 por ciclo com pausa de 2 a 5s)
  const maxPages = options.maxPagesPerCycle ?? 20;
  const cardsToInspect = preQualifiedCards.slice(0, maxPages);
  const candidates: CandidateRawItem[] = [];

  for (let i = 0; i < cardsToInspect.length; i++) {
    const card = cardsToInspect[i];
    stats.pagesVisited++;

    // Pausa aleatória entre 2000ms e 5000ms entre as requisições (exceto antes da primeira)
    if (i > 0) {
      const waitMs = Math.floor(Math.random() * 3000) + 2000;
      await sleep(waitMs);
    }

    console.log(
      `[ml-web-scanner] (${i + 1}/${cardsToInspect.length}) Abrindo produto individual: "${card.title.slice(0, 50)}"...`
    );

    try {
      const pageRes = await fetch(card.productUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!pageRes.ok) {
        stats.rejectedMissingMetrics++;
        console.warn(`[ml-web-scanner] Falha HTTP ${pageRes.status} na página do produto ${card.externalId}`);
        continue;
      }

      const productHtml = await pageRes.text();

      // Extrai métricas
      const soldQuantity = extractSoldQuantity(productHtml);
      const { rating, reviewsCount } = extractReviewsMetrics(productHtml);

      // REGRA ESTRITA: Se não conseguir extrair os números, descarta! Nunca aprovar por falta de dado.
      if (soldQuantity === null || reviewsCount === null) {
        stats.rejectedMissingMetrics++;
        console.log(
          `[ml-web-scanner] 🚫 DESCARTADO por métricas ausentes: soldQuantity=${soldQuantity}, reviewsCount=${reviewsCount} | "${card.title}"`
        );
        continue;
      }

      // Filtro estrito: Vendas > 100
      if (soldQuantity <= 100) {
        stats.rejectedSalesUnder100++;
        console.log(`[ml-web-scanner] 🚫 DESCARTADO por vendas baixas: ${soldQuantity} <= 100 | "${card.title}"`);
        continue;
      }

      // Filtro estrito: Avaliações > 100
      if (reviewsCount <= 100) {
        stats.rejectedReviewsUnder100++;
        console.log(
          `[ml-web-scanner] 🚫 DESCARTADO por avaliações baixas: ${reviewsCount} <= 100 | "${card.title}"`
        );
        continue;
      }

      // Filtro de nota (se presente, deve ser >= 4.0)
      if (rating !== null && rating < 4.0) {
        stats.rejectedLowRating++;
        console.log(`[ml-web-scanner] 🚫 DESCARTADO por nota baixa: ${rating} < 4.0 | "${card.title}"`);
        continue;
      }

      // Produto aprovado com sucesso!
      console.log(
        `[ml-web-scanner] ✅ APROVADO: "${card.title}" (R$ ${card.price.toFixed(2)}) | Vendidos: ${soldQuantity} | Avaliações: ${reviewsCount} (★ ${rating ?? "N/A"})`
      );

      candidates.push({
        source: "mercadolivre",
        externalId: card.externalId,
        title: card.title,
        thumbnail: card.thumbnail,
        price: card.price,
        originalPrice: card.originalPrice,
        currency: "BRL",
        originalUrl: card.productUrl,
        freeShipping: card.freeShipping,
        isFull: card.isFull,
        categoryName: "Mercado Livre Ofertas",
        condition: "new",
        rating,
        reviewsCount,
      });

      stats.qualified++;
    } catch (pageErr) {
      const msg = pageErr instanceof Error ? pageErr.message : "Erro na página";
      stats.rejectedMissingMetrics++;
      stats.errors.push(`Produto ${card.externalId}: ${msg}`);
      console.warn(`[ml-web-scanner] Falha ao extrair produto ${card.externalId}:`, msg);
    }
  }

  console.log(`\n[ml-web-scanner] Varredura ML concluída: ${candidates.length} ofertas qualificadas.`);
  console.log(`   - Cards visitados: ${stats.pagesVisited}`);
  console.log(`   - Descartados por dados ausentes: ${stats.rejectedMissingMetrics}`);
  console.log(`   - Descartados por vendas <= 100: ${stats.rejectedSalesUnder100}`);
  console.log(`   - Descartados por avaliações <= 100: ${stats.rejectedReviewsUnder100}`);

  return { candidates, stats };
}
