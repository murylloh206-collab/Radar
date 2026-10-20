import { NextResponse } from "next/server";
import { importBrotherFavorites } from "@/lib/server/favorites-importer";

export const dynamic = "force-dynamic";

/**
 * POST /api/preferences/import-favorites
 * Importa links de favoritos do irmão (Shopee / Mercado Livre) como aprovações ponderadas (peso 2.5).
 */
function verifyAdminAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const sessionSecret = process.env.SESSION_ENCRYPTION_KEY;

  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (sessionSecret && authHeader === `Bearer ${sessionSecret}`) return true;

  const url = new URL(request.url);
  if (cronSecret && url.searchParams.get("secret") === cronSecret) return true;

  // Permite chamadas legítimas originadas da interface do painel
  const secFetchSite = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const requestedWith = request.headers.get("x-requested-with");

  if (requestedWith === "XMLHttpRequest" || secFetchSite === "same-origin") return true;
  if (origin && host && origin.includes(host)) return true;

  // Em desenvolvimento local sem secret configurado
  if (!cronSecret && !sessionSecret && process.env.NODE_ENV !== "production") return true;

  return false;
}

export async function POST(request: Request) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json(
      { error: "Acesso não autorizado. Esta rota exige autenticação administrativa." },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { urls?: string[] };
    const urls = Array.isArray(body.urls) ? body.urls : [];

    if (urls.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma URL fornecida. Envie um array no formato { urls: ['https://...'] }." },
        { status: 400 }
      );
    }

    const summary = await importBrotherFavorites(urls);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao importar favoritos.";
    console.error("[api/preferences/import-favorites] Erro:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
