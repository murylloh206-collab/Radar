import { NextResponse } from "next/server";
import { MercadoLivreError } from "@/lib/server/mercadolivre";
import { QueueCapacityLimitError, RadarBusyError, runSearch } from "@/lib/server/offers-service";
import type { ApiError, SearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/offers/search — busca produtos com respeito ao limite de 500 pendentes.
 */
export async function POST(request: Request) {
  let terms: string[] | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { terms?: unknown };
    if (Array.isArray(body.terms)) {
      terms = body.terms.filter((t): t is string => typeof t === "string").map((t) => t.slice(0, 80));
    }
  } catch {
    terms = undefined;
  }

  try {
    const result = await runSearch(terms);
    if (result.lastSearch.found === 0 && result.errors.length > 0) {
      const firstErr = result.errors[0];
      const status = firstErr.message.includes("403") ? 403 : firstErr.message.includes("401") ? 401 : 400;
      console.warn(`[POST /api/offers/search] Busca não retornou produtos (${status}): ${firstErr.message}`);
      return NextResponse.json<ApiError>({ error: firstErr.message }, { status });
    }
    return NextResponse.json<SearchResponse>(result);
  } catch (err) {
    if (err instanceof QueueCapacityLimitError) {
      return NextResponse.json<ApiError>({ error: err.message }, { status: 429 });
    }
    if (err instanceof RadarBusyError) {
      return NextResponse.json<ApiError>({ error: err.message }, { status: 409 });
    }
    const status = err instanceof MercadoLivreError && err.status ? err.status : 500;
    const message = err instanceof Error ? err.message : "Erro ao buscar ofertas.";
    console.error(`[POST /api/offers/search] Erro capturado (${status}): ${message}`);
    return NextResponse.json<ApiError>({ error: message }, { status });
  }
}
