import { NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/server/mercadolivre";
import { config } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error || !code) {
    const message = errorDescription || error || "Autorização cancelada ou código não fornecido.";
    return NextResponse.redirect(`${url.origin}/?ml_error=${encodeURIComponent(message)}`);
  }

  const redirectUri = config.mercadoLivre.redirectUri || `${url.origin}/api/auth/callback`;

  try {
    await exchangeCodeForToken(code, redirectUri);
    return NextResponse.redirect(`${url.origin}/?ml_success=1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao autenticar com o Mercado Livre";
    return NextResponse.redirect(`${url.origin}/?ml_error=${encodeURIComponent(message)}`);
  }
}
