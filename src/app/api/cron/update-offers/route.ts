import { NextResponse } from "next/server";
import { getSaoPauloTime } from "@/lib/server/scheduler-engine";
import { runRadarUpdate } from "@/lib/server/offers-updater";
import { readDatabase } from "@/lib/server/storage";
import type { ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifyCronAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // Em dev local sem secret, permite execução

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;

  const url = new URL(request.url);
  if (url.searchParams.get("secret") === cronSecret) return true;

  // Permite chamadas locais do painel
  const secFetchSite = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const requestedWith = request.headers.get("x-requested-with");
  if (requestedWith === "XMLHttpRequest" || secFetchSite === "same-origin") return true;
  if (origin && host && origin.includes(host)) return true;

  return false;
}

/**
 * GET ou POST /api/cron/update-offers
 * Agendamento em segundo plano:
 * - A cada 30 minutos em horário comercial (08:00 às 18:00, horário de Brasília).
 * - A cada 2 horas (120 minutos) fora do horário comercial.
 */
export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}

async function handleCron(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json<ApiError>(
      { error: "Acesso não autorizado ao cron de atualização de ofertas." },
      { status: 401 }
    );
  }

  try {
    const spTime = getSaoPauloTime();
    // Horário comercial: 08:00 às 18:00 (Brasília)
    const isCommercialHours = spTime.hour >= 8 && spTime.hour < 18;
    const requiredIntervalMinutes = isCommercialHours ? 30 : 120;

    const db = await readDatabase();
    const lastSearchAt = db.lastSearch?.at ? new Date(db.lastSearch.at).getTime() : 0;
    const elapsedMinutes = (Date.now() - lastSearchAt) / (1000 * 60);

    const force = new URL(request.url).searchParams.get("force") === "true";

    if (!force && elapsedMinutes < requiredIntervalMinutes - 2) {
      const waitRemaining = Math.round(requiredIntervalMinutes - elapsedMinutes);
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: `Atualização não necessária no momento. Janela: ${
          isCommercialHours ? "Comercial (30m)" : "Fora do comercial (2h)"
        }. Próxima execução em aproximadamente ${waitRemaining} minuto(s).`,
        elapsedMinutes: Math.round(elapsedMinutes),
        requiredIntervalMinutes,
        isCommercialHours,
      });
    }

    console.log(
      `[cron/update-offers] Iniciando coleta automática (${
        isCommercialHours ? "Horário comercial: 30m" : "Fora do comercial: 2h"
      })...`
    );

    const result = await runRadarUpdate();
    return NextResponse.json({
      ok: true,
      executed: true,
      added: result.added,
      updated: result.updated,
      totalOffers: result.offers.length,
      lastSearch: result.lastSearch,
      isCommercialHours,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido no cron de atualização.";
    console.error("[cron/update-offers] Falha:", err);
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}
