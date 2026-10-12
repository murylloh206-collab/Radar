import "server-only";

import { detectCoupon } from "./affiliate";
import { generateMeliShortLinkDetailed } from "./meli-shortener";
import { revalidateMLItem } from "./mercadolivre";
import { generateMeliLaWithPuppeteer } from "./puppeteer-meli";
import { getStoredAutomationSettings, saveStoredAutomationSettings, updateDatabase } from "./storage";
import { dispatchOfferToChannel } from "./whatsapp-adapter";
import { calcDiscountPercent } from "../offer-rules";
import type { Offer } from "../types";

/**
 * SERVIÇO DE DISPACHO AUTOMÁTICO DE OFERTAS A CADA 5 MINUTOS
 * -----------------------------------------------------------
 * Execução idempotente, segura e sem loop infinito.
 * Pega estritamente a oferta aprovada mais antiga, revalida e envia.
 */

let isDispatching = false;

export interface DispatchResult {
  dispatched: boolean;
  status: "success" | "no_offers" | "disabled" | "busy" | "failed";
  message: string;
  offer?: {
    id: string;
    title: string;
    price: number;
    channel: string;
  };
  error?: string;
  remainingApprovedCount?: number;
  nextScheduledAt?: string;
}

/**
 * Localiza a oferta aprovada mais antiga que ainda não foi enviada nem falhou.
 */
function findOldestApprovedOffer(offers: Offer[]): Offer | null {
  const approvedCandidates = offers.filter(
    (o) =>
      o.status === "aprovado" &&
      o.whatsappStatus !== "enviado" &&
      o.whatsappStatus !== "falhou"
  );

  if (approvedCandidates.length === 0) return null;

  // Ordena pela mais antiga (statusChangedAt ou createdAt ascendente)
  approvedCandidates.sort((a, b) => {
    const timeA = a.statusChangedAt || a.createdAt;
    const timeB = b.statusChangedAt || b.createdAt;
    return timeA.localeCompare(timeB);
  });

  return approvedCandidates[0];
}

/**
 * Executa o despacho da próxima oferta aprovada.
 * @param force Ignora checagem de autoSendEnabled (útil para botão de teste manual)
 */
