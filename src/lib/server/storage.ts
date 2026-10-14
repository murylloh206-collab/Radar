import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  mapDbToOffer,
  mapOfferToDb,
  mapDbToSchedulerSettings,
} from "./supabase";
import { generateProductFingerprint } from "./offer-scoring-engine";
import { rescheduleFutureOffers } from "./scheduler-engine";
import type {
  AutomationSettings,
  LastSearchInfo,
  Offer,
  SchedulerSettings,
  TombstoneRecord,
} from "../types";

export interface MLAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  userId?: number;
}

export const DEFAULT_SCHEDULER_SETTINGS: SchedulerSettings = {
  state: "ativo",
  startHour: "07:00",
  endHour: "00:00",
  dailyTarget: 51,
  maxPerHour: 5,
  timezone: "America/Sao_Paulo",
  channelDestination: "Radar de Ofertas",
  consecutiveFailures: 0,
  maxConsecutiveFailures: 3,
  lastDispatchedAt: null,
  lastDispatchedOfferTitle: null,
  lastError: null,
  mode: "interval_minutes",
  distribution: "fixed",
  intervalMinutes: 20,
  postsPerHour: 3,
  minScore: 75,
  minPendingScore: 75,
  minAutoPublishScore: 75,
  minManualPublishScore: 75,
  requireVerifiableDiscount: true,
};

export const DEFAULT_AUTOMATION: AutomationSettings = {
  autoSendEnabled: true,
  channelDestination: "Grupo VIP de Ofertas",
  intervalMinutes: 5,
  lastDispatchedAt: null,
  nextScheduledAt: null,
  lastDispatchedOfferTitle: null,
  lastError: null,
};

export interface DatabaseShape {
  version: 1;
  updatedAt: string;
  lastSearch: LastSearchInfo | null;
  offers: Offer[];
  mlAuth?: MLAuthTokens | null;
  automation?: AutomationSettings;
  scheduler?: SchedulerSettings;
  tombstones?: TombstoneRecord[];
}

const EMPTY_DB: DatabaseShape = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  lastSearch: null,
  offers: [],
  mlAuth: null,
  automation: DEFAULT_AUTOMATION,
  scheduler: DEFAULT_SCHEDULER_SETTINGS,
  tombstones: [],
};

function isProduction(): boolean {
  return Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");
}

function dataFilePath(): string {
  if (process.env.VERCEL) {
    return path.join("/tmp", "ofertas.json");
  }
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), config.dataFile);
}

const globalForQueue = globalThis as unknown as { __offersWriteQueue?: Promise<unknown> };

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalForQueue.__offersWriteQueue ?? Promise.resolve();
  const run = previous.then(task, task);
  globalForQueue.__offersWriteQueue = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------------------
// LEITURA DO BANCO (Supabase em produção / JSON em desenvolvimento local)
// ---------------------------------------------------------------------------

