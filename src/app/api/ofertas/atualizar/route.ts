import { NextResponse } from "next/server";
import { MercadoLivreError } from "@/lib/server/mercadolivre";
import { runRadarUpdate } from "@/lib/server/offers-updater";
import type { ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Permite até 60s para varredura de categorias prioritárias

/**
 * POST /api/ofertas/atualizar
 * Rota oficial acionada pelo botão "Atualizar ofertas" no painel.
 * Coleta ofertas ativas da API oficial do Mercado Livre (MLB),
 * atualiza o banco Supabase e retorna a lista imediata para a interface.
 */
export async function POST() {
  try {
    const result = await runRadarUpdate();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MercadoLivreError) {
      return NextResponse.json<ApiError>(
        { error: err.message },
        { status: err.status ?? 502 }
      );
    }
    const message =
      err instanceof Error ? err.message : "Erro desconhecido ao atualizar ofertas do Mercado Livre.";
    console.error("[api/ofertas/atualizar] Erro:", err);
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/ofertas/atualizar (para facilidade de testes manuais e health-check)
 */
export async function GET() {
  return POST();
}
