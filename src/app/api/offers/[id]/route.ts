import { NextResponse } from "next/server";
import { OfferNotFoundError, OfferValidationError, updateOffer } from "@/lib/server/offers-service";
import type { ApiError, Offer, OfferUpdate } from "@/lib/types";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = ["status", "affiliateUrl", "shortUrl", "shortUrlStatus", "coupon", "couponDescription"] as const;

/**
 * PATCH /api/offers/:id — salva link de afiliado, cupom e/ou muda o status.
 * Exemplo: { "status": "aprovado", "affiliateUrl": "https://...", "coupon": "PROMO10" }
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offerId = decodeURIComponent(id);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json<ApiError>({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  // Aceita somente campos conhecidos e do tipo certo.
  const update: OfferUpdate = {};
  for (const field of ALLOWED_FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];
    if (value !== null && typeof value !== "string") {
      return NextResponse.json<ApiError>({ error: `Campo "${field}" inválido.` }, { status: 400 });
    }
    (update as Record<string, string | null>)[field] = value;
  }

  try {
    const offer = await updateOffer(offerId, update);
    return NextResponse.json<Offer>(offer);
  } catch (err) {
    if (err instanceof OfferNotFoundError) {
      return NextResponse.json<ApiError>({ error: err.message }, { status: 404 });
    }
    if (err instanceof OfferValidationError) {
      return NextResponse.json<ApiError>({ error: err.message }, { status: 422 });
    }
    console.error("[update]", err);
    return NextResponse.json<ApiError>({ error: "Erro ao salvar a oferta." }, { status: 500 });
  }
}