export async function readDatabase(): Promise<DatabaseShape> {
  const useSupabase = isSupabaseConfigured();

  if (isProduction() && !useSupabase) {
    throw new Error(
      "Armazenamento persistente ausente em produção: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY " +
        "devem ser configurados na Vercel. Não é permitido o uso de JSON local efêmero em produção."
    );
  }

  if (useSupabase) {
    try {
      const supabase = getSupabaseClient();

      // Busca ofertas
      const { data: offersData, error: offersError } = await supabase
        .from("offers")
        .select("*")
        .order("created_at", { ascending: false });

      if (offersError) {
        throw new Error(`Erro ao ler ofertas do Supabase: ${offersError.message}`);
      }

      // Busca configurações do agendador
      const { data: schedData } = await supabase
        .from("scheduler_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      // Busca metadados (última busca e auth ML)
      const { data: metaData } = await supabase
        .from("app_metadata")
        .select("key, value");

      let mlAuth: MLAuthTokens | null = null;
      let lastSearch: LastSearchInfo | null = null;
      let tombstones: TombstoneRecord[] = [];

      if (metaData) {
        for (const row of metaData) {
          if (row.key === "ml_auth") mlAuth = row.value as MLAuthTokens;
          if (row.key === "last_search") lastSearch = row.value as LastSearchInfo;
          if (row.key === "tombstones") tombstones = (row.value as TombstoneRecord[]) || [];
        }
      }

      const schedulerSettings = schedData
        ? mapDbToSchedulerSettings(schedData as Record<string, unknown>)
        : DEFAULT_SCHEDULER_SETTINGS;

      const offers = (offersData || []).map((row) =>
        mapDbToOffer(row as Record<string, unknown>)
      );

      return {
        version: 1,
        updatedAt: new Date().toISOString(),
        lastSearch,
        offers,
        mlAuth,
        scheduler: schedulerSettings,
        tombstones,
        automation: {
          autoSendEnabled: schedulerSettings.state === "ativo",
          channelDestination: schedulerSettings.channelDestination,
          intervalMinutes: 5,
          lastDispatchedAt: schedulerSettings.lastDispatchedAt,
          nextScheduledAt: null,
          lastDispatchedOfferTitle: schedulerSettings.lastDispatchedOfferTitle,
          lastError: schedulerSettings.lastError,
        },
      };
    } catch (err) {
      if (isProduction()) {
        console.error("[storage] Falha crítica de conexão com Supabase em produção:", err);
        throw err;
      }
      console.warn("[storage] Falha ao conectar ao Supabase local, recorrendo a arquivo de desenvolvimento:", err);
    }
  }

  // Fallback ESTRITAMENTE para desenvolvimento local offline
  const file = dataFilePath();
  try {
    const raw = await fs.readFile(/* turbopackIgnore: true */ file, "utf8");
    const parsed = JSON.parse(raw) as Partial<DatabaseShape>;
    return {
      ...EMPTY_DB,
      ...parsed,
      offers: Array.isArray(parsed.offers) ? parsed.offers : [],
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY_DB);
    if (err instanceof SyntaxError) {
      const backup = `${file}.corrompido-${Date.now()}.json`;
      await fs.copyFile(file, backup).catch(() => undefined);
      console.error(`[storage] JSON inválido. Cópia salva em ${backup}`);
      return structuredClone(EMPTY_DB);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// ATUALIZAÇÃO DO BANCO
// ---------------------------------------------------------------------------

async function writeJsonDatabase(db: DatabaseShape): Promise<void> {
  const file = dataFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const content = JSON.stringify({ ...db, updatedAt: new Date().toISOString() }, null, 2);
  await fs.writeFile(tmp, content, "utf8");
  try {
    await fs.rename(tmp, file);
  } catch {
    await fs.writeFile(file, content, "utf8");
    await fs.rm(tmp, { force: true });
  }
}

export function updateDatabase<T>(mutator: (db: DatabaseShape) => T | Promise<T>): Promise<T> {
  return enqueue(async () => {
    const db = await readDatabase();
    const result = await mutator(db);

    const useSupabase = isSupabaseConfigured();

    if (useSupabase) {
      try {
        const supabase = getSupabaseClient();

        // 1. Upsert em lote de ofertas
        if (db.offers.length > 0) {
          const dbRows = db.offers.map(mapOfferToDb);
          const { error: upsertError } = await supabase
            .from("offers")
            .upsert(dbRows, { onConflict: "id" });

          if (upsertError) {
            throw new Error(`Erro ao persistir ofertas no Supabase: ${upsertError.message}`);
          }
        }

        // 2. Persistir metadados (ML Auth e Last Search)
        if (db.mlAuth !== undefined) {
          await supabase.from("app_metadata").upsert({
            key: "ml_auth",
            value: db.mlAuth,
            updated_at: new Date().toISOString(),
          });
        }

        if (db.lastSearch) {
          await supabase.from("app_metadata").upsert({
            key: "last_search",
            value: db.lastSearch,
            updated_at: new Date().toISOString(),
          });
        }

        if (db.tombstones) {
          await supabase.from("app_metadata").upsert({
            key: "tombstones",
            value: db.tombstones,
            updated_at: new Date().toISOString(),
          });
        }

        return result;
      } catch (err) {
        if (isProduction()) {
          console.error("[storage] Erro fatal ao gravar no Supabase em produção:", err);
          throw err;
        }
        console.warn("[storage] Falha ao persistir no Supabase local, salvando em JSON local:", err);
      }
    }

    if (isProduction()) {
      throw new Error("Impossível persistir dados: Supabase não está configurado em produção.");
    }

    await writeJsonDatabase(db);
    return result;
  });
}

// ---------------------------------------------------------------------------
// OPERAÇÕES DO AGENDADOR E CONCORRÊNCIA ATÔMICA
// ---------------------------------------------------------------------------

export async function getSchedulerSettings(): Promise<SchedulerSettings> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("scheduler_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (error) {
        throw new Error(`Erro ao buscar scheduler_settings: ${error.message}`);
      }

      const { data: extData } = await supabase
        .from("app_metadata")
        .select("value")
        .eq("key", "scheduler_extended_config")
        .maybeSingle();

      const extended = (extData?.value as Partial<SchedulerSettings>) || {};

      if (data) {
        const base = mapDbToSchedulerSettings(data as Record<string, unknown>);
        return {
          ...base,
          ...extended,
          mode: extended.mode || base.mode || "interval_minutes",
          distribution: extended.distribution || base.distribution || "fixed",
          intervalMinutes: extended.intervalMinutes ?? base.intervalMinutes ?? 20,
          postsPerHour: extended.postsPerHour ?? base.postsPerHour ?? 3,
          minScore: extended.minScore ?? base.minScore ?? 75,
          minPendingScore: extended.minPendingScore ?? 75,
          minAutoPublishScore: extended.minAutoPublishScore ?? extended.minScore ?? base.minScore ?? 75,
          minManualPublishScore: extended.minManualPublishScore ?? 75,
          requireVerifiableDiscount: extended.requireVerifiableDiscount ?? true,
        };
      }
    } catch (err) {
      if (isProduction()) throw err;
    }
  }

  const db = await readDatabase();
  return db.scheduler ?? DEFAULT_SCHEDULER_SETTINGS;
}

export async function updateSchedulerSettings(
  patch: Partial<SchedulerSettings>
): Promise<SchedulerSettings> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const current = await getSchedulerSettings();
      const updated: SchedulerSettings = { ...current, ...patch };

      const dbPatch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (patch.state !== undefined) dbPatch.state = patch.state;
      if (patch.startHour !== undefined) dbPatch.start_hour = patch.startHour;
      if (patch.endHour !== undefined) dbPatch.end_hour = patch.endHour;
      if (patch.dailyTarget !== undefined) dbPatch.daily_target = patch.dailyTarget;
      if (patch.maxPerHour !== undefined) dbPatch.max_per_hour = patch.maxPerHour;
      if (patch.timezone !== undefined) dbPatch.timezone = patch.timezone;
      if (patch.channelDestination !== undefined)
        dbPatch.channel_destination = patch.channelDestination;
      if (patch.consecutiveFailures !== undefined)
        dbPatch.consecutive_failures = patch.consecutiveFailures;
      if (patch.maxConsecutiveFailures !== undefined)
        dbPatch.max_consecutive_failures = patch.maxConsecutiveFailures;
      if (patch.lastDispatchedAt !== undefined)
        dbPatch.last_dispatched_at = patch.lastDispatchedAt;
      if (patch.lastDispatchedOfferTitle !== undefined)
        dbPatch.last_dispatched_title = patch.lastDispatchedOfferTitle;
      if (patch.lastError !== undefined) dbPatch.last_error = patch.lastError;

      await supabase
        .from("scheduler_settings")
        .update(dbPatch)
        .eq("id", 1);

      // Persiste metadados estendidos (modo, intervalo, distribuição, minScore)
      await supabase.from("app_metadata").upsert({
        key: "scheduler_extended_config",
        value: updated as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      });

      // Se alterou horários ou intervalo ou modo, recalcula os slots das ofertas futuras
      const scheduleParamsChanged =
        patch.startHour !== undefined ||
        patch.endHour !== undefined ||
        patch.mode !== undefined ||
        patch.intervalMinutes !== undefined ||
        patch.dailyTarget !== undefined ||
        patch.postsPerHour !== undefined ||
        patch.distribution !== undefined;

      if (scheduleParamsChanged) {
        const { data: offersData } = await supabase
          .from("offers")
          .select("*")
          .eq("status", "aprovado")
          .eq("whatsapp_status", "agendado");

        if (offersData && offersData.length > 0) {
          const offersToUpdate = offersData.map((row) => mapDbToOffer(row as Record<string, unknown>));
          const recalculated = rescheduleFutureOffers(offersToUpdate, updated);
          const dbRows = recalculated.map(mapOfferToDb);
          await supabase.from("offers").upsert(dbRows, { onConflict: "id" });
        }
      }

      return updated;
    } catch (err) {
      if (isProduction()) throw err;
    }
  }

  return updateDatabase((db) => {
    const current = db.scheduler ?? DEFAULT_SCHEDULER_SETTINGS;
    const updated: SchedulerSettings = { ...current, ...patch };
    db.scheduler = updated;

    const scheduleParamsChanged =
      patch.startHour !== undefined ||
      patch.endHour !== undefined ||
      patch.mode !== undefined ||
      patch.intervalMinutes !== undefined ||
      patch.dailyTarget !== undefined ||
      patch.postsPerHour !== undefined ||
      patch.distribution !== undefined;

    if (scheduleParamsChanged && db.offers) {
      db.offers = rescheduleFutureOffers(db.offers, updated);
    }

    return updated;
  });
}

