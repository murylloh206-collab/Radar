import { NextResponse } from "next/server";
import {
  getSchedulerSettings,
  readDatabase,
  recordDispatchFailure,
  recordDispatchSuccess,
  markOfferOutOfStock,
} from "@/lib/server/storage";
import { revalidateMLItem } from "@/lib/server/mercadolivre";
import { generateMeliShortLinkDetailed } from "@/lib/server/meli-shortener";
import { dispatchOfferToChannel } from "@/lib/server/whatsapp-adapter";
import { calcDiscountPercent } from "@/lib/offer-rules";
import { isBlockedProductOrCategory } from "@/lib/server/offer-scoring-engine";
import type { ApiError, Offer } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface PublishNowItemResult {
  id: string;
  title: string;
  success: boolean;
  channel?: string;
  messageId?: string;
  error?: string;
  alreadySent?: boolean;
}

export interface PublishNowResponse {
  results: PublishNowItemResult[];
  totalSuccess: number;
  totalFailed: number;
  totalAlreadySent: number;
}

/**
 * POST /api/offers/publish-now
 * Publicação manual imediata de uma ou mais ofertas aprovadas selecionadas pelo administrador.
 * Garante idempotência, bloqueio estrito de categorias/score e revalidação de estoque.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      offerIds?: string[];
      forceLowScore?: boolean;
    } | null;

    if (!body || !Array.isArray(body.offerIds) || body.offerIds.length === 0) {
      return NextResponse.json<ApiError>(
        { error: "Nenhuma oferta selecionada para envio imediato." },
        { status: 400 }
      );
    }

    const { offerIds, forceLowScore = false } = body;
    const settings = await getSchedulerSettings();
    const db = await readDatabase();
    const minScore = settings.minScore ?? 75;

    const results: PublishNowItemResult[] = [];
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalAlreadySent = 0;

    for (const id of offerIds) {
      const offer = db.offers.find((o) => o.id === id);

      if (!offer) {
        results.push({
          id,
          title: "Oferta não encontrada",
          success: false,
          error: "Oferta inexistente no banco de dados.",
        });
        totalFailed++;
        continue;
      }

      // 1. Idempotência estrita: se já enviou, não repete o disparo
      if (offer.status === "publicado" || offer.whatsappStatus === "enviado") {
        results.push({
          id: offer.id,
          title: offer.title,
          success: true,
          alreadySent: true,
          channel: settings.channelDestination,
        });
        totalAlreadySent++;
        continue;
      }

      // 2. Bloqueio de produtos rejeitados
      if (offer.status === "rejeitado") {
        results.push({
          id: offer.id,
          title: offer.title,
          success: false,
          error: "Oferta com status rejeitado não pode ser enviada.",
        });
        totalFailed++;
        continue;
      }

      // 3. Bloqueio estrito de livros, receitas, cursos e produtos digitais
      const categoryCheck = isBlockedProductOrCategory(offer.title, null, offer.searchTerm);
      if (categoryCheck.blocked) {
        results.push({
          id: offer.id,
          title: offer.title,
          success: false,
          error: categoryCheck.reason || "Produto bloqueado: livros, receitas, cursos e infoprodutos são proibidos.",
        });
        totalFailed++;
        continue;
      }

      // 4. Bloqueio por pontuação de score mínimo (75 padrão)
      const score = offer.opportunityScore ?? 0;
      if (score < minScore && !forceLowScore) {
        results.push({
          id: offer.id,
          title: offer.title,
          success: false,
          error: `Bloqueado por qualidade: Score ${score}/100 abaixo do mínimo permitido (${minScore}/100). Confirmação reforçada necessária.`,
        });
        totalFailed++;
        continue;
      }

      // 5. Revalidação de Estoque e Preço no Mercado Livre
      let isOutOfStock = false;
      let stockError = "";
      try {
        const mlItem = await revalidateMLItem(offer.externalId);
        if (mlItem && mlItem.valid === false) {
          isOutOfStock = true;
          stockError = mlItem.error || `Produto esgotado ou pausado no Mercado Livre (status: ${mlItem.status})`;
          await markOfferOutOfStock(offer.id, stockError);
        } else if (mlItem && mlItem.valid) {
          if (typeof mlItem.price === "number") offer.price = mlItem.price;
          if (mlItem.originalPrice !== undefined) offer.originalPrice = mlItem.originalPrice ?? null;
          offer.discountPercent = calcDiscountPercent(offer.price, offer.originalPrice);
        }
      } catch (revalErr) {
        console.warn(`[publish-now] Falha na revalidação de ${offer.id}:`, revalErr);
      }

      if (isOutOfStock) {
        results.push({
          id: offer.id,
          title: offer.title,
          success: false,
          error: stockError || "Produto sem estoque ou pausado no Mercado Livre.",
        });
        totalFailed++;
        continue;
      }

      // 6. Geração/garantia de link curto meli.la
      if (!offer.shortUrl || offer.shortUrlStatus !== "pronto") {
        try {
          const shortResult = await generateMeliShortLinkDetailed(offer.affiliateUrl || offer.originalUrl);
          if (shortResult.shortUrl) {
            offer.shortUrl = shortResult.shortUrl;
            offer.shortUrlStatus = "pronto";
          }
        } catch (shortErr) {
          console.warn(`[publish-now] Falha ao encurtar link para ${offer.id}:`, shortErr);
        }
      }

      // 7. Envio pelo canal existente de WhatsApp
      const dispatchResult = await dispatchOfferToChannel(offer, settings.channelDestination);

      if (dispatchResult.success) {
        await recordDispatchSuccess(offer.id, offer.title);
        results.push({
          id: offer.id,
          title: offer.title,
          success: true,
          channel: dispatchResult.channel,
          messageId: dispatchResult.externalMessageId,
        });
        totalSuccess++;
      } else {
        const errClean = dispatchResult.error || "Falha ao despachar oferta para o WhatsApp";
        await recordDispatchFailure(offer.id, errClean);
        results.push({
          id: offer.id,
          title: offer.title,
          success: false,
          error: errClean,
        });
        totalFailed++;
      }
    }

    return NextResponse.json<PublishNowResponse>({
      results,
      totalSuccess,
      totalFailed,
      totalAlreadySent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro crítico na publicação manual imediata";
    console.error("[api/offers/publish-now POST]", err);
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}
