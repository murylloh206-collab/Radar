import { NextResponse } from "next/server";
import { config, isMercadoLivreConfigured } from "@/lib/server/config";
import { hasActiveMLConnection } from "@/lib/server/mercadolivre";
import { listOffers } from "@/lib/server/offers-service";
import { getSchedulerSettings, getStoredAutomationSettings } from "@/lib/server/storage";
import { computeSchedulerStats } from "@/lib/server/scheduler-engine";
import type { OffersResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/offers — lista ofertas salvas, status da fila, configurações do algoritmo e agendador. */
export async function GET() {
  const { offers, lastSearch, queueStats, algorithmSettings } = await listOffers();
  const automation = await getStoredAutomationSettings();
  const scheduler = await getSchedulerSettings();
  const schedulerStats = computeSchedulerStats(offers, scheduler);

  const body: OffersResponse = {
    offers,
    lastSearch,
    automation,
    scheduler,
    schedulerStats,
    algorithmSettings,
    queueStats,
    config: {
      defaultTerms: config.searchTerms,
      resultsPerTerm: config.resultsPerTerm,
      mercadoLivreConfigured: isMercadoLivreConfigured(),
      mercadoLivreConnected: await hasActiveMLConnection(),
    },
  };
  return NextResponse.json(body);
}
