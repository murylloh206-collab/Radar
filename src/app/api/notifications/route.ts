import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Webhook endpoint para notificações do Mercado Livre DevCenter.
 * Retorna 200 OK para confirmação de recebimento.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    console.log("[ML Webhook Notification received]", body?.topic || "notification");
  } catch {
    // Ignora payload inválido
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "mercado-livre-notifications" });
}
