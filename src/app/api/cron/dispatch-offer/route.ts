import { NextResponse } from "next/server";
import { dispatchNextApprovedOffer } from "@/lib/server/auto-dispatcher";

export const dynamic = "force-dynamic";

function checkAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // Em dev ou se não definido, permite execução

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return token === secret;
}

/**
 * Handler compatível com GET (Vercel Cron padrão) e POST (webhooks externos).
 */
async function handleCron(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Não autorizado (CRON_SECRET inválido)" }, { status: 401 });
  }

  try {
    // Executa a automação padrão (verifica se autoSendEnabled está ligado)
    const result = await dispatchNextApprovedOffer(false);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno no cron de despacho";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