/**
 * Reclama atomicamente a próxima oferta agendada vencida.
 * Usa a função PostgreSQL `claim_next_scheduled_offer()` com FOR UPDATE SKIP LOCKED
 * para garantir que dois crons ou dois usuários nunca peguem a mesma oferta.
 */
export async function claimNextScheduledOfferAtomic(forceImmediate = false): Promise<Offer | null> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();

      if (forceImmediate) {
        // Envio manual forçado: seleciona a próxima oferta aprovada da fila independente do horário
        const { data: candidates, error: findError } = await supabase
          .from("offers")
          .select("id")
          .eq("status", "aprovado")
          .in("whatsapp_status", ["agendado", "falhou"])
          .order("scheduled_for", { ascending: true, nullsFirst: false })
          .limit(1);

        if (findError) throw findError;
        if (!candidates || candidates.length === 0) return null;

        const targetId = candidates[0].id;
        const now = new Date().toISOString();
        const { data: updated, error: updateError } = await supabase
          .from("offers")
          .update({
            whatsapp_status: "enviando",
            locked_at: now,
            updated_at: now,
          })
          .eq("id", targetId)
          .select();

        if (updateError) throw updateError;
        if (updated && updated.length > 0) {
          return mapDbToOffer(updated[0] as Record<string, unknown>);
        }
        return null;
      }

      const { data, error } = await supabase.rpc("claim_next_scheduled_offer", {
        lock_timeout_seconds: 120,
      });

      if (error) {
        throw new Error(`Erro ao executar claim_next_scheduled_offer RPC: ${error.message}`);
      }

      if (Array.isArray(data) && data.length > 0) {
        return mapDbToOffer(data[0] as Record<string, unknown>);
      }
      return null;
    } catch (err) {
      if (isProduction()) throw err;
    }
  }

  // Fallback seguro com fila de escrita em dev local
  return updateDatabase((db) => {
    const now = new Date().toISOString();
    const candidate = db.offers
      .filter((o) => {
        if (o.status !== "aprovado") return false;
        const minAuto = db.scheduler?.minAutoPublishScore ?? db.scheduler?.minScore ?? 75;
        if ((o.opportunityScore ?? 0) < minAuto) return false;
        if (forceImmediate && (o.whatsappStatus === "agendado" || o.whatsappStatus === "falhou")) {
          return true;
        }
        if (o.whatsappStatus === "agendado" && (!o.scheduledFor || o.scheduledFor <= now)) {
          return true;
        }
        // Lock expirado (> 2 min)
        if (o.whatsappStatus === "enviando" && o.lockedAt) {
          const lockedTime = new Date(o.lockedAt).getTime();
          return Date.now() - lockedTime > 120_000;
        }
        return false;
      })
      .sort((a, b) => {
        const timeA = a.scheduledFor || a.statusChangedAt || a.createdAt;
        const timeB = b.scheduledFor || b.statusChangedAt || b.createdAt;
        return timeA.localeCompare(timeB);
      })[0];

    if (!candidate) return null;

    candidate.whatsappStatus = "enviando";
    candidate.lockedAt = now;
    candidate.sendAttempts = (candidate.sendAttempts || 0) + 1;
    candidate.updatedAt = now;

    return structuredClone(candidate);
  });
}

