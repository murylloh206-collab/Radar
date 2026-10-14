import "server-only";

import { getSupabaseClient, isSupabaseConfigured } from "./supabase";
import { readDatabase, updateDatabase, DEFAULT_LEARNED_PREFERENCES } from "./storage";
import {
  extractBrand,
  isProtectedSeller,
  trainLinearClassifier,
} from "./recommendation-engine";
import type {
  FeedbackAction,
  LearnedPreferences,
  Offer,
  OfferFeedback,
  RejectionReason,
} from "../types";

/**
 * SERVIÇO DE FEEDBACKS E PREFERÊNCIAS APRENDIDAS
 * ----------------------------------------------
 * Garante persistência resiliente no Supabase PostgreSQL com espelhamento transparente
 * em app_metadata e arquivo local, protegendo contra qualquer inconsistência de cache.
 */

export function sanitizeBlockedSellers(sellers: unknown): string[] {
  if (!Array.isArray(sellers)) return [];
  return sellers.filter((s): s is string => typeof s === "string" && !isProtectedSeller(s));
}

export interface RecordFeedbackInput {
  offerId: string;
  externalId: string;
  action: FeedbackAction;
  reason?: RejectionReason | string | null;
  offerData?: Partial<Offer>;
  customBrand?: string;
  customSeller?: string;
}

/**
 * Lê todas as preferências aprendidas atuais
 */
export async function getLearnedPreferences(): Promise<LearnedPreferences> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      // Tenta ler da tabela singleton learned_preferences
      const { data, error } = await supabase
        .from("learned_preferences")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (!error && data) {
        return {
          blockedBrands: Array.isArray(data.blocked_brands) ? data.blocked_brands : [],
          blockedSellers: sanitizeBlockedSellers(data.blocked_sellers),
          blockedKeywords: Array.isArray(data.blocked_keywords) ? data.blocked_keywords : [],
          blockedCategories: Array.isArray(data.blocked_categories) ? data.blocked_categories : [],
          featureWeights: typeof data.feature_weights === "object" ? data.feature_weights : {},
          totalApprovals: Number(data.total_approvals || 0),
          totalRejections: Number(data.total_rejections || 0),
          lastTrainedAt: data.last_trained_at || null,
        };
      }

      // Fallback para app_metadata
      const { data: metaData } = await supabase
        .from("app_metadata")
        .select("value")
        .eq("key", "learned_preferences")
        .maybeSingle();

      if (metaData?.value) {
        const val = metaData.value as LearnedPreferences;
        return {
          ...val,
          blockedSellers: sanitizeBlockedSellers(val.blockedSellers),
        };
      }
    } catch (err) {
      console.warn("[feedback-service] Falha ao consultar preferências no Supabase:", err);
    }
  }

  const db = await readDatabase();
  const prefs = db.learnedPreferences || DEFAULT_LEARNED_PREFERENCES;
  return {
    ...prefs,
    blockedSellers: sanitizeBlockedSellers(prefs.blockedSellers),
  };
}

/**
 * Lê todos os feedbacks históricos para alimentação do motor de recomendação
 */
export async function getAllFeedbacks(): Promise<OfferFeedback[]> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("offer_feedbacks")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        return data.map((row) => ({
          id: String(row.id),
          offerId: String(row.offer_id),
          externalId: String(row.external_id),
          action: row.action as FeedbackAction,
          reason: row.reason as RejectionReason | string | null,
          createdAt: String(row.created_at),
          category: row.category || undefined,
          brand: row.brand || undefined,
          title: String(row.title || ""),
          price: Number(row.price || 0),
          discountPercent: row.discount_percent != null ? Number(row.discount_percent) : null,
          rating: row.rating != null ? Number(row.rating) : null,
          reviewsCount: row.reviews_count != null ? Number(row.reviews_count) : null,
          freeShipping: Boolean(row.free_shipping),
          seller: row.seller || undefined,
          metadata: row.metadata || {},
        }));
      }

      // Fallback para app_metadata
      const { data: metaData } = await supabase
        .from("app_metadata")
        .select("value")
        .eq("key", "offer_feedbacks")
        .maybeSingle();

      if (metaData?.value && Array.isArray(metaData.value)) {
        return metaData.value as OfferFeedback[];
      }
    } catch (err) {
      console.warn("[feedback-service] Falha ao consultar feedbacks no Supabase:", err);
    }
  }

  const db = await readDatabase();
  return db.feedbacks || [];
}

/**
 * Registra o feedback do usuário, atualiza bloqueios, ajusta pesos e salva em cascata
 */
