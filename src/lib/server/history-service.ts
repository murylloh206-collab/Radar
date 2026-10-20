import "server-only";

import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

export interface OfferPriceHistoryRow {
  id: string;
  offer_id: string;
  external_id: string;
  source: string;
  price: number;
  original_price: number | null;
  discount_percent: number | null;
  recorded_at: string;
}

export interface ScanRunInput {
  id?: string;
  source: "shopee" | "mercadolivre" | "ambos";
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  itemsFound: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsRejectedPrice?: number;
  itemsRejectedDiscount?: number;
  itemsRejectedBlacklist?: number;
  itemsRejectedSales?: number;
  itemsRejectedRating?: number;
  approvalRateBrain?: number;
  approvalRateExploration?: number;
  itemsBrain?: number;
  itemsExploration?: number;
  status: "sucesso" | "falha" | "parcial" | "em_execucao";
  errorMessage?: string | null;
  errorsLog?: string[];
  metadata?: Record<string, unknown>;
}

export interface ScanRunRecord extends ScanRunInput {
  id: string;
}

/**
 * Registra uma entrada relacional no histórico de preços da oferta.
 */
export async function recordPriceHistoryItem(input: {
  offerId: string;
  externalId: string;
  source: string;
  price: number;
  originalPrice?: number | null;
  discountPercent?: number | null;
  recordedAt?: string;
}): Promise<void> {
  const recordedAt = input.recordedAt || new Date().toISOString();
  const id = `ph_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("offer_price_history").insert({
        id,
        offer_id: input.offerId,
        external_id: input.externalId,
        source: input.source,
        price: input.price,
        original_price: input.originalPrice ?? null,
        discount_percent: input.discountPercent ?? null,
        recorded_at: recordedAt,
      });

      if (error) {
        // Se a tabela ainda não foi criada no Supabase SQL Editor, não quebra a coleta
        console.warn("[history-service] Tabela offer_price_history indisponível no Supabase:", error.message);
      }
    } catch (err) {
      console.warn("[history-service] Falha ao gravar histórico de preços no Supabase:", err);
    }
  }
}

/**
 * Registra o relatório completo de uma execução do coletor (Scan Run).
 */
export async function recordScanRun(run: ScanRunInput): Promise<ScanRunRecord> {
  const id = run.id || `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record: ScanRunRecord = { ...run, id };

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("scan_runs").upsert({
        id,
        source: record.source,
        started_at: record.startedAt,
        finished_at: record.finishedAt || null,
        duration_ms: record.durationMs ?? null,
        items_found: record.itemsFound,
        items_inserted: record.itemsInserted,
        items_updated: record.itemsUpdated,
        items_rejected_price: record.itemsRejectedPrice ?? 0,
        items_rejected_discount: record.itemsRejectedDiscount ?? 0,
        items_rejected_blacklist: record.itemsRejectedBlacklist ?? 0,
        items_rejected_sales: record.itemsRejectedSales ?? 0,
        items_rejected_rating: record.itemsRejectedRating ?? 0,
        approval_rate_brain: record.approvalRateBrain ?? null,
        approval_rate_exploration: record.approvalRateExploration ?? null,
        status: record.status,
        error_message: record.errorMessage || null,
        errors_log: record.errorsLog || [],
        metadata: {
          itemsBrain: record.itemsBrain ?? 0,
          itemsExploration: record.itemsExploration ?? 0,
          ...(record.metadata || {}),
        },
      });

      if (error) {
        // Fallback resiliente: espelha os últimos 50 runs em app_metadata
        console.warn("[history-service] Tabela scan_runs não disponível no Supabase, salvando em app_metadata:", error.message);
        const { data: meta } = await supabase
          .from("app_metadata")
          .select("value")
          .eq("key", "recent_scan_runs")
          .maybeSingle();

        const runs = Array.isArray(meta?.value) ? (meta.value as ScanRunRecord[]) : [];
        runs.unshift(record);
        await supabase.from("app_metadata").upsert({
          key: "recent_scan_runs",
          value: runs.slice(0, 50),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn("[history-service] Falha ao registrar scan run no Supabase:", err);
    }
  }

  return record;
}

/**
 * Consulta os relatórios recentes de execução para auditoria.
 */
export async function getRecentScanRuns(limit = 20): Promise<ScanRunRecord[]> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("scan_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);

      if (!error && Array.isArray(data)) {
        return data.map((r) => ({
          id: String(r.id),
          source: r.source as ScanRunInput["source"],
          startedAt: String(r.started_at),
          finishedAt: r.finished_at ? String(r.finished_at) : undefined,
          durationMs: r.duration_ms != null ? Number(r.duration_ms) : undefined,
          itemsFound: Number(r.items_found || 0),
          itemsInserted: Number(r.items_inserted || 0),
          itemsUpdated: Number(r.items_updated || 0),
          itemsRejectedPrice: Number(r.items_rejected_price || 0),
          itemsRejectedDiscount: Number(r.items_rejected_discount || 0),
          itemsRejectedBlacklist: Number(r.items_rejected_blacklist || 0),
          itemsRejectedSales: Number(r.items_rejected_sales || 0),
          itemsRejectedRating: Number(r.items_rejected_rating || 0),
          status: r.status as ScanRunInput["status"],
          errorMessage: r.error_message || null,
          errorsLog: Array.isArray(r.errors_log) ? r.errors_log : [],
        }));
      }

      // Fallback em app_metadata
      const { data: meta } = await supabase
        .from("app_metadata")
        .select("value")
        .eq("key", "recent_scan_runs")
        .maybeSingle();

      if (meta?.value && Array.isArray(meta.value)) {
        return (meta.value as ScanRunRecord[]).slice(0, limit);
      }
    } catch (err) {
      console.warn("[history-service] Falha ao buscar scan runs:", err);
    }
  }

  return [];
}
