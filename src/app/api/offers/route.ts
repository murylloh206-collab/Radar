import { NextResponse } from "next/server";
import { config, isMercadoLivreConfigured } from "@/lib/server/config";
import { hasActiveMLConnection } from "@/lib/server/mercadolivre";
import { listOffers } from "@/lib/server/offers-service";
import type { OffersResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/offers — lista todas as ofertas salvas + configurações da busca. */
export async function GET() {
  const { offers, lastSearch } = await listOffers();
  const body: OffersResponse = {
    offers,
    lastSearch,
    config: {
      defaultTerms: config.searchTerms,
      resultsPerTerm: config.resultsPerTerm,
      mercadoLivreConfigured: isMercadoLivreConfigured(),
      mercadoLivreConnected: await hasActiveMLConnection(),
    },
  };
  return NextResponse.json(body);
}
