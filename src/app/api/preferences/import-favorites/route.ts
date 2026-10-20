import { NextResponse } from "next/server";
import { importBrotherFavorites } from "@/lib/server/favorites-importer";

export const dynamic = "force-dynamic";

/**
 * POST /api/preferences/import-favorites
 * Importa links de favoritos do irmão (Shopee / Mercado Livre) como aprovações ponderadas (peso 2.5).
 */
export async function POST(request: Request) {
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
