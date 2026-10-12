import { NextResponse } from "next/server";
import {
  claimNextScheduledOfferAtomic,
  getSchedulerSettings,
  recordDispatchFailure,
  recordDispatchSuccess,
} from "@/lib/server/storage";
import {
  getSaoPauloTime,
  isWithinOperatingWindow,
} from "@/lib/server/scheduler-engine";
import { revalidateMLItem } from "@/lib/server/mercadolivre";
import { generateMeliShortLinkDetailed } from "@/lib/server/meli-shortener";
import { dispatchOfferToChannel } from "@/lib/server/whatsapp-adapter";
import { calcDiscountPercent } from "@/lib/offer-rules";
import type { ApiError } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Permite até 60s na Vercel para revalidação e envio

function verifyCronAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // Em dev local sem secret, permite execução

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;

  const url = new URL(request.url);
  if (url.searchParams.get("secret") === cronSecret) return true;

  return false;
}

/**
 * POST ou GET /api/cron/process-scheduled
 * Acionado periodicamente (pelo cron da Vercel ou cron externo) para processar
 * a próxima oferta agendada com proteção atômica e concorrência garantida.
 */
async function handleProcessScheduled(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json<ApiError>(
      { error: "Acesso não autorizado ao cron do agendador." },
      { status: 401 }
    );
  }

  try {
    const settings = await getSchedulerSettings();

    // 1. Checa estado do agendador
    if (settings.state !== "ativo") {
      return NextResponse.json({
        ok: true,
        processed: false,
        reason: `Agendador não está ativo (estado: ${settings.state}).`,
        settings,
      });
    }

    // 2. Checa janela operacional (ex: 07:00 às 00:00 em America/Sao_Paulo)
    const spTime = getSaoPauloTime();
    if (!isWithinOperatingWindow(settings, spTime)) {
      return NextResponse.json({
        ok: true,
        processed: false,
        reason: `Fora da janela operacional configurada (${settings.startHour} às ${settings.endHour} no fuso America/Sao_Paulo). Horário atual: ${spTime.timeStr}.`,
        spTime,
      });
    }

    // 3. Reclama atomicamente a próxima oferta agendada com lock
    const offer = await claimNextScheduledOfferAtomic();

    if (!offer) {
      return NextResponse.json({
        ok: true,
        processed: false,
        reason: "Nenhuma oferta agendada vencida no momento.",
      });
    }

    // 4. Revalidação de preço, estoque e status no Mercado Livre
    let validatedPrice = offer.price;
    let validatedOriginalPrice = offer.originalPrice;
    let validatedDiscount = offer.discountPercent;

    try {
      const mlItem = await revalidateMLItem(offer.externalId);
      if (mlItem) {
        const availableQty = mlItem.availableQuantity ?? 0;
        if (mlItem.status === "paused" || mlItem.status === "closed" || availableQty <= 0) {
          // Produto indisponível: registra falha de estoque e marca como rejeitado
          await recordDispatchFailure(
            offer.id,
            `Produto esgotado ou pausado no Mercado Livre (status: ${mlItem.status}, estoque: ${availableQty})`
          );
          return NextResponse.json({
            ok: false,
            processed: true,
            status: "esgotado",
            offerId: offer.id,
            reason: "Item pausado ou sem estoque no Mercado Livre.",
          });
        }

        if (typeof mlItem.price === "number") {
          validatedPrice = mlItem.price;
        }
        if (mlItem.originalPrice !== undefined) {
          validatedOriginalPrice = mlItem.originalPrice ?? null;
        }
        validatedDiscount = calcDiscountPercent(validatedPrice, validatedOriginalPrice);
      }
    } catch (revalErr) {
      console.warn(`[cron] Não foi possível revalidar item ${offer.externalId}, prosseguindo com dados atuais:`, revalErr);
    }

    // Atualiza a oferta em memória antes de formatar mensagem
    offer.price = validatedPrice;
    offer.originalPrice = validatedOriginalPrice;
    offer.discountPercent = validatedDiscount;

    // 5. Garante link curto meli.la se ainda não estiver pronto
    if (!offer.shortUrl || offer.shortUrlStatus !== "pronto") {
      try {
        const shortResult = await generateMeliShortLinkDetailed(offer.affiliateUrl || offer.originalUrl);
        if (shortResult.shortUrl) {
          offer.shortUrl = shortResult.shortUrl;
          offer.shortUrlStatus = "pronto";
        }
      } catch (shortErr) {
        console.warn(`[cron] Falha ao encurtar link para ${offer.id}:`, shortErr);
      }
    }

    // 6. Despacho real pelo canal do WhatsApp (com validação estrita sem simulação)
    const dispatchResult = await dispatchOfferToChannel(offer, settings.channelDestination);

    if (dispatchResult.success) {
      await recordDispatchSuccess(offer.id, offer.title);
      return NextResponse.json({
        ok: true,
        processed: true,
        status: "enviado",
        offerId: offer.id,
        title: offer.title,
        channel: dispatchResult.channel,
        messageId: dispatchResult.externalMessageId,
      });
    } else {
      const errorMsg = dispatchResult.error || "Erro desconhecido ao despachar para o WhatsApp";
      const failureOutcome = await recordDispatchFailure(offer.id, errorMsg);

      return NextResponse.json(
        {
          ok: false,
          processed: true,
          status: "falhou",
          offerId: offer.id,
          title: offer.title,
          error: errorMsg,
          autoPaused: failureOutcome.autoPaused,
          consecutiveFailures: failureOutcome.consecutiveFailures,
        },
        { status: 502 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro crítico no cron do agendador";
    console.error("[cron/process-scheduled]", err);
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleProcessScheduled(request);
}

export async function POST(request: Request) {
  return handleProcessScheduled(request);
}
