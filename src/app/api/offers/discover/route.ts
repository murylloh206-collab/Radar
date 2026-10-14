import { NextResponse } from "next/server";
import { MercadoLivreError } from "@/lib/server/mercadolivre";
import { runRadarUpdate } from "@/lib/server/offers-updater";
import type { ApiError, SearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/offers/discover
 * Ponto de entrada de descoberta compatível com o fluxo de atualização do Radar.
 */
export async function POST() {
  try {
    const result = await runRadarUpdate();
    return NextResponse.json<SearchResponse>({
      offers: result.offers,
      lastSearch: result.lastSearch,
      errors: [],
    });
  } catch (err) {
    if (err instanceof MercadoLivreError) {
      return NextResponse.json<ApiError>({ error: err.message }, { status: err.status ?? 502 });
    }
    const message = err instanceof Error ? err.message : "Erro desconhecido ao descobrir ofertas.";
    console.error("[api/offers/discover]", err);
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}

