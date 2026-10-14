import { NextResponse } from "next/server";
import { generateMeliShortLinkDetailed } from "@/lib/server/meli-shortener";
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

  let hasCookie = Boolean(config.mercadoLivre.sessionCookie);
  if (!hasCookie) {
    const { loadDecryptedSession } = await import("@/lib/server/session-vault");
    const session = await loadDecryptedSession("mercadolivre");
    if (session?.rawCookie) {
      config.mercadoLivre.sessionCookie = session.rawCookie;
      hasCookie = true;
    }
  }

  if (!hasCookie) {
    return NextResponse.json<ApiError>(
      {
        error:
          "Sessão do Mercado Livre não configurada ou expirada. Acesse as configurações para atualizar o cookie de sessão.",
      },
      { status: 400 },
    );
  }

  const cleanId = (offer.externalId || "").replace(/^MLB-?/, "");
  const fallbacks = cleanId
    ? [
        `https://produto.mercadolivre.com.br/MLB-${cleanId}`,
        `https://produto.mercadolivre.com.br/MLB${cleanId}`,
      ]
    : [];

  const direct = await generateMeliShortLinkDetailed(offer.originalUrl, undefined, fallbacks);
  let shortUrl = direct.shortUrl;

  // Se a chamada rápida HTTP falhar e não estiver na Vercel, aciona o Puppeteer local sob demanda
  if (!shortUrl && !process.env.VERCEL) {
    const { generateMeliLaWithPuppeteer } = await import("@/lib/server/puppeteer-meli");
    shortUrl = await generateMeliLaWithPuppeteer(offer.originalUrl);
  }

  if (!shortUrl) {
    return NextResponse.json<ApiError>(
      {
        error:
          direct.error || "Não foi possível gerar o link meli.la automaticamente. Verifique se o vendedor é elegível e o cookie está ativo.",
      },
      { status: 502 },
    );
  }

  const updatedOffer = await updateDatabase((data) => {
    const idx = data.offers.findIndex((o) => o.id === offerId);
    if (idx !== -1) {
      data.offers[idx].shortUrl = shortUrl;
      data.offers[idx].shortUrlStatus = "pronto";
      data.offers[idx].shortUrlGeneratedAt = new Date().toISOString();
      data.offers[idx].shortUrlError = null;
      data.offers[idx].affiliateUrl = shortUrl;
      data.offers[idx].updatedAt = new Date().toISOString();
      return data.offers[idx];
    }
    return offer;
  });

  return NextResponse.json<Offer>(updatedOffer);
}
