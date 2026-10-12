import { NextResponse } from "next/server";
import { getSchedulerSettings, updateSchedulerSettings, readDatabase } from "@/lib/server/storage";
import { computeSchedulerStats } from "@/lib/server/scheduler-engine";
import type { ApiError, SchedulerSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/scheduler
 * Retorna as configurações do agendador e as estatísticas em tempo real.
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
 * Atualiza parâmetros operacionais do agendador (estado, horários, meta diária).
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

    if (body.state !== undefined) {
      if (!["ativo", "pausado", "interrompido_erro"].includes(body.state)) {
        return NextResponse.json<ApiError>(
          { error: "Estado do agendador inválido." },
          { status: 400 }
        );
      }
      patch.state = body.state;
      // Se o usuário está reativando manualmente, zera falhas consecutivas
      if (body.state === "ativo") {
        patch.consecutiveFailures = 0;
        patch.lastError = null;
      }
    }

    if (body.dailyTarget !== undefined) {
      const target = Number(body.dailyTarget);
      if (isNaN(target) || target < 10 || target > 150) {
        return NextResponse.json<ApiError>(
          { error: "Meta diária deve estar entre 10 e 150 ofertas." },
          { status: 400 }
        );
      }
      patch.dailyTarget = target;
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

    if (body.startHour !== undefined && typeof body.startHour === "string") {
      patch.startHour = body.startHour;
    }

    if (body.endHour !== undefined && typeof body.endHour === "string") {
      patch.endHour = body.endHour;
    }

    if (body.channelDestination !== undefined && typeof body.channelDestination === "string") {
      patch.channelDestination = body.channelDestination;
    }

    const updated = await updateSchedulerSettings(patch);
    const db = await readDatabase();
    const stats = computeSchedulerStats(db.offers, updated);

    return NextResponse.json({
      settings: updated,
      stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[api/scheduler PATCH]", err);
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}
