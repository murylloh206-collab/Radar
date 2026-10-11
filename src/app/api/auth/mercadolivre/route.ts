import { NextResponse } from "next/server";
import { config } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { clientId } = config.mercadoLivre;
  if (!clientId) {
    return NextResponse.json({ error: "ML_CLIENT_ID não configurado." }, { status: 400 });
  }

  const url = new URL(request.url);
  // Usa o mesmo protocolo e host da requisição atual (funciona em localhost e na Vercel)
  const redirectUri = `${url.origin}/api/auth/mercadolivre/callback`;

  const authUrl = new URL("https://auth.mercadolivre.com.br/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);

  return NextResponse.redirect(authUrl.toString());
}