export async function recordOfferFeedback(input: RecordFeedbackInput): Promise<{
  ok: boolean;
  feedback: OfferFeedback;
  preferences: LearnedPreferences;
}> {
  const now = new Date().toISOString();
  const db = await readDatabase();
  const targetOffer = db.offers.find((o) => o.id === input.offerId || o.externalId === input.externalId) || input.offerData;

  const brand = input.customBrand || extractBrand(targetOffer?.title || "", targetOffer?.brand);
  const seller = input.customSeller || targetOffer?.sellerName || "Mercado Livre";
  const title = targetOffer?.title || "Oferta sem título";
  const price = targetOffer?.price || 0;
  const discountPercent = targetOffer?.discountPercent ?? null;
  const rating = targetOffer?.rating ?? null;
  const reviewsCount = targetOffer?.reviewsCount ?? null;
  const freeShipping = Boolean(targetOffer?.freeShipping);
  const category = targetOffer?.searchTerm || "Geral";

  const feedback: OfferFeedback = {
    id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    offerId: input.offerId,
    externalId: input.externalId,
    action: input.action,
    reason: input.reason || null,
    createdAt: now,
    category,
    brand,
    title,
    price,
    discountPercent,
    rating,
    reviewsCount,
    freeShipping,
    seller,
    metadata: {
      url: targetOffer?.originalUrl,
      source: targetOffer?.source || "mercadolivre",
    },
  };

  // Carrega as preferências atuais
  const currentPreferences = await getLearnedPreferences();
  const blockedBrandsSet = new Set(currentPreferences.blockedBrands || []);
  const blockedSellersSet = new Set(sanitizeBlockedSellers(currentPreferences.blockedSellers || []));
  const blockedKeywordsSet = new Set(currentPreferences.blockedKeywords || []);
  const blockedCategoriesSet = new Set(currentPreferences.blockedCategories || []);

  // 1. Aplicação imediata de bloqueios manuais
  if (input.action === "bloquear_marca" || input.reason === "marca_indesejada") {
    if (brand && brand !== "Genérica") {
      blockedBrandsSet.add(brand);
    }
  }

  if (input.action === "bloquear_vendedor") {
    if (seller && !isProtectedSeller(seller)) {
      blockedSellersSet.add(seller);
    } else {
      console.warn(`[feedback-service] Vendedor protegido ou plataforma genérica ignorada no bloqueio: "${seller}"`);
    }
  }

  let totalApprovals = currentPreferences.totalApprovals || 0;
  let totalRejections = currentPreferences.totalRejections || 0;

  if (input.action === "aprovar") {
    totalApprovals++;
  } else if (input.action === "rejeitar" || input.action === "bloquear_marca" || input.action === "bloquear_vendedor") {
    totalRejections++;
  }

  // Carrega histórico para retreino se necessário
  const allFeedbacks = await getAllFeedbacks();
  allFeedbacks.unshift(feedback);

  const totalDecisions = totalApprovals + totalRejections;
  let featureWeights = currentPreferences.featureWeights || {};
  let lastTrainedAt = currentPreferences.lastTrainedAt;

  // A partir de 50 decisões, treina classificador simples com os dados de feedback
  if (totalDecisions >= 50) {
    try {
      featureWeights = trainLinearClassifier(allFeedbacks);
      lastTrainedAt = now;
      console.log(`[feedback-service] Modelo classificador linear atualizado com ${allFeedbacks.length} feedbacks.`);
    } catch (trainErr) {
      console.warn("[feedback-service] Erro ao treinar classificador:", trainErr);
    }
  }

  const updatedPreferences: LearnedPreferences = {
    blockedBrands: Array.from(blockedBrandsSet),
    blockedSellers: sanitizeBlockedSellers(Array.from(blockedSellersSet)),
    blockedKeywords: Array.from(blockedKeywordsSet),
    blockedCategories: Array.from(blockedCategoriesSet),
    featureWeights,
    totalApprovals,
    totalRejections,
    lastTrainedAt,
  };

  // 2. Persistência no Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();

      // Grava na tabela offer_feedbacks
      const { error: fbErr } = await supabase.from("offer_feedbacks").insert({
        id: feedback.id,
        offer_id: feedback.offerId,
        external_id: feedback.externalId,
        action: feedback.action,
        reason: feedback.reason,
        created_at: feedback.createdAt,
        category: feedback.category,
        brand: feedback.brand,
        title: feedback.title,
        price: feedback.price,
        discount_percent: feedback.discountPercent,
        rating: feedback.rating,
        reviews_count: feedback.reviewsCount,
        free_shipping: feedback.freeShipping,
        seller: feedback.seller,
        metadata: feedback.metadata,
      });

      if (fbErr) {
        console.warn("[feedback-service] Tabela offer_feedbacks não disponível, espelhando em app_metadata:", fbErr.message);
      }

      // Grava na tabela learned_preferences
      const { error: prefErr } = await supabase.from("learned_preferences").upsert({
        id: 1,
        blocked_brands: updatedPreferences.blockedBrands,
        blocked_sellers: updatedPreferences.blockedSellers,
        blocked_keywords: updatedPreferences.blockedKeywords,
        blocked_categories: updatedPreferences.blockedCategories,
        feature_weights: updatedPreferences.featureWeights,
        total_approvals: updatedPreferences.totalApprovals,
        total_rejections: updatedPreferences.totalRejections,
        last_trained_at: updatedPreferences.lastTrainedAt,
        updated_at: now,
      });

      if (prefErr) {
        console.warn("[feedback-service] Tabela learned_preferences não disponível, espelhando em app_metadata:", prefErr.message);
      }

      // Espelhamento resiliente em app_metadata
      await supabase.from("app_metadata").upsert({
        key: "learned_preferences",
        value: updatedPreferences,
        updated_at: now,
      });

      // Salva os 100 últimos feedbacks em app_metadata como salvaguarda
      await supabase.from("app_metadata").upsert({
        key: "offer_feedbacks",
        value: allFeedbacks.slice(0, 100),
        updated_at: now,
      });
    } catch (dbErr) {
      console.warn("[feedback-service] Falha ao persistir no Supabase:", dbErr);
    }
  }

  // 3. Atualiza estado local no storage
  await updateDatabase((localDb) => {
    localDb.feedbacks = allFeedbacks.slice(0, 500);
    localDb.learnedPreferences = updatedPreferences;

    // Se a oferta foi rejeitada no card, atualiza o status dela na lista de ofertas
    const target = localDb.offers.find((o) => o.id === input.offerId || o.externalId === input.externalId);
    if (target) {
      if (input.action === "rejeitar" || input.action === "bloquear_marca" || input.action === "bloquear_vendedor") {
        target.status = "rejeitado";
        target.statusChangedAt = now;
        target.rejectionDetail = {
          reason: typeof input.reason === "string" ? input.reason : input.action,
          failedFilters: ["user_explicit_feedback"],
          rejectedAt: now,
        };
      } else if (input.action === "aprovar") {
        target.status = "aprovado";
        target.statusChangedAt = now;
      }
    }
  });

  return {
    ok: true,
    feedback,
    preferences: updatedPreferences,
  };
}

