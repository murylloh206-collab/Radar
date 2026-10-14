import { NextResponse } from "next/server";
import { sanitizeExistingOffers } from "@/lib/server/offers-service";
import type { ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/offers/sanitize
 * Executa a rotina de saneamento idempotente para remover ofertas com score baixo (< 75),
 * sem desconto verificável ou com categoria bloqueada das abas Pendentes e Aprovados,
 * movendo-as para Rejeitados com auditoria e preservando produtos já publicados.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      minPendingScore?: number;
      minManualPublishScore?: number;
      requireVerifiableDiscount?: boolean;
    };

    const result = await sanitizeExistingOffers(body);

    return NextResponse.json({
      success: true,
      message: `Saneamento concluído: ${result.movedToRejected} oferta(s) movida(s) para Rejeitados.`,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido ao executar saneamento.";
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}
