import { NextResponse } from "next/server";
import { syncMercadoLivreBookmarksFromSession } from "@/lib/server/favorites-importer";
import { saveEncryptedSession } from "@/lib/server/session-vault";
import type { ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";

function verifyAdminAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const secFetchSite = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const requestedWith = request.headers.get("x-requested-with");

  if (requestedWith === "XMLHttpRequest" || secFetchSite === "same-origin") return true;
  if (origin && host && origin.includes(host)) return true;

  return false;
}

/**
 * POST /api/preferences/sync-bookmarks
 * Sincroniza automaticamente a lista de favoritos do Mercado Livre a partir do Session Vault
 * ou de um cookie fornecido no corpo da requisição.
 */
export async function POST(request: Request) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json<ApiError>(
      { error: "Acesso não autorizado à sincronização de favoritos." },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { cookie?: string };
    const rawCookie = body.cookie?.trim();

    // Se o usuário passou um cookie novo, atualiza e criptografa no cofre
    if (rawCookie) {
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      await saveEncryptedSession("mercadolivre", {
        rawCookie,
        savedAt: now,
        expiresAt,
        lastValidatedAt: now,
        isValid: true,
      });
    }

    const summary = await syncMercadoLivreBookmarksFromSession(rawCookie);
    return NextResponse.json({
      ok: true,
      ...summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido ao sincronizar favoritos.";
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}