/**
 * Registra o sucesso real de despacho da oferta.
 * Zera o contador de falhas consecutivas do circuit breaker.
 */
export async function recordDispatchSuccess(
  offerId: string,
  offerTitle: string
): Promise<void> {
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();

      // 1. Atualiza a oferta para publicado/enviado
      const { error: offerError } = await supabase
        .from("offers")
        .update({
          status: "publicado",
          whatsapp_status: "enviado",
          whatsapp_sent_at: now,
          locked_at: null,
          updated_at: now,
        })
        .eq("id", offerId);

      if (offerError) throw offerError;

      // 2. Reseta circuit breaker no scheduler
      await supabase
        .from("scheduler_settings")
        .update({
          consecutive_failures: 0,
          last_dispatched_at: now,
          last_dispatched_title: offerTitle,
          last_error: null,
          updated_at: now,
        })
        .eq("id", 1);

      return;
    } catch (err) {
      if (isProduction()) throw err;
    }
  }

  await updateDatabase((db) => {
    const offer = db.offers.find((o) => o.id === offerId);
    if (offer) {
      offer.status = "publicado";
      offer.whatsappStatus = "enviado";
      offer.whatsappSentAt = now;
      offer.lockedAt = null;
      offer.updatedAt = now;
    }
    if (db.scheduler) {
      db.scheduler.consecutiveFailures = 0;
      db.scheduler.lastDispatchedAt = now;
      db.scheduler.lastDispatchedOfferTitle = offerTitle;
      db.scheduler.lastError = null;
    }
  });
}

