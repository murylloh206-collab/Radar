import { NextResponse } from "next/server";
import { recordOfferFeedback } from "@/lib/server/feedback-service";
import { REJECTION_REASONS, type FeedbackAction, type RejectionReason } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Payload JSON inválido." }, { status: 400 });
    }

    const { offerId, externalId, action, reason, customBrand, customSeller, offerData } = body;

    if (!offerId || !externalId) {
      return NextResponse.json({ error: "Identificadores da oferta são obrigatórios." }, { status: 400 });
    }

    const validActions: FeedbackAction[] = ["aprovar", "rejeitar", "bloquear_marca", "bloquear_vendedor"];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `Ação inválida: "${action}". Ações válidas: ${validActions.join(", ")}` }, { status: 400 });
    }

    // Validação estrita: se for rejeitar, a escolha de um motivo é OBRIGATÓRIA
    if (action === "rejeitar") {
      if (!reason || typeof reason !== "string" || !reason.trim()) {
        return NextResponse.json(
          { error: "Ao rejeitar uma oferta, a escolha de um motivo é obrigatória." },
          { status: 400 }
        );
      }
      const validReasons = REJECTION_REASONS.map((r) => r.id);
      const isKnownReason = validReasons.includes(reason as RejectionReason);
      if (!isKnownReason) {
        // Aceita também o label ou motivo customizado se não for id, mas incentiva os 7 motivos
        console.warn(`[api/offers/feedback] Motivo não mapeado exatamente: ${reason}`);
      }
    }

    const result = await recordOfferFeedback({
      offerId,
      externalId,
      action,
      reason,
      customBrand,
      customSeller,
      offerData,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/offers/feedback] Erro ao registrar feedback:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno ao processar feedback." },
      { status: 500 }
    );
  }
}
