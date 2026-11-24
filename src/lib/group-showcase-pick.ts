/** Escolha das ofertas mostradas na página /grupo (função pura, testada). */
export interface ShowcaseOffer { title: string; price: string; imageUrl: string; store: string }
interface Candidate { title: string; imageUrl: string | null; priceCurrent: number; store: string | null }

const STORES: Record<string, string> = { mercadolivre: 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee', netshoes: 'Netshoes' };
/** Acima disso é mais provável erro de leitura do preço do que oferta. */
const MAX_PRICE = 12_000;

export function cleanTitle(title: string): string {
  return title.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;|&gt;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/** Maiores valores primeiro, sem repetir o tipo de produto (ex.: uma TV só). Menos de 3 → nenhuma. */
export function pickShowcase(offers: Candidate[], max = 4): ShowcaseOffer[] {
  const used = new Set<string>();
  const picked: ShowcaseOffer[] = [];
  for (const offer of [...offers].sort((a, b) => b.priceCurrent - a.priceCurrent)) {
    const store = STORES[offer.store || ''];
    if (!store || !offer.imageUrl?.startsWith('https://') || offer.priceCurrent > MAX_PRICE) continue;
    const title = cleanTitle(offer.title);
    const words = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2 && !/^\d+$/.test(w)).slice(0, 3);
    if (!words.length || words.some(w => used.has(w))) continue;
    words.forEach(w => used.add(w));
    picked.push({
      title, store, imageUrl: offer.imageUrl,
      price: `R$ ${offer.priceCurrent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    });
    if (picked.length === max) break;
  }
  return picked.length >= 3 ? picked : [];
}
