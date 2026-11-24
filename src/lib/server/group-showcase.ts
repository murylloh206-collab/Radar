import 'server-only';
import { unstable_cache } from 'next/cache';
import { pickShowcase, type ShowcaseOffer } from '@/lib/group-showcase-pick';
import { ADMIN_UUID } from '@/lib/server/auth';

/** Ofertas reais das últimas 24 h para a página /grupo. Guardadas por 10 min; em falha, a página sai sem elas. */
const cachedShowcase = unstable_cache(async (): Promise<ShowcaseOffer[]> => {
  const { listEligibleOffers } = await import('@/lib/server/social-posts');
  return pickShowcase(await listEligibleOffers(ADMIN_UUID));
}, ['grupo-showcase-v1'], { revalidate: 600 });

export async function groupShowcase(): Promise<ShowcaseOffer[]> {
  try { return await cachedShowcase(); }
  catch (error) {
    console.error('[Grupo] ofertas da página:', error instanceof Error ? error.message : error);
    return [];
  }
}
