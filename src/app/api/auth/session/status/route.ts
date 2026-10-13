import { NextResponse } from "next/server";
import { getSessionDiagnostic, clearSession } from "@/lib/server/session-vault";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/session/status
 * Retorna diagnósticos de sessão 100% seguros (sem expor segredos ou cookies brutos).
 */
export async function GET() {
  try {
    const mlDiagnostic = await getSessionDiagnostic("mercadolivre");
    const shopeeDiagnostic = await getSessionDiagnostic("shopee");

    return NextResponse.json({
      providers: {
        mercadolivre: mlDiagnostic,
        shopee: shopeeDiagnostic,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao consultar status de sessões.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/auth/session/status
 * Executa ações seguras como desconexão/limpeza de sessão ou validação.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: "clear" | "validate";
      provider?: "mercadolivre" | "shopee";
    };

    const provider = body.provider || "mercadolivre";

    if (body.action === "clear") {
      await clearSession(provider);
      return NextResponse.json({
        ok: true,
        message: `Sessão do provedor ${provider} limpa com sucesso.`,
      });
    }

    return NextResponse.json({ error: "Ação não suportada." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao processar ação de sessão.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
