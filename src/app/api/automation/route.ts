import { NextResponse } from "next/server";
import { readDatabase } from "@/lib/server/storage";
import { getStoredAutomationSettings, saveStoredAutomationSettings } from "@/lib/server/storage";
import type { AutomationSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/automation
 * Retorna as configurações de automação e o contador de ofertas aprovadas na fila.
 */
export async function GET() {
  const settings = await getStoredAutomationSettings();
  const db = await readDatabase();

  const approvedWaitingCount = db.offers.filter(
    (o) =>
      o.status === "aprovado" &&
      o.whatsappStatus !== "enviado" &&
      o.whatsappStatus !== "falhou"
  ).length;

  return NextResponse.json({
    ...settings,
    approvedWaitingCount,
  });
}

/**
 * PATCH /api/automation
 * Atualiza botão ligar/desligar e canal de destino.
 */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<AutomationSettings>;

    const patch: Partial<AutomationSettings> = {};

    if (typeof body.autoSendEnabled === "boolean") {
      patch.autoSendEnabled = body.autoSendEnabled;

      // Se acabou de ligar e não tem próximo agendamento, agenda para daqui a 5 minutos
      if (body.autoSendEnabled) {
        patch.nextScheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      }
    }

    if (typeof body.channelDestination === "string") {
      patch.channelDestination = body.channelDestination.trim() || "Grupo VIP de Ofertas";
    }

    const updated = await saveStoredAutomationSettings(patch);
    const db = await readDatabase();

    const approvedWaitingCount = db.offers.filter(
      (o) =>
        o.status === "aprovado" &&
        o.whatsappStatus !== "enviado" &&
        o.whatsappStatus !== "falhou"
    ).length;

    return NextResponse.json({
      ...updated,
      approvedWaitingCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao salvar configurações de automação";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