/**
 * Remove um item bloqueado (desbloquear marca, vendedor, palavra ou categoria)
 */
export async function removeBlockedItem(
  type: "brand" | "seller" | "keyword" | "category",
  value: string
): Promise<LearnedPreferences> {
  const current = await getLearnedPreferences();
  const cleanVal = value.trim().toLowerCase();
  const now = new Date().toISOString();

  if (type === "brand") {
    current.blockedBrands = current.blockedBrands.filter((b) => b.trim().toLowerCase() !== cleanVal);
  } else if (type === "seller") {
    current.blockedSellers = current.blockedSellers.filter((s) => s.trim().toLowerCase() !== cleanVal);
  } else if (type === "keyword") {
    current.blockedKeywords = current.blockedKeywords.filter((k) => k.trim().toLowerCase() !== cleanVal);
  } else if (type === "category") {
    current.blockedCategories = current.blockedCategories.filter((c) => c.trim().toLowerCase() !== cleanVal);
  }

  // Salva no Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from("learned_preferences").upsert({
        id: 1,
        blocked_brands: current.blockedBrands,
        blocked_sellers: current.blockedSellers,
        blocked_keywords: current.blockedKeywords,
        blocked_categories: current.blockedCategories,
        updated_at: now,
      });

      await supabase.from("app_metadata").upsert({
        key: "learned_preferences",
        value: current,
        updated_at: now,
      });
    } catch (err) {
      console.warn("[feedback-service] Falha ao atualizar preferências no Supabase:", err);
    }
  }

  // Salva no storage local
  await updateDatabase((db) => {
    db.learnedPreferences = current;
  });

  return current;
}

/**
 * Redefine todo o aprendizado de preferências do usuário (Reset completo)
 */
export async function resetAllLearning(): Promise<LearnedPreferences> {
  const emptyPrefs: LearnedPreferences = {
    blockedBrands: [],
    blockedSellers: [],
    blockedKeywords: [],
    blockedCategories: [],
    featureWeights: {},
    totalApprovals: 0,
    totalRejections: 0,
    lastTrainedAt: null,
  };

  const now = new Date().toISOString();

  // Limpa no Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();

      // Zera preferências singleton
      await supabase.from("learned_preferences").upsert({
        id: 1,
        blocked_brands: [],
        blocked_sellers: [],
        blocked_keywords: [],
        blocked_categories: [],
        feature_weights: {},
        total_approvals: 0,
        total_rejections: 0,
        last_trained_at: null,
        updated_at: now,
      });

      // Limpa tabela de feedbacks
      await supabase.from("offer_feedbacks").delete().neq("id", "none");

      // Limpa app_metadata
      await supabase.from("app_metadata").upsert({
        key: "learned_preferences",
        value: emptyPrefs,
        updated_at: now,
      });

      await supabase.from("app_metadata").upsert({
        key: "offer_feedbacks",
        value: [],
        updated_at: now,
      });
    } catch (err) {
      console.warn("[feedback-service] Falha ao resetar no Supabase:", err);
    }
  }

  // Limpa no storage local
  await updateDatabase((db) => {
    db.feedbacks = [];
    db.learnedPreferences = emptyPrefs;
    // Reseta flags de exploração e score de preferência das ofertas
    for (const o of db.offers) {
      o.preferenceScore = 0.5;
      o.recommendationReason = "Oferta em destaque";
      o.isExploration = false;
    }
  });

  return emptyPrefs;
}
