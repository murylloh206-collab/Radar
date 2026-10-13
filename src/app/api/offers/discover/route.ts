import { NextResponse } from "next/server";
import { MercadoLivreError } from "@/lib/server/mercadolivre";
import { QueueCapacityLimitError, RadarBusyError, runAutoDiscovery } from "@/lib/server/offers-service";
import type { ApiError, SearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/offers/discover
 * Executa a descoberta automática pelas categorias prioritárias do Radar de Ofertas
 * com respeito estrito ao limite de 500 ofertas pendentes.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { categoryIds?: string[] };
    const result = await runAutoDiscovery(body.categoryIds);
    return NextResponse.json<SearchResponse>(result);
  } catch (err) {
    if (err instanceof QueueCapacityLimitError) {
      return NextResponse.json<ApiError>({ error: err.message }, { status: 429 });
    }
    if (err instanceof RadarBusyError) {
      return NextResponse.json<ApiError>({ error: err.message }, { status: 409 });
    }
    if (err instanceof MercadoLivreError) {
      return NextResponse.json<ApiError>({ error: err.message }, { status: err.status ?? 502 });
    }
    const message = err instanceof Error ? err.message : "Erro desconhecido ao descobrir ofertas.";
    console.error("[api/offers/discover]", err);
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}
