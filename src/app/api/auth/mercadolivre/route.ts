import { NextResponse } from "next/server";
import { config } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { clientId } = config.mercadoLivre;
  if (!clientId) {
    return NextResponse.json({ error: "ML_CLIENT_ID não configurado." }, { status: 400 });
  }

  const url = new URL(request.url);
  const customRedirect = process.env.ML_REDIRECT_URI?.trim();

  // O CloudFront do Mercado Livre bloqueia (403) URLs com "http://" ou "localhost" no parâmetro redirect_uri.
  // Em localhost, NÃO enviamos o parâmetro redirect_uri na query para o Mercado Livre usar
  // a Redirect URI padrão cadastrada no DevCenter sem ser bloqueado pelo CloudFront.
  const redirectUri = config.mercadoLivre.redirectUri || customRedirect || `${url.origin}/api/auth/callback`;
  const state = crypto.randomUUID();

  // Usar auth.mercadolivre.com.br (domínio oficial do Mercado Livre Brasil)
  const authUrl = new URL("https://auth.mercadolivre.com.br/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set("ml_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return response;
}
