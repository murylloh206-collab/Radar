import { NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/server/mercadolivre";
import { saveStoredMLTokens } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    code?: string;
    redirectUri?: string;
  };

  const token = body.token?.trim();
  const code = body.code?.trim();

  // Caso 1: Usuário colou um Access Token diretamente (ex.: APP_USR-...)
  if (token) {
    await saveStoredMLTokens({
      accessToken: token,
      expiresAt: Date.now() + 6 * 3600 * 1000, // 6 horas padrão
    });
    return NextResponse.json({ ok: true, message: "Token salvo com sucesso!" });
  }

  // Caso 2: Usuário colou um Authorization Code (TG-...)
  if (code) {
    try {
      const redirectUri = body.redirectUri || process.env.ML_REDIRECT_URI || "https://localhost";
      await exchangeCodeForToken(code, redirectUri);
      return NextResponse.json({ ok: true, message: "Código validado e token salvo com sucesso!" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao validar código no Mercado Livre";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Informe um token ou código de autorização." }, { status: 400 });
}
