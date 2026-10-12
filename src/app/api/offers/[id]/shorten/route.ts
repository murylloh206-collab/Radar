import { NextResponse } from "next/server";
import { generateMeliShortLink } from "@/lib/server/meli-shortener";
import { readDatabase, updateDatabase } from "@/lib/server/storage";
import { config } from "@/lib/server/config";
import type { ApiError, Offer } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/offers/:id/shorten
 * Tenta encurtar o link do produto para o domínio oficial https://meli.la/
 * utilizando a sessão do Mercado Livre configurada em ML_SESSION_COOKIE.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const offerId = decodeURIComponent(id);

  const db = await readDatabase();
  const offer = db.offers.find((o) => o.id === offerId);

  if (!offer) {
    return NextResponse.json<ApiError>({ error: "Oferta não encontrada." }, { status: 404 });
  }

  if (!config.mercadoLivre.sessionCookie) {
    return NextResponse.json<ApiError>(
      {
        error:
          "Cookie de sessão não configurado. Adicione ML_SESSION_COOKIE no seu .env.local para gerar links meli.la automaticamente.",
      },
      { status: 400 },
    );
  }

  let shortUrl = await generateMeliShortLink(offer.originalUrl);

  // Se a chamada rápida HTTP falhar, aciona o Puppeteer sob demanda
  if (!shortUrl) {
    const { generateMeliLaWithPuppeteer } = await import("@/lib/server/puppeteer-meli");
    shortUrl = await generateMeliLaWithPuppeteer(offer.originalUrl);
  }

  if (!shortUrl) {
    return NextResponse.json<ApiError>(
      {
        error:
          "Não foi possível gerar o link meli.la automaticamente. Verifique se o cookie ou login do Mercado Livre precisa de renovação.",
      },
      { status: 502 },
    );
  }

  const updatedOffer = await updateDatabase((data) => {
    const idx = data.offers.findIndex((o) => o.id === offerId);
    if (idx !== -1) {
      data.offers[idx].affiliateUrl = shortUrl;
      data.offers[idx].updatedAt = new Date().toISOString();
      return data.offers[idx];
    }
    return offer;
  });

  return NextResponse.json<Offer>(updatedOffer);
}
