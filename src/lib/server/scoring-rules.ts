import "server-only";

import type { AlgorithmSettings, AlgorithmRolloutMode } from "@/lib/types";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

export const DEFAULT_ALGORITHM_SETTINGS: AlgorithmSettings = {
  rolloutMode: "revisao_manual",
  minAutoApproveScore: 80,
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

let inMemorySettings: AlgorithmSettings = { ...DEFAULT_ALGORITHM_SETTINGS };

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
