import "server-only";

import type { AlgorithmSettings, CategoryPolicySettings } from "@/lib/types";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

export const DEFAULT_ALGORITHM_SETTINGS: AlgorithmSettings = {
  rolloutMode: "revisao_manual",
  minAutoApproveScore: 75, // Padrão estrito de qualidade 75/100
  minManualReviewScore: 60,
  minEffectivePrice: 24.99, // No mínimo R$ 24,99
  weights: {
    realDiscountAndPrice: 25,
    salesVolumeAndDemand: 20,
    reviewsAndRating: 15,
    couponValidity: 10,
    availabilityAndFreshness: 10,
    affiliateLinkQuality: 10,
    additionalSignals: 10,
  },
  enabledProviders: ["mercadolivre"],
};

export const DEFAULT_CATEGORY_POLICY: CategoryPolicySettings = {
  allowedCategories: [
    "Roupas masculinas e femininas",
    "Tênis e Calçados Esportivos",
    "Moda Fitness e Academia",
    "Creatina e Suplementos",
    "Perfumes e Cuidados Pessoais",
    "Moda, Esporte e Lifestyle",
  ],
  blockedCategories: [
    "Livros e Revistas",
    "E-books e Livros Digitais",
    "Receitas e Culinária Digital",
    "Cursos e Treinamentos Online",
    "Infoprodutos e Materiais Digitais",
    "Softwares e Licenças Digitais",
  ],
  blockedKeywords: [
    "livro",
    "livros",
    "ebook",
    "e-book",
    "receita",
    "receitas",
    "curso",
    "cursos",
    "infoproduto",
    "infoprodutos",
    "produto digital",
    "produtos digitais",
    "digital download",
    "apostila",
    "audiobook",
    "audio book",
    "pdf",
    "planilha digital",
    "licença digital",
  ],
  strictAllowedOnly: true,
};

let inMemorySettings: AlgorithmSettings = { ...DEFAULT_ALGORITHM_SETTINGS };
let inMemoryCategoryPolicy: CategoryPolicySettings = { ...DEFAULT_CATEGORY_POLICY };

export async function getAlgorithmSettings(): Promise<AlgorithmSettings> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("app_metadata")
        .select("value")
        .eq("key", "algorithm_settings")
        .maybeSingle();

      if (!error && data?.value) {
        return {
          ...DEFAULT_ALGORITHM_SETTINGS,
          ...(data.value as Partial<AlgorithmSettings>),
        };
      }
    } catch (err) {
      console.warn("[scoring-rules] Falha ao carregar configurações do Supabase:", err);
    }
  }

  return inMemorySettings;
}

export async function saveAlgorithmSettings(
  patch: Partial<AlgorithmSettings>
): Promise<AlgorithmSettings> {
  const current = await getAlgorithmSettings();
  const updated: AlgorithmSettings = {
    ...current,
    ...patch,
    weights: {
      ...current.weights,
      ...(patch.weights || {}),
    },
  };

  inMemorySettings = updated;

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from("app_metadata").upsert({
        key: "algorithm_settings",
        value: updated as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[scoring-rules] Erro ao salvar configurações no Supabase:", err);
    }
  }

  return updated;
}

export async function getCategoryPolicySettings(): Promise<CategoryPolicySettings> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("app_metadata")
        .select("value")
        .eq("key", "category_policy")
        .maybeSingle();

      if (!error && data?.value) {
        return {
          ...DEFAULT_CATEGORY_POLICY,
          ...(data.value as Partial<CategoryPolicySettings>),
        };
      }
    } catch (err) {
      console.warn("[scoring-rules] Falha ao carregar política de categorias:", err);
    }
  }

  return inMemoryCategoryPolicy;
}

export async function saveCategoryPolicySettings(
  patch: Partial<CategoryPolicySettings>
): Promise<CategoryPolicySettings> {
  const current = await getCategoryPolicySettings();
  const updated: CategoryPolicySettings = {
    ...current,
    ...patch,
  };

  inMemoryCategoryPolicy = updated;

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from("app_metadata").upsert({
        key: "category_policy",
        value: updated as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[scoring-rules] Erro ao salvar política de categorias no Supabase:", err);
    }
  }

  return updated;
}
