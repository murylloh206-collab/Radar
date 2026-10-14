import { NextResponse } from "next/server";
import {
  getLearnedPreferences,
  removeBlockedItem,
  resetAllLearning,
  getAllFeedbacks,
} from "@/lib/server/feedback-service";

export const runtime = "nodejs";

/**
 * GET /api/preferences
 * Retorna as preferências aprendidas atuais e contadores
 */
export async function GET() {
  try {
    const preferences = await getLearnedPreferences();
    const feedbacks = await getAllFeedbacks();

    return NextResponse.json({
      ok: true,
      preferences,
      stats: {
        totalFeedbacks: feedbacks.length,
        totalApprovals: preferences.totalApprovals,
        totalRejections: preferences.totalRejections,
        blockedBrandsCount: preferences.blockedBrands.length,
        blockedSellersCount: preferences.blockedSellers.length,
        blockedKeywordsCount: preferences.blockedKeywords.length,
        blockedCategoriesCount: preferences.blockedCategories.length,
        modelTrained: Boolean(preferences.featureWeights && Object.keys(preferences.featureWeights).length > 0),
        lastTrainedAt: preferences.lastTrainedAt,
      },
    });
  } catch (err) {
    console.error("[api/preferences] Erro ao carregar preferências:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao carregar preferências." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/preferences
 * Remove um item da lista de bloqueados (marca, vendedor, palavra-chave ou categoria)
 */
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Payload JSON inválido." }, { status: 400 });
    }

    const { type, value } = body;
    if (!type || !value) {
      return NextResponse.json({ error: "Tipo e valor são obrigatórios para desbloqueio." }, { status: 400 });
    }

    const validTypes = ["brand", "seller", "keyword", "category"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Tipo inválido. Use: ${validTypes.join(", ")}` }, { status: 400 });
    }

    const updated = await removeBlockedItem(type, value);
    return NextResponse.json({ ok: true, preferences: updated });
  } catch (err) {
    console.error("[api/preferences] Erro ao desbloquear item:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao desbloquear item." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/preferences
 * Permite resetar todo o aprendizado quando body.action === "reset"
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || body.action !== "reset") {
      return NextResponse.json({ error: "Ação não suportada." }, { status: 400 });
    }

    const emptyPrefs = await resetAllLearning();
    return NextResponse.json({
      ok: true,
      message: "Todo o histórico de feedbacks e preferências aprendidas foi redefinido.",
      preferences: emptyPrefs,
    });
  } catch (err) {
    console.error("[api/preferences] Erro ao resetar preferências:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao resetar aprendizado." },
      { status: 500 }
    );
  }
}
