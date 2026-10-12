import { NextResponse } from "next/server";
import { MercadoLivreError } from "@/lib/server/mercadolivre";
import { runAutoDiscovery } from "@/lib/server/offers-service";
import type { ApiError, SearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/offers/discover
 * Executa a descoberta automática pelas categorias prioritárias do Radar de Ofertas
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { categoryIds?: string[] };
    const result = await runAutoDiscovery(body.categoryIds);
    return NextResponse.json<SearchResponse>(result);
  } catch (err) {
    if (err instanceof MercadoLivreError) {
      return NextResponse.json<ApiError>({ error: err.message }, { status: err.status ?? 502 });
    }
    const message = err instanceof Error ? err.message : "Erro desconhecido ao descobrir ofertas.";
    console.error("[api/offers/discover]", err);
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}
