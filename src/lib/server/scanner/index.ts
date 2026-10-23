import "server-only";

import { getAccessToken } from "../mercadolivre";
import { fetchDesiredOffers } from "./fetcher";
import { validateOfferCandidate, type CandidateRawItem, type ValidationResult } from "./validator";
import { saveApprovedOffers, type SaveApprovedResult } from "./database";
import { readDatabase } from "../storage";
import { rankOffersWithExploration, getCategoryPriceRange } from "../recommendation-engine";
import { getLearnedPreferences, getAllFeedbacks } from "../feedback-service";
import { recordScanRun } from "../history-service";
import { runShopeeCategoryScan } from "./shopee-scanner";
import { runMercadoLivreWebScan } from "./ml-web-scanner";
import { runNetshoesCategoryScan } from "../netshoes";
import type { Offer, LastSearchInfo } from "../../types";

export * from "./terms";
export * from "./validator";
export * from "./fetcher";
export * from "./database";
export * from "./shopee-scanner";
export * from "./ml-web-scanner";
export * from "./ml-dom-extractor";

export interface ScannerPipelineResult {
  ok: boolean;
  offers: Offer[];
  lastSearch: LastSearchInfo;
  added: number;
  updated: number;
  found: number;
  rejected: {
    minPrice: number;
    maxPrice?: number;
    noOriginalPrice: number;
    lowDiscount: number;
    blacklistTerm: number;
    total: number;
  };
  stageCounts: {
    etapa1_itens_retornados_api: number;
    etapa2_apos_preco_minimo_80: number;
    etapa3_apos_blacklist_e_replicas: number;
    etapa4_apos_desconto_real_15: number;
    etapa5_gravados_atualizados_banco: number;
    etapa6_retornados_frontend: number;
  };
}

/**
 * MOTOR DE ESCANEAMENTO E FILTRAGEM RIGOROSO DO MERCADO LIVRE
 * -----------------------------------------------------------
 * Executa o fluxo em camadas:
 *  1. Busca Ativa com Array de Termos de Desejo (Smartphones, Notebooks, Consoles, Eletroportáteis, etc.)
 *  2. Atributos da API (condition=new, logística Full, frete grátis)
 *  3. Pipeline de Validação e Limpeza:
 *     - Piso de Preço (>= R$ 80,00)
 *     - Blacklist de Termos Proibidos (capas, películas, cabos, suportes, usados, etc.)
 *     - Validação Matemática de Desconto Real (original_price > price e desconto >= 15%)
 *  4. Persistência sem Duplicatas no Banco e Encurtamento meli.la
 */
