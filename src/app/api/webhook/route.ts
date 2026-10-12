import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/webhook
 * Verificação do Webhook da Meta (WhatsApp Business Cloud API).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === "radar123") {
    return new Response(challenge || "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("Token inválido", {
    status: 403,
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * POST /api/webhook
 * Recebimento de eventos/mensagens do WhatsApp.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    console.log("Webhook recebido:", JSON.stringify(body));

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("Erro ao processar webhook:", err);
    return NextResponse.json({ received: false }, { status: 400 });
  }
}
