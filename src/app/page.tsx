import { OfferDashboard } from "@/components/OfferDashboard";
import { config, isMercadoLivreConfigured } from "@/lib/server/config";
import { hasActiveMLConnection } from "@/lib/server/mercadolivre";
import { listOffers } from "@/lib/server/offers-service";
import type { OffersResponse } from "@/lib/types";

// Sempre lê o arquivo de dados na hora (nada de cache), para refletir o que foi salvo.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { offers, lastSearch } = await listOffers();

  const initial: OffersResponse = {
    offers,
    lastSearch,
    config: {
      defaultTerms: config.searchTerms,
      resultsPerTerm: config.resultsPerTerm,
      mercadoLivreConfigured: isMercadoLivreConfigured(),
      mercadoLivreConnected: await hasActiveMLConnection(),
    },
  };

  return (
    <main>
      <OfferDashboard initial={initial} />
    </main>
  );
}