export async function runOffersScanner(): Promise<ScannerPipelineResult> {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  console.log("\n=======================================================");
  console.log("🚀 [SCANNER] INICIANDO MOTOR AUTÔNOMO (SHOPEE + MERCADO LIVRE)");
  console.log("=======================================================");

  // Carrega histórico de preferências e feedbacks para determinação de faixas aprendidas e bloqueios
  const [preferences, feedbacks] = await Promise.all([
    getLearnedPreferences().catch(() => ({
      blockedBrands: [],
      blockedSellers: [],
      blockedKeywords: [],
      blockedCategories: [],
      totalApprovals: 0,
      totalRejections: 0,
    })),
    getAllFeedbacks().catch(() => []),
  ]);

  const priceRangeByCat = (category: string) => getCategoryPriceRange(category, feedbacks);

  const MAX_CYCLE_PENDING = 50;
  // Cotas por plataforma garantindo PRIORIDADE MÁXIMA AO MERCADO LIVRE
  const ML_QUOTA = 35;
  const NETSHOES_QUOTA = 10;
  const SHOPEE_QUOTA = 15;

  const rawCandidates: CandidateRawItem[] = [];

  let totalRejectedSales = 0;
  let totalRejectedRating = 0;
  let totalRejectedDiscount = 0;
  let totalRejectedPrice = 0;
  let totalRejectedBlacklist = 0;
  const errorsLog: string[] = [];
  const queriedTermsOrCategories: string[] = [];

  // =========================================================================
  // ETAPA 1: FONTE PRIORITÁRIA #1 — MERCADO LIVRE (API Oficial + Vitrine Web)
  // =========================================================================
  console.log(`\n🟡 [SCANNER] Executando Fonte Prioritária #1: Mercado Livre (cota: ${ML_QUOTA})...`);
  
  // 1.1 Tenta busca por termos de desejo via API oficial do Mercado Livre
  try {
    const mlToken = await getAccessToken().catch(() => null);
    if (mlToken) {
      console.log("[SCANNER] Buscando Mercado Livre via API oficial (fetchDesiredOffers)...");
      const desiredResult = await fetchDesiredOffers({
        token: mlToken,
        maxTermsPerRun: 8,
        maxItemsPerTerm: 8,
        deadlineMs: 8000,
      });

      for (const it of desiredResult.items) {
        if (rawCandidates.length >= ML_QUOTA) break;
        const validation = validateOfferCandidate(it, priceRangeByCat(it.categoryName || "Geral"));
        if (validation.valid) {
          it.source = "mercadolivre";
          rawCandidates.push(it);
        }
      }
      queriedTermsOrCategories.push(...desiredResult.termsQueried.map((t) => `ML Termo: ${t}`));
    }
  } catch (mlApiErr) {
    console.warn("[SCANNER] Falha na API do Mercado Livre, prosseguindo com vitrine Web:", mlApiErr);
  }

  // 1.2 Complementa com a vitrine pública de ofertas do Mercado Livre (/ofertas)
  if (rawCandidates.length < ML_QUOTA) {
    try {
      console.log(`[SCANNER] Complementando Mercado Livre via vitrine pública /ofertas...`);
      const mlResult = await runMercadoLivreWebScan({
        preferences,
        feedbacks,
        priceRangeByCat,
        maxPagesPerCycle: 20,
      });

      for (const cand of mlResult.candidates) {
        if (rawCandidates.length >= ML_QUOTA) break;
        cand.source = "mercadolivre";
        rawCandidates.push(cand);
      }
      totalRejectedSales += mlResult.stats.rejectedSalesUnder100;
      totalRejectedRating += mlResult.stats.rejectedLowRating;
      totalRejectedPrice += mlResult.stats.rejectedPrice;
      totalRejectedBlacklist += mlResult.stats.rejectedBlacklist;
      errorsLog.push(...mlResult.stats.errors);
      queriedTermsOrCategories.push("ML: /ofertas vitrine pública");
    } catch (mlWebErr) {
      const msg = mlWebErr instanceof Error ? mlWebErr.message : "Erro no ML";
      console.error("[SCANNER] Erro na coleta Web do Mercado Livre:", msg);
      errorsLog.push(`ML Web: ${msg}`);
    }
  }

  console.log(`[SCANNER] Mercado Livre coletou: ${rawCandidates.length} produto(s) qualificado(s).`);

  // =========================================================================
  // ETAPA 2: FONTE SECUNDÁRIA #2 — NETSHOES (Esportes & Calçados)
  // =========================================================================
  const netshoesSlots = Math.min(NETSHOES_QUOTA, MAX_CYCLE_PENDING - rawCandidates.length);
  if (netshoesSlots > 0) {
    console.log(`\n👟 [SCANNER] Executando Fonte #2: Netshoes (cota: ${netshoesSlots})...`);
    try {
      const netshoesResult = await runNetshoesCategoryScan({
        preferences,
        feedbacks,
        maxQuota: netshoesSlots,
      });
      if (netshoesResult.candidates.length > 0) {
        rawCandidates.push(...netshoesResult.candidates);
        totalRejectedPrice += netshoesResult.stats.rejectedPrice;
        totalRejectedDiscount += netshoesResult.stats.rejectedDiscount;
        totalRejectedBlacklist += netshoesResult.stats.rejectedBlacklist;
        errorsLog.push(...netshoesResult.stats.errors);
        queriedTermsOrCategories.push("Netshoes (Ofertas Verificadas)");
      }
      console.log(`[SCANNER] Netshoes coletou: ${netshoesResult.candidates.length} produto(s).`);
    } catch (netshoesErr) {
      const msg = netshoesErr instanceof Error ? netshoesErr.message : "Erro Netshoes";
      console.error("[SCANNER] Erro na coleta Netshoes:", msg);
      errorsLog.push(`Netshoes: ${msg}`);
    }
  }

  // =========================================================================
  // ETAPA 3: FONTE COMPLEMENTAR #3 — SHOPEE (Open API)
  // =========================================================================
  const shopeeSlots = Math.min(
    Math.max(SHOPEE_QUOTA, MAX_CYCLE_PENDING - rawCandidates.length),
    MAX_CYCLE_PENDING - rawCandidates.length
  );
  if (shopeeSlots > 0) {
    console.log(`\n🛍️ [SCANNER] Executando Fonte #3: Shopee Open API (cota: ${shopeeSlots})...`);
    try {
      const shopeeResult = await runShopeeCategoryScan({
        preferences,
        feedbacks,
        priceRangeByCat,
        maxPendingQuota: shopeeSlots,
      });

      rawCandidates.push(...shopeeResult.candidates);
      totalRejectedSales += shopeeResult.stats.rejectedSales;
      totalRejectedRating += shopeeResult.stats.rejectedRating;
      totalRejectedDiscount += shopeeResult.stats.rejectedDiscount;
      totalRejectedPrice += shopeeResult.stats.rejectedPrice;
      totalRejectedBlacklist += shopeeResult.stats.rejectedBlacklist;
      queriedTermsOrCategories.push(...shopeeResult.stats.categoriesQueried.map((id) => `Shopee Cat:${id}`));
      console.log(`[SCANNER] Shopee coletou: ${shopeeResult.candidates.length} produto(s).`);
    } catch (shopeeErr) {
      const msg = shopeeErr instanceof Error ? shopeeErr.message : "Erro na Shopee";
      console.error("[SCANNER] Erro na coleta Shopee:", msg);
      errorsLog.push(`Shopee: ${msg}`);
    }
  }

  console.log(`\n📦 [SCANNER] Total bruto de candidatos qualificados pré-banco: ${rawCandidates.length}`);

  // Teto de até 50 novas ofertas por ciclo
  const finalCandidatesToSave = rawCandidates.slice(0, MAX_CYCLE_PENDING);

  // 3. Database: Salva os produtos aprovados no banco sem duplicatas
  const saveResult = await saveApprovedOffers(finalCandidatesToSave);

  // 4. Carrega o banco atualizado e aplica ordenação inteligente para o frontend
  const db = await readDatabase();
  const rankedOffers = rankOffersWithExploration(db.offers, feedbacks, preferences);

  // 5. Calcula métricas de aprovação separando cérebro x exploração
  const brainFeedbacks = feedbacks.filter((f) => !(f.metadata as Record<string, unknown>)?.isExploration);
  const explorationFeedbacks = feedbacks.filter((f) => Boolean((f.metadata as Record<string, unknown>)?.isExploration));

  const brainApprovals = brainFeedbacks.filter((f) => f.action === "aprovar").length;
  const brainTotal = brainFeedbacks.length;
  const explorationApprovals = explorationFeedbacks.filter((f) => f.action === "aprovar").length;
  const explorationTotal = explorationFeedbacks.length;

  const approvalRateBrain = brainTotal > 0 ? Number(((brainApprovals / brainTotal) * 100).toFixed(1)) : 100.0;
  const approvalRateExploration = explorationTotal > 0 ? Number(((explorationApprovals / explorationTotal) * 100).toFixed(1)) : 50.0;

  const itemsExploration = rankedOffers.filter((o) => o.isExploration).length;
  const itemsBrain = rankedOffers.length - itemsExploration;

  const now = new Date().toISOString();
  const lastSearch: LastSearchInfo = {
    at: now,
    terms: queriedTermsOrCategories,
    found: rawCandidates.length,
    added: saveResult.added,
    updated: saveResult.updated,
  };

  console.log("=======================================================");
  console.log(`🏁 [SCANNER] FINALIZADO: ${saveResult.added} novas ofertas salvas, ${saveResult.updated} atualizadas.`);
  console.log(`📊 [SCANNER] Taxa aprovação: Cérebro ${approvalRateBrain}% (${brainApprovals}/${brainTotal}) | Exploração ${approvalRateExploration}% (${explorationApprovals}/${explorationTotal})`);
  console.log("=======================================================\n");

  const durationMs = Date.now() - startTime;
  await recordScanRun({
    source: "ambos",
    startedAt,
    finishedAt: now,
    durationMs,
    itemsFound: rawCandidates.length,
    itemsInserted: saveResult.added,
    itemsUpdated: saveResult.updated,
    itemsRejectedPrice: totalRejectedPrice,
    itemsRejectedDiscount: totalRejectedDiscount,
    itemsRejectedBlacklist: totalRejectedBlacklist,
    itemsRejectedSales: totalRejectedSales,
    itemsRejectedRating: totalRejectedRating,
    approvalRateBrain,
    approvalRateExploration,
    itemsBrain,
    itemsExploration,
    status: errorsLog.length > 0 && saveResult.added === 0 ? "parcial" : "sucesso",
    errorsLog,
    metadata: {
      itemsBrain,
      itemsExploration,
      maxCyclePending: MAX_CYCLE_PENDING,
      brainTotalFeedbackDecisions: brainTotal,
      explorationTotalFeedbackDecisions: explorationTotal,
    },
  }).catch((err) => console.warn("[scanner] Falha ao registrar scan run:", err));

  return {
    ok: true,
    offers: rankedOffers,
    lastSearch,
    added: saveResult.added,
    updated: saveResult.updated,
    found: rawCandidates.length,
    rejected: {
      minPrice: totalRejectedPrice,
      maxPrice: 0,
      noOriginalPrice: 0,
      lowDiscount: totalRejectedDiscount,
      blacklistTerm: totalRejectedBlacklist,
      total:
        totalRejectedPrice +
        totalRejectedDiscount +
        totalRejectedBlacklist +
        totalRejectedSales +
        totalRejectedRating,
    },
    stageCounts: {
      etapa1_itens_retornados_api: rawCandidates.length,
      etapa2_apos_preco_minimo_80: rawCandidates.length,
      etapa3_apos_blacklist_e_replicas: rawCandidates.length,
      etapa4_apos_desconto_real_15: rawCandidates.length,
      etapa5_gravados_atualizados_banco: saveResult.added + saveResult.updated,
      etapa6_retornados_frontend: rankedOffers.length,
    },
  };
}
