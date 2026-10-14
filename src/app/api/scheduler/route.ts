import { NextResponse } from "next/server";
import { getSchedulerSettings, updateSchedulerSettings, readDatabase } from "@/lib/server/storage";
import { computeSchedulerStats } from "@/lib/server/scheduler-engine";
import type { ApiError, SchedulerMode, ScheduleDistribution, SchedulerSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/scheduler
 * Retorna as configurações do agendador e as estatísticas em tempo real com diagnósticos claros.
 */
export async function GET() {
  try {
    const settings = await getSchedulerSettings();
    const db = await readDatabase();
    const stats = computeSchedulerStats(db.offers, settings);

    return NextResponse.json({
      settings,
      stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[api/scheduler GET]", err);
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/scheduler
 * Atualiza parâmetros operacionais do agendador (janela, modos, distribuição, meta diária, intervalo e score mínimo).
 */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Partial<SchedulerSettings> | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json<ApiError>(
        { error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }

    const patch: Partial<SchedulerSettings> = {};

    // 1. Estado do agendador
    if (body.state !== undefined) {
      if (!["ativo", "pausado", "interrompido_erro"].includes(body.state)) {
        return NextResponse.json<ApiError>(
          { error: "Estado do agendador inválido. Use 'ativo' ou 'pausado'." },
          { status: 400 }
        );
      }
      patch.state = body.state;
      if (body.state === "ativo") {
        patch.consecutiveFailures = 0;
        patch.lastError = null;
      }
    }

    // 2. Modo de agendamento (meta diária, posts por hora, intervalo entre posts)
    if (body.mode !== undefined) {
      if (!["daily_target", "posts_per_hour", "interval_minutes"].includes(body.mode)) {
        return NextResponse.json<ApiError>(
          { error: "Modo de agendamento inválido. Opções: 'daily_target', 'posts_per_hour', 'interval_minutes'." },
          { status: 400 }
        );
      }
      patch.mode = body.mode as SchedulerMode;
    }

    // 3. Tipo de distribuição (fixa vs aleatória controlada)
    if (body.distribution !== undefined) {
      if (!["fixed", "randomized"].includes(body.distribution)) {
        return NextResponse.json<ApiError>(
          { error: "Distribuição inválida. Opções: 'fixed' ou 'randomized'." },
          { status: 400 }
        );
      }
      patch.distribution = body.distribution as ScheduleDistribution;
    }

    // 4. Parâmetros numéricos
    if (body.dailyTarget !== undefined) {
      const target = Number(body.dailyTarget);
      if (isNaN(target) || target < 1 || target > 150) {
        return NextResponse.json<ApiError>(
          { error: "Meta diária deve estar entre 1 e 150 ofertas." },
          { status: 400 }
        );
      }
      patch.dailyTarget = target;
    }

    if (body.postsPerHour !== undefined) {
      const pph = Number(body.postsPerHour);
      if (isNaN(pph) || pph < 1 || pph > 30) {
        return NextResponse.json<ApiError>(
          { error: "Posts por hora deve estar entre 1 e 30." },
          { status: 400 }
        );
      }
      patch.postsPerHour = pph;
    }

    if (body.intervalMinutes !== undefined) {
      const interval = Number(body.intervalMinutes);
      if (isNaN(interval) || interval < 5 || interval > 360) {
        return NextResponse.json<ApiError>(
          { error: "Intervalo deve estar entre 5 e 360 minutos." },
          { status: 400 }
        );
      }
      patch.intervalMinutes = interval;
    }

    if (body.minScore !== undefined) {
      const minScore = Number(body.minScore);
      if (isNaN(minScore) || minScore < 0 || minScore > 100) {
        return NextResponse.json<ApiError>(
          { error: "Score mínimo deve estar entre 0 e 100." },
          { status: 400 }
        );
      }
      patch.minScore = minScore;
    }

    if (body.maxPerHour !== undefined) {
      const maxH = Number(body.maxPerHour);
      if (isNaN(maxH) || maxH < 1 || maxH > 30) {
        return NextResponse.json<ApiError>(
          { error: "Limite por hora deve estar entre 1 e 30 ofertas." },
          { status: 400 }
        );
      }
      patch.maxPerHour = maxH;
    }

    // 5. Horários da janela
    if (body.startHour !== undefined && typeof body.startHour === "string") {
      if (!/^\d{2}:\d{2}$/.test(body.startHour)) {
        return NextResponse.json<ApiError>(
          { error: "Horário inicial inválido. Use o formato HH:mm." },
          { status: 400 }
        );
      }
      patch.startHour = body.startHour;
    }

    if (body.endHour !== undefined && typeof body.endHour === "string") {
      if (!/^\d{2}:\d{2}$/.test(body.endHour)) {
        return NextResponse.json<ApiError>(
          { error: "Horário final inválido. Use o formato HH:mm." },
          { status: 400 }
        );
      }
      patch.endHour = body.endHour;
    }

    if (body.channelDestination !== undefined && typeof body.channelDestination === "string") {
      patch.channelDestination = body.channelDestination.trim() || "Radar de Ofertas";
    }

    const updated = await updateSchedulerSettings(patch);
    const db = await readDatabase();
    const stats = computeSchedulerStats(db.offers, updated);

    return NextResponse.json({
      settings: updated,
      stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido ao atualizar agendador";
    console.error("[api/scheduler PATCH]", err);
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}
