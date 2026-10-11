import { NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/server/mercadolivre";
import { config } from "@/lib/server/config";

import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("ml_oauth_state")?.value;

  if (savedState && state && savedState !== state) {
    console.warn("[OAuth Callback] Alerta de segurança: parâmetro state não coincide com a sessão.");
    return NextResponse.redirect(`${url.origin}/?ml_error=${encodeURIComponent("Falha de validação de segurança (state inválido).")}`);
  }

  if (error || !code) {
    const message = errorDescription || error || "Autorização cancelada ou código não fornecido.";
    return NextResponse.redirect(`${url.origin}/?ml_error=${encodeURIComponent(message)}`);
  }

  const redirectUri = config.mercadoLivre.redirectUri || `${url.origin}/api/auth/callback`;

  try {
    await exchangeCodeForToken(code, redirectUri);
    const response = NextResponse.redirect(`${url.origin}/?ml_success=1`);
    response.cookies.delete("ml_oauth_state");
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao autenticar com o Mercado Livre";
    return NextResponse.redirect(`${url.origin}/?ml_error=${encodeURIComponent(message)}`);
  }
}
