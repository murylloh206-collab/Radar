import { NextResponse } from "next/server";
import { syncShopeeBookmarksFromSession } from "@/lib/server/favorites-importer";
import { saveEncryptedSession } from "@/lib/server/session-vault";
import type { ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
 * POST /api/preferences/sync-shopee-bookmarks
 * Sincroniza automaticamente a lista de favoritos (curtidos) da Shopee a partir do Session Vault
 * ou de um cookie/lista de URLs fornecidos no corpo da requisição.
 */
export async function POST(request: Request) {
  if (!verifyAdminAuth(request)) {
    return NextResponse.json<ApiError>(
      { error: "Acesso não autorizado à sincronização de favoritos da Shopee." },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      cookie?: string;
      urls?: string[];
      createOffers?: boolean;
    };
    const rawCookie = body.cookie?.trim();
    const urls = Array.isArray(body.urls) ? body.urls : undefined;

    // Se o usuário passou um cookie novo, atualiza e criptografa no cofre sob o provedor 'shopee'
    if (rawCookie) {
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      await saveEncryptedSession("shopee", {
        rawCookie,
        savedAt: now,
        expiresAt,
        lastValidatedAt: now,
        isValid: true,
      });
    }

    const summary = await syncShopeeBookmarksFromSession({
      customCookie: rawCookie,
      urls,
      createOffers: body.createOffers ?? true,
    });

    // Retorna a lista atualizada de ofertas para recarregar o painel sem refresh
    const { readDatabase } = await import("@/lib/server/storage");
    const freshDb = await readDatabase();

    return NextResponse.json({
      ok: true,
      ...summary,
      offers: freshDb.offers,
      lastSearch: freshDb.lastSearch,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido ao sincronizar favoritos da Shopee.";
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}