/**
 * Marca uma oferta como esgotada ou pausada pelo vendedor no Mercado Livre.
 * Remove a oferta da fila de agendamento sem acionar o circuit breaker do agendador.
 */
export async function markOfferOutOfStock(
  offerId: string,
  reason: string
): Promise<void> {
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase
        .from("offers")
        .update({
          status: "rejeitado",
          whatsapp_status: "falhou",
          whatsapp_error: reason,
          locked_at: null,
          updated_at: now,
        })
        .eq("id", offerId);
      return;
    } catch (err) {
      if (isProduction()) throw err;
    }
  }

  await updateDatabase((db) => {
    const offer = db.offers.find((o) => o.id === offerId);
    if (offer) {
      offer.status = "rejeitado";
      offer.whatsappStatus = "falhou";
      offer.whatsappError = reason;
      offer.lockedAt = null;
      offer.updatedAt = now;
    }
  });
}

/**
 * Registra falha de despacho.
 * Aplica circuit breaker: pausa automaticamente após 3 falhas consecutivas.
 */
export async function recordDispatchFailure(
  offerId: string,
  errorMessage: string
): Promise<{ autoPaused: boolean; consecutiveFailures: number }> {
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();

      // 1. Busca estado atual da oferta para ver tentativas
      const { data: offerData } = await supabase
        .from("offers")
        .select("send_attempts")
        .eq("id", offerId)
        .single();

      const attempts = (offerData?.send_attempts ?? 1);
      const isMaxAttempts = attempts >= 3;

      // Se passou de 3 tentativas na oferta, marca 'falhou'; senão volta para 'agendado' para tentar mais tarde
      await supabase
        .from("offers")
        .update({
          whatsapp_status: isMaxAttempts ? "falhou" : "agendado",
          whatsapp_error: errorMessage,
          scheduled_for: isMaxAttempts ? null : new Date(Date.now() + 5 * 60_000).toISOString(),
          locked_at: null,
          updated_at: now,
        })
        .eq("id", offerId);

      // 2. Incrementa falhas consecutivas no scheduler
      const { data: schedData } = await supabase
        .from("scheduler_settings")
        .select("consecutive_failures, max_consecutive_failures")
        .eq("id", 1)
        .single();

      const currentFailures = (schedData?.consecutive_failures ?? 0) + 1;
      const maxFailures = schedData?.max_consecutive_failures ?? 3;
      const shouldAutoPause = currentFailures >= maxFailures;

      await supabase
        .from("scheduler_settings")
        .update({
          consecutive_failures: currentFailures,
          state: shouldAutoPause ? "interrompido_erro" : undefined,
          last_error: `[${now}] Falha no envio: ${errorMessage}`,
          updated_at: now,
        })
        .eq("id", 1);

      return {
        autoPaused: shouldAutoPause,
        consecutiveFailures: currentFailures,
      };
    } catch (err) {
      if (isProduction()) throw err;
    }
  }

  return updateDatabase((db) => {
    const offer = db.offers.find((o) => o.id === offerId);
    if (offer) {
      const attempts = offer.sendAttempts ?? 1;
      const isMax = attempts >= 3;
      offer.whatsappStatus = isMax ? "falhou" : "agendado";
      offer.whatsappError = errorMessage;
      offer.scheduledFor = isMax ? null : new Date(Date.now() + 5 * 60_000).toISOString();
      offer.lockedAt = null;
      offer.updatedAt = now;
    }

    const currentFailures = (db.scheduler?.consecutiveFailures ?? 0) + 1;
    const maxFailures = db.scheduler?.maxConsecutiveFailures ?? 3;
    const shouldAutoPause = currentFailures >= maxFailures;

    if (db.scheduler) {
      db.scheduler.consecutiveFailures = currentFailures;
      if (shouldAutoPause) {
        db.scheduler.state = "interrompido_erro";
      }
      db.scheduler.lastError = `[${now}] Falha no envio: ${errorMessage}`;
    }

    return {
      autoPaused: shouldAutoPause,
      consecutiveFailures: currentFailures,
    };
  });
}

