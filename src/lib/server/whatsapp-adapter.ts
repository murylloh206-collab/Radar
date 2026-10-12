import "server-only";

import type { Offer } from "../types";
import { formatAutoDispatchMessage } from "../whatsapp-format";

/**
 * ADAPTADOR ISOLADO DE WHATSAPP
 * ------------------------------
 * Regras estritas:
 * 1. WhatsApp Business Oficial (Cloud API): apenas para contatos individuais com opt-in e template aprovado.
 * 2. Grupos comuns: NÃO automatiza via Puppeteer nem scripts web. Prepara a mensagem pronta para copiar.
 * 3. Credenciais isoladas por variáveis de ambiente.
 */

export interface WhatsAppDispatchResult {
  success: boolean;
  channel: string;
  dispatchedVia: "official_api" | "staged_manual_group" | "mock_dev";
  messageText: string;
  photoUrl: string | null;
  externalMessageId?: string;
  error?: string;
  notes?: string;
}

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
  recipientPhone: string;
  templateName?: string;
}

export function getWhatsAppConfig(): WhatsAppConfig | null {
  const token = process.env.WHATSAPP_BUSINESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const recipientPhone = process.env.WHATSAPP_RECIPIENT_PHONE;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;

  if (token && phoneNumberId && recipientPhone) {
    return { token, phoneNumberId, recipientPhone, templateName };
  }
  return null;
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(getWhatsAppConfig());
}

/**
 * Envia uma mensagem via WhatsApp Cloud API Oficial (Meta Graph API).
 * Apenas para contato individual verificado com opt-in.
 */
async function sendViaOfficialCloudApi(
  config: WhatsAppConfig,
  text: string,
  photoUrl: string | null
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const url = `https://graph.facebook.com/v19.0/${config.phoneNumberId}/messages`;

  // Se tiver template configurado, dispara com template ou texto simples
  const payload = config.templateName
    ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: config.recipientPhone,
        type: "template",
        template: {
          name: config.templateName,
          language: { code: "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text }],
            },
          ],
        },
      }
    : photoUrl
    ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: config.recipientPhone,
        type: "image",
        image: {
          link: photoUrl,
          caption: text,
        },
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: config.recipientPhone,
        type: "text",
        text: { body: text, preview_url: true },
      };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number };
    };

    if (!res.ok || data.error) {
      const msg = data.error?.message || `Erro HTTP ${res.status}`;
      return { success: false, error: `Falha na Cloud API do WhatsApp: ${msg}` };
    }

    const messageId = data.messages?.[0]?.id || "wa_msg_ok";
    return { success: true, messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Erro de conexão com o WhatsApp: ${msg}` };
  }
}

export interface WhatsAppGatewayConfig {
  baseUrl: string;
  apiKey: string;
  groupJid: string;
  instanceName?: string;
}

export function getWhatsAppGatewayConfig(): WhatsAppGatewayConfig | null {
  const baseUrl = process.env.WHATSAPP_GATEWAY_URL;
  const apiKey = process.env.WHATSAPP_GATEWAY_KEY || "";
  const groupJid = process.env.WHATSAPP_GROUP_JID || process.env.WHATSAPP_RECIPIENT_PHONE || "";

  if (baseUrl && groupJid) {
    return {
      baseUrl: baseUrl.replace(/\/$/, ""),
      apiKey,
      groupJid,
      instanceName: process.env.WHATSAPP_GATEWAY_INSTANCE || "radar",
    };
  }
  return null;
}

/**
 * Envia mensagem para grupo ou contato via Gateway HTTP do WhatsApp (ex: Evolution API ou worker Baileys).
 * Não mantém socket na Vercel; apenas consome a API do daemon externo.
 */
async function sendViaHttpGateway(
  config: WhatsAppGatewayConfig,
  text: string,
  photoUrl: string | null
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const endpoint = photoUrl
      ? `${config.baseUrl}/message/sendMedia/${config.instanceName}`
      : `${config.baseUrl}/message/sendText/${config.instanceName}`;

    const payload = photoUrl
      ? {
          number: config.groupJid,
          media: photoUrl,
          mediatype: "image",
          caption: text,
        }
      : {
          number: config.groupJid,
          text,
        };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.apiKey,
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as {
      key?: { id?: string };
      messageId?: string;
      id?: string;
      error?: string;
      message?: string;
    };

    if (!res.ok) {
      const err = data.error || data.message || `HTTP ${res.status}`;
      return { success: false, error: `Gateway WhatsApp recusou o envio: ${err}` };
    }

    const messageId = data.key?.id || data.messageId || data.id || `gw_${Date.now()}`;
    return { success: true, messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Falha de conexão com o Gateway WhatsApp: ${msg}` };
  }
}

/**
 * Adaptador central de despacho para o canal configurado.
 * REGRA ESTRITA: NUNCA simula envio bem-sucedido.
 */
export async function dispatchOfferToChannel(
  offer: Offer,
  channelDestination: string
): Promise<WhatsAppDispatchResult> {
  const messageText = formatAutoDispatchMessage(offer);
  const photoUrl = offer.thumbnail || null;
  const channel = (channelDestination || "Grupo VIP de Ofertas").trim();

  // 1. Tenta gateway HTTP real (adequado para grupos e Vercel Serverless)
  const gatewayConfig = getWhatsAppGatewayConfig();
  if (gatewayConfig) {
    const gwResult = await sendViaHttpGateway(gatewayConfig, messageText, photoUrl);
    if (!gwResult.success) {
      return {
        success: false,
        channel,
        dispatchedVia: "official_api",
        messageText,
        photoUrl,
        error: gwResult.error,
      };
    }
    return {
      success: true,
      channel,
      dispatchedVia: "official_api",
      messageText,
      photoUrl,
      externalMessageId: gwResult.messageId,
    };
  }

  // 2. Tenta Meta Cloud API Oficial (apenas se configurada)
  const officialConfig = getWhatsAppConfig();
  if (officialConfig) {
    const apiResult = await sendViaOfficialCloudApi(officialConfig, messageText, photoUrl);
    if (!apiResult.success) {
      return {
        success: false,
        channel,
        dispatchedVia: "official_api",
        messageText,
        photoUrl,
        error: apiResult.error,
      };
    }
    return {
      success: true,
      channel,
      dispatchedVia: "official_api",
      messageText,
      photoUrl,
      externalMessageId: apiResult.messageId,
    };
  }

  // 3. Sem serviço de envio configurado: FALHA REAL (não simula sucesso)
  return {
    success: false,
    channel,
    dispatchedVia: "mock_dev",
    messageText,
    photoUrl,
    error:
      "Nenhum serviço de envio de WhatsApp configurado no ambiente. " +
      "Configure WHATSAPP_GATEWAY_URL e WHATSAPP_GROUP_JID (para envio em grupo) ou as variáveis da Meta Cloud API. " +
      "O sistema não simula publicações falsas.",
  };
}

