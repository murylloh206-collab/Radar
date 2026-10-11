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
  const isHttps = url.protocol === "https:" || Boolean(customRedirect);
  const redirectUri = customRedirect || (isHttps ? `${url.origin}/api/auth/mercadolivre/callback` : null);

  // Usar auth.mercadolivre.com (o domínio oficial internacional aceito pelo CloudFront)
  const authUrl = new URL("https://auth.mercadolivre.com/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  if (redirectUri) {
    authUrl.searchParams.set("redirect_uri", redirectUri);
  }

  return NextResponse.redirect(authUrl.toString());
}
