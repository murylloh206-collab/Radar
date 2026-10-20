import "server-only";

import { getAccessToken } from "../mercadolivre";
import { fetchDesiredOffers } from "./fetcher";
import { validateOfferCandidate, type CandidateRawItem, type ValidationResult } from "./validator";
import { saveApprovedOffers, type SaveApprovedResult } from "./database";
import { readDatabase } from "../storage";
import { rankOffersWithExploration, getCategoryPriceRange } from "../recommendation-engine";
import { getLearnedPreferences, getAllFeedbacks } from "../feedback-service";
import { recordScanRun } from "../history-service";
import type { Offer, LastSearchInfo } from "../../types";

export * from "./terms";
export * from "./validator";
export * from "./fetcher";
export * from "./database";

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
  console.log("🚀 [SCANNER] INICIANDO MOTOR DE ESCANEAMENTO RIGOROSO");
  console.log("=======================================================");

  const token = await getAccessToken();

  // 1. Fetcher: Consulta a API do Mercado Livre com os termos de desejo
  const fetchResult = await fetchDesiredOffers({
    token,
    maxTermsPerRun: 8,
    maxItemsPerTerm: 8,
    deadlineMs: 16_000,
  });

  const rawItems = fetchResult.items;
  console.log(`\n📦 [SCANNER] Total de itens brutos retornados pela API: ${rawItems.length}`);

  // Contadores para o relatório em etapas
  const stageCounts = {
    etapa1_itens_retornados_api: rawItems.length,
    etapa2_apos_preco_minimo_80: 0,
    etapa3_apos_blacklist_e_replicas: 0,
    etapa4_apos_desconto_real_15: 0,
    etapa5_gravados_atualizados_banco: 0,
    etapa6_retornados_frontend: 0,
  };

  const rejectedCounts = {
    minPrice: 0,
    maxPrice: 0,
    noOriginalPrice: 0,
    lowDiscount: 0,
    blacklistTerm: 0,
    total: 0,
  };

  const approvedCandidates: CandidateRawItem[] = [];

  // Carrega histórico de preferências e feedbacks para determinar faixas de preço aprendidas
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

  // 2. Validator: Aplica as barreiras de validação com faixa de preço aprendida por categoria (Etapa D)
  for (const item of rawItems) {
    const categoryName = item.categoryName || "Geral";
    const categoryPriceRange = getCategoryPriceRange(categoryName, feedbacks);
    const validation = validateOfferCandidate(item, categoryPriceRange);

    if (!validation.valid) {
      rejectedCounts.total++;
      if (validation.rejectionCode === "MIN_PRICE") rejectedCounts.minPrice++;
      else if (validation.rejectionCode === "MAX_PRICE") rejectedCounts.maxPrice++;
      else if (validation.rejectionCode === "NO_ORIGINAL_PRICE") rejectedCounts.noOriginalPrice++;
      else if (validation.rejectionCode === "LOW_DISCOUNT") rejectedCounts.lowDiscount++;
      else if (validation.rejectionCode === "BLACKLIST_TERM") rejectedCounts.blacklistTerm++;
      continue;
    }

    // Passou no piso de preço
    stageCounts.etapa2_apos_preco_minimo_80++;
    // Passou na blacklist e réplicas
    stageCounts.etapa3_apos_blacklist_e_replicas++;
    // Passou no desconto real >= 15%
    stageCounts.etapa4_apos_desconto_real_15++;

    approvedCandidates.push(item);
  }

  console.log(`\n✅ [SCANNER] Produtos rigorosamente APROVADOS no pipeline: ${approvedCandidates.length}`);
  console.log(`🚫 [SCANNER] Produtos REJEITADOS no pipeline: ${rejectedCounts.total}`);
  console.log(`   - Preço < piso ou > teto da categoria: ${rejectedCounts.minPrice + rejectedCounts.maxPrice}`);
  console.log(`   - Termos proibidos na blacklist: ${rejectedCounts.blacklistTerm}`);
  console.log(`   - Sem preço original / Sem desconto: ${rejectedCounts.noOriginalPrice}`);
  console.log(`   - Desconto real < 15%: ${rejectedCounts.lowDiscount}`);

  // 3. Database: Salva os produtos aprovados no banco
  const saveResult = await saveApprovedOffers(approvedCandidates);
  stageCounts.etapa5_gravados_atualizados_banco = saveResult.added + saveResult.updated;

  // 4. Carrega o banco atualizado e aplica ordenação inteligente para o frontend
  const db = await readDatabase();
  const rankedOffers = rankOffersWithExploration(db.offers, feedbacks, preferences);

  stageCounts.etapa6_retornados_frontend = rankedOffers.length;

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
    terms: fetchResult.termsQueried,
    found: rawItems.length,
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
    itemsFound: rawItems.length,
    itemsInserted: saveResult.added,
    itemsUpdated: saveResult.updated,
    itemsRejectedPrice: rejectedCounts.minPrice + (rejectedCounts.maxPrice || 0),
    itemsRejectedDiscount: rejectedCounts.noOriginalPrice + rejectedCounts.lowDiscount,
    itemsRejectedBlacklist: rejectedCounts.blacklistTerm,
    approvalRateBrain,
    approvalRateExploration,
    itemsBrain,
    itemsExploration,
    status: fetchResult.apiErrors.length > 0 && saveResult.added === 0 ? "parcial" : "sucesso",
    errorsLog: fetchResult.apiErrors,
    metadata: {
      itemsBrain,
      itemsExploration,
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
    found: rawItems.length,
    rejected: rejectedCounts,
    stageCounts,
  };
}