// ---------------------------------------------------------------------------
// FUNÇÕES LEGADAS DE COMPATIBILIDADE (ML Tokens & Automation)
// ---------------------------------------------------------------------------

export async function getStoredMLTokens(): Promise<MLAuthTokens | null> {
  const db = await readDatabase();
  return db.mlAuth ?? null;
}

export async function saveStoredMLTokens(tokens: MLAuthTokens | null): Promise<void> {
  await updateDatabase((db) => {
    db.mlAuth = tokens;
  });
}

export async function getStoredAutomationSettings(): Promise<AutomationSettings> {
  const sched = await getSchedulerSettings();
  return {
    ...DEFAULT_AUTOMATION,
    autoSendEnabled: sched.state === "ativo",
    channelDestination: sched.channelDestination,
    intervalMinutes: 5,
    lastDispatchedAt: sched.lastDispatchedAt,
    lastDispatchedOfferTitle: sched.lastDispatchedOfferTitle,
    lastError: sched.lastError,
  };
}

export async function saveStoredAutomationSettings(
  patch: Partial<AutomationSettings>
): Promise<AutomationSettings> {
  if (patch.autoSendEnabled !== undefined) {
    await updateSchedulerSettings({
      state: patch.autoSendEnabled ? "ativo" : "pausado",
    });
  }
  if (patch.channelDestination !== undefined) {
    await updateSchedulerSettings({
      channelDestination: patch.channelDestination,
    });
  }
  return getStoredAutomationSettings();
}

// ---------------------------------------------------------------------------
// GESTÃO DE TOMBSTONES E EXCLUSÃO DEFINITIVA DE REJEITADOS
// ---------------------------------------------------------------------------

export async function getTombstones(): Promise<TombstoneRecord[]> {
  const db = await readDatabase();
  return db.tombstones || [];
}

export async function deleteOffersPermanently(
  offerIds: string[]
): Promise<{ deletedCount: number; tombstonesAdded: number }> {
  if (!offerIds || offerIds.length === 0) {
    return { deletedCount: 0, tombstonesAdded: 0 };
  }

  return enqueue(async () => {
    const db = await readDatabase();
    const targetOffers = db.offers.filter(
      (o) => offerIds.includes(o.id) && o.status === "rejeitado"
    );

    if (targetOffers.length === 0) {
      return { deletedCount: 0, tombstonesAdded: 0 };
    }

    const now = new Date().toISOString();
    const newTombstones: TombstoneRecord[] = targetOffers.map((o) => ({
      id: o.id,
      fingerprint: o.productFingerprint || generateProductFingerprint(o.source, o.externalId, o.title),
      title: o.title,
      rejectedAt: now,
      reason: o.rejectionDetail?.reason || o.opportunityReason || "Exclusão definitiva manual",
    }));

    const existingTombstones = db.tombstones || [];
    // Mantém no máximo os 2000 tombstones mais recentes
    const mergedTombstones = [...existingTombstones, ...newTombstones].slice(-2000);
    db.tombstones = mergedTombstones;

    const targetIdsSet = new Set(targetOffers.map((o) => o.id));
    db.offers = db.offers.filter((o) => !targetIdsSet.has(o.id));

    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseClient();
        // 1. Deleta do banco PostgreSQL
        const { error: delError } = await supabase
          .from("offers")
          .delete()
          .in("id", Array.from(targetIdsSet));

        if (delError) {
          throw new Error(`Erro ao deletar ofertas do Supabase: ${delError.message}`);
        }

        // 2. Persiste tombstones atualizados
        await supabase.from("app_metadata").upsert({
          key: "tombstones",
          value: mergedTombstones,
          updated_at: now,
        });

        return { deletedCount: targetOffers.length, tombstonesAdded: newTombstones.length };
      } catch (err) {
        if (isProduction()) throw err;
        console.warn("[storage] Falha ao deletar no Supabase, atualizando JSON local:", err);
      }
    }

    await writeJsonDatabase(db);
    return { deletedCount: targetOffers.length, tombstonesAdded: newTombstones.length };
  });
}


