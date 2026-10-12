import { NextResponse } from "next/server";
import {
  claimNextScheduledOfferAtomic,
  getSchedulerSettings,
  markOfferOutOfStock,
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
import type { ApiError, Offer } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Permite até 60s na Vercel para revalidação e envio

function verifyCronAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // Em dev local sem secret, permite execução

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;

  const url = new URL(request.url);
  if (url.searchParams.get("secret") === cronSecret) return true;

  // Permite disparos manuais originados da interface do painel (Same-Origin ou X-Requested-With)
  const secFetchSite = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const requestedWith = request.headers.get("x-requested-with");
  if (requestedWith === "XMLHttpRequest") return true;
  if (secFetchSite === "same-origin") return true;
  if (origin && host && origin.includes(host)) return true;

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
    const url = new URL(request.url);
    const isManualTrigger = request.headers.get("x-requested-with") === "XMLHttpRequest"
      || url.searchParams.get("manual") === "true";

    // 1. Checa estado do agendador (se for disparo manual, NÃO bloqueia se estiver pausado!)
    if (!isManualTrigger && settings.state !== "ativo") {
      return NextResponse.json({
        ok: true,
        processed: false,
        reason: `Agendador não está ativo (estado: ${settings.state}).`,
        settings,
      });
    }

    // 2. Checa janela operacional (se for disparo manual, NÃO bloqueia pelo horário da janela!)
    const spTime = getSaoPauloTime();
    if (!isManualTrigger && !isWithinOperatingWindow(settings, spTime)) {
      return NextResponse.json({
        ok: true,
        processed: false,
        reason: `Fora da janela operacional configurada (${settings.startHour} às ${settings.endHour} no fuso America/Sao_Paulo). Horário atual: ${spTime.timeStr}.`,
        spTime,
      });
    }

    // 3. Reclama atomicamente a próxima oferta agendada com lock.
    // Se for disparo manual, força a próxima da fila mesmo com horário futuro.
    // Se a oferta encontrada estiver esgotada no Mercado Livre, ela é descartada
    // e o sistema avança imediatamente para a próxima da fila (até 5 tentativas).
    let offer: Offer | null = null;
    let validatedPrice = 0;
    let validatedOriginalPrice: number | null = null;
    let validatedDiscount: number | null = null;
    let discardedCount = 0;

    while (discardedCount < 5) {
      const candidate = await claimNextScheduledOfferAtomic(isManualTrigger);
      if (!candidate) break;

      validatedPrice = candidate.price;
      validatedOriginalPrice = candidate.originalPrice;
      validatedDiscount = candidate.discountPercent;

      let isOutOfStock = false;
      try {
        const mlItem = await revalidateMLItem(candidate.externalId);
        if (mlItem && mlItem.valid === false) {
          // Produto esgotado ou pausado comprovado: descarta e pula para a próxima oferta
          await markOfferOutOfStock(
            candidate.id,
            mlItem.error || `Produto esgotado ou pausado no Mercado Livre (status: ${mlItem.status})`
          );
          discardedCount++;
          isOutOfStock = true;
        } else if (mlItem && mlItem.valid) {
          if (typeof mlItem.price === "number") {
            validatedPrice = mlItem.price;
          }
          if (mlItem.originalPrice !== undefined) {
            validatedOriginalPrice = mlItem.originalPrice ?? null;
          }
          validatedDiscount = calcDiscountPercent(validatedPrice, validatedOriginalPrice);
        }
      } catch (revalErr) {
        console.warn(`[cron] Não foi possível revalidar item ${candidate.externalId}, prosseguindo com dados atuais:`, revalErr);
      }

      if (isOutOfStock) {
        continue;
      }

      // Encontrou oferta com estoque garantido
      offer = candidate;
      break;
    }

    if (!offer) {
      return NextResponse.json({
        ok: true,
        processed: false,
        discardedCount,
        reason: discardedCount > 0
          ? `${discardedCount} oferta(s) esgotada(s) foram descartadas. Nenhuma outra oferta pronta na fila.`
          : "Nenhuma oferta agendada vencida no momento.",
      });
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
