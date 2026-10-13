import { NextResponse } from "next/server";
import { deleteOffersPermanently } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/offers/rejected
 * Exclui definitivamente uma ou mais ofertas rejeitadas e grava tombstones para evitar re-coleta.
 */
export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { ids?: string[] };
    const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string" && id.trim()) : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Nenhum ID de oferta rejeitada fornecido para exclusão." }, { status: 400 });
    }

    const result = await deleteOffersPermanently(ids);

    return NextResponse.json({
      ok: true,
      deletedCount: result.deletedCount,
      tombstonesAdded: result.tombstonesAdded,
      message: `${result.deletedCount} oferta(s) rejeitada(s) excluída(s) definitivamente.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao excluir ofertas rejeitadas.";
    console.error("[api/offers/rejected DELETE]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
