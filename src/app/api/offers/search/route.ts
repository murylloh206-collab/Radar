import { NextResponse } from "next/server";
import { runSearch } from "@/lib/server/offers-service";
import type { ApiError, SearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/offers/search — busca produtos no Mercado Livre e salva como "pendente".
 * Corpo opcional: { "terms": ["fone bluetooth", "air fryer"] }
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
    // Se TODOS os termos falharam, devolve erro para a tela mostrar o motivo.
    if (result.lastSearch.found === 0 && result.errors.length > 0) {
      return NextResponse.json<ApiError>({ error: result.errors[0].message }, { status: 502 });
    }
    return NextResponse.json<SearchResponse>(result);
  } catch (err) {
    console.error("[search]", err);
    return NextResponse.json<ApiError>(
      { error: err instanceof Error ? err.message : "Erro ao buscar ofertas." },
      { status: 500 },
    );
  }
}
