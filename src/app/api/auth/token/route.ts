import { NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/server/mercadolivre";
import { saveStoredMLTokens } from "@/lib/server/storage";

import { config } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    code?: string;
    redirectUri?: string;
  };

  const raw = (body.token || body.code || "").trim();
  if (!raw) {
    return NextResponse.json({ error: "Informe um token, código de autorização ou a URL de redirecionamento." }, { status: 400 });
  }

  let code: string | null = null;
  let redirectUri: string = body.redirectUri || config.mercadoLivre.redirectUri || "https://painel-de-ofertas.vercel.app/api/auth/callback";

  // Se o usuário colou a URL inteira da barra de endereços (ex: https://painel-de-ofertas.vercel.app/api/auth/callback?code=TG-xxx)
  if (raw.includes("code=")) {
    try {
      const parsedUrl = new URL(raw);
      code = parsedUrl.searchParams.get("code");
      redirectUri = `${parsedUrl.origin}${parsedUrl.pathname}`.replace(/\/$/, "");
    } catch {
      const match = raw.match(/code=([^&]+)/);
      if (match) code = match[1];
    }
  } else if (raw.startsWith("TG-")) {
    // É o código de autorização direto
    code = raw;
  }

  // Caso 1: Código de autorização (TG-...)
  if (code) {
    try {
      await exchangeCodeForToken(code, redirectUri);
      return NextResponse.json({ ok: true, message: "Código validado e conta do Mercado Livre conectada com sucesso!" });
    } catch (err) {
      // Se falhar com a redirectUri inferida, tenta com a cadastrada oficialmente no DevCenter
      try {
        await exchangeCodeForToken(code, config.mercadoLivre.redirectUri);
        return NextResponse.json({ ok: true, message: "Código validado com sucesso!" });
      } catch {
        const message = err instanceof Error ? err.message : "Erro ao validar código no Mercado Livre";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }
  }

  // Caso 2: Usuário colou um Access Token diretamente (ex: APP_USR-...)
  await saveStoredMLTokens({
    accessToken: raw,
    expiresAt: Date.now() + 6 * 3600 * 1000,
  });

  return NextResponse.json({ ok: true, message: "Access Token salvo com sucesso!" });
}
