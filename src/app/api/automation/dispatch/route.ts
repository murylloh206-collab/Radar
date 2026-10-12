import { NextResponse } from "next/server";
import { dispatchNextApprovedOffer } from "@/lib/server/auto-dispatcher";

export const dynamic = "force-dynamic";

/**
 * POST /api/automation/dispatch
 * Aciona imediatamente o envio da próxima oferta aprovada (força execução para teste).
 */
export async function POST() {
  try {
    const result = await dispatchNextApprovedOffer(true);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao processar envio de oferta";
    return NextResponse.json(
      {
        dispatched: false,
        status: "failed",
        message: msg,
        error: msg,
      },
      { status: 500 }
    );
  }
}