export async function dispatchNextApprovedOffer(force = false): Promise<DispatchResult> {
  if (isDispatching) {
    return {
      dispatched: false,
      status: "busy",
      message: "Outro despacho já está em andamento no momento.",
    };
  }

  isDispatching = true;

  try {
    const settings = await getStoredAutomationSettings();

    if (!settings.autoSendEnabled && !force) {
      return {
        dispatched: false,
        status: "disabled",
        message: "Envio automático está desativado nas configurações.",
      };
    }

    let targetOfferId: string | null = null;
    let targetOfferCopy: Offer | null = null;
    let remainingCount = 0;

    // 1. Identifica a oferta mais antiga de forma atômica
    await updateDatabase((db) => {
      const candidates = db.offers.filter(
        (o) =>
          o.status === "aprovado" &&
          o.whatsappStatus !== "enviado" &&
          o.whatsappStatus !== "falhou"
      );
      remainingCount = candidates.length;

      const oldest = findOldestApprovedOffer(db.offers);
      if (oldest) {
        targetOfferId = oldest.id;
        targetOfferCopy = { ...oldest };
      }
    });

    if (!targetOfferId || !targetOfferCopy) {
      // Nenhuma oferta aprovada aguardando envio
      const nextTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await saveStoredAutomationSettings({
        nextScheduledAt: nextTime,
      });

      return {
        dispatched: false,
        status: "no_offers",
        message: "Nenhuma oferta aprovada aguardando envio.",
        remainingApprovedCount: 0,
        nextScheduledAt: nextTime,
      };
    }

    const offer: Offer = targetOfferCopy;

    // 2. Revalidação de Link Curto
    // Se não tiver link meli.la, tenta gerar ou verificar
    if (!offer.shortUrl || !offer.shortUrl.includes("meli.la")) {
      let short = (await generateMeliShortLinkDetailed(offer.originalUrl)).shortUrl;
      if (!short) {
        short = await generateMeliLaWithPuppeteer(offer.originalUrl);
      }

      if (short) {
        offer.shortUrl = short;
      } else {
        // Falha no link curto: marca como falhou com motivo claro
        const errorReason = "Link curto meli.la não pôde ser gerado";
        const nextTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        await updateDatabase((db) => {
          const target = db.offers.find((o) => o.id === offer.id);
          if (target) {
            target.whatsappStatus = "falhou";
            target.whatsappError = errorReason;
            target.statusChangedAt = new Date().toISOString();
          }
          if (db.automation) {
            db.automation.lastError = errorReason;
            db.automation.nextScheduledAt = nextTime;
          }
        });

        return {
          dispatched: false,
          status: "failed",
          message: errorReason,
          error: errorReason,
          remainingApprovedCount: Math.max(0, remainingCount - 1),
          nextScheduledAt: nextTime,
        };
      }
    }

    // 3. Revalidação de Estoque e Preço no Mercado Livre
    const mlCheck = await revalidateMLItem(offer.externalId);
    if (!mlCheck.valid) {
      const errorReason = mlCheck.error || "Produto sem estoque ou pausado no Mercado Livre";
      const nextTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      await updateDatabase((db) => {
        const target = db.offers.find((o) => o.id === offer.id);
        if (target) {
          target.whatsappStatus = "falhou";
          target.whatsappError = errorReason;
          target.statusChangedAt = new Date().toISOString();
        }
        if (db.automation) {
          db.automation.lastError = errorReason;
          db.automation.nextScheduledAt = nextTime;
        }
      });

      return {
        dispatched: false,
        status: "failed",
        message: errorReason,
        error: errorReason,
        remainingApprovedCount: Math.max(0, remainingCount - 1),
        nextScheduledAt: nextTime,
      };
    }

    // Atualiza preço e frete se a API retornou valor atualizado
    if (typeof mlCheck.price === "number" && mlCheck.price > 0) {
      offer.price = mlCheck.price;
      if (mlCheck.originalPrice !== undefined) {
        offer.originalPrice = mlCheck.originalPrice;
      }
      if (mlCheck.freeShipping !== undefined) {
        offer.freeShipping = mlCheck.freeShipping;
      }
      offer.discountPercent = calcDiscountPercent(offer.price, offer.originalPrice);
    }

    // 4. Revalidação de Cupom
    const detected = detectCoupon(offer);
    if (detected.coupon) {
      offer.coupon = detected.coupon;
      offer.couponDescription = detected.description;
    }

    // 5. Monta a mensagem e envia pelo canal configurado
    const dispatchResult = await dispatchOfferToChannel(offer, settings.channelDestination);
    const nowIso = new Date().toISOString();
    const nextTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    if (!dispatchResult.success) {
      // Erro no canal de envio: marca como falhou
      const errorReason = dispatchResult.error || "Falha ao enviar pelo canal configurado";

      await updateDatabase((db) => {
        const target = db.offers.find((o) => o.id === offer.id);
        if (target) {
          target.whatsappStatus = "falhou";
          target.whatsappError = errorReason;
          target.statusChangedAt = nowIso;
        }
        if (db.automation) {
          db.automation.lastError = errorReason;
          db.automation.nextScheduledAt = nextTime;
        }
      });

      return {
        dispatched: false,
        status: "failed",
        message: errorReason,
        error: errorReason,
        remainingApprovedCount: Math.max(0, remainingCount - 1),
        nextScheduledAt: nextTime,
      };
    }

    // 6. Confirmação real de envio:
    // Remove da lista principal de aprovadas (status = 'publicado') e marca whatsappStatus = 'enviado'
    await updateDatabase((db) => {
      const target = db.offers.find((o) => o.id === offer.id);
      if (target) {
        target.status = "publicado"; // Remove de Aprovadas!
        target.whatsappStatus = "enviado";
        target.whatsappSentAt = nowIso;
        target.whatsappMessage = dispatchResult.messageText;
        target.whatsappError = null;
        target.statusChangedAt = nowIso;
        target.price = offer.price;
        target.originalPrice = offer.originalPrice;
        target.discountPercent = offer.discountPercent;
        target.shortUrl = offer.shortUrl;
        target.coupon = offer.coupon;
      }

      db.automation = {
        ...settings,
        lastDispatchedAt: nowIso,
        lastDispatchedOfferTitle: offer.title,
        lastError: null,
        nextScheduledAt: nextTime,
      };
    });

    return {
      dispatched: true,
      status: "success",
      message: `Oferta enviada com sucesso para ${dispatchResult.channel}!`,
      offer: {
        id: offer.id,
        title: offer.title,
        price: offer.price,
        channel: dispatchResult.channel,
      },
      remainingApprovedCount: Math.max(0, remainingCount - 1),
      nextScheduledAt: nextTime,
    };
  } finally {
    isDispatching = false;
  }
}

// ---------------------------------------------------------------------------
// Agendador em segundo plano para desenvolvimento local (Node.js)
// ---------------------------------------------------------------------------

declare global {
  var __offerAutoDispatchInterval: NodeJS.Timeout | undefined;
}

/**
 * Inicia o timer em segundo plano no servidor de desenvolvimento local.
 * Roda a cada 20 segundos para verificar se passou o intervalo de 5 minutos.
 */
export function ensureDevDispatcherRunning(): void {
  // Apenas no servidor Node.js
  if (typeof window !== "undefined") return;

  if (global.__offerAutoDispatchInterval) return;

  global.__offerAutoDispatchInterval = setInterval(async () => {
    try {
      const settings = await getStoredAutomationSettings();
      if (!settings.autoSendEnabled) return;

      const now = Date.now();
      const nextScheduled = settings.nextScheduledAt
        ? new Date(settings.nextScheduledAt).getTime()
        : 0;

      // Se já passou do horário previsto de 5 minutos (ou nunca foi agendado)
      if (now >= nextScheduled) {
        await dispatchNextApprovedOffer(false);
      }
    } catch (err) {
      console.error("[AutoDispatcher] Erro no timer em segundo plano:", err);
    }
  }, 20_000);
}

// Inicializa no import do módulo do servidor
ensureDevDispatcherRunning();
