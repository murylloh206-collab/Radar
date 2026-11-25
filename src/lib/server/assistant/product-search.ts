/*
 * Busca por nome do assistente (parte pura, testável): relevância, acessórios, qualidade e texto da resposta.
 */

export interface SearchHit {
  title: string;
  price: number;
  /** null = a loja não informa. */
  rating: number | null;
  sold: number | null;
  link: string;
  /** Nome da loja para mostrar ("Mercado Livre"). */
  store: string;
  /** Cupom da oferta do grupo: o preço só vale com ele. */
  coupon?: string | null;
}

export interface SearchItem extends SearchHit {
  /** O mesmo modelo em outra loja (para mostrar os dois preços). */
  alsoIn: SearchHit[];
}

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'pra', 'em', 'a', 'o', 'um', 'uma', 'por', 'sem', 'no', 'na', 'quero', 'preciso', 'procuro', 'busco']);

/** Minúsculas, sem acento, e com os nomes que se escrevem de dois jeitos unificados. */
export function normalizeSearch(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/(\d)[.,](\d)/g, '$1_$2').replace(/(\d)\s*(?:["”″]|'')/g, '$1 pol ').replace(/[^a-z0-9_]+/g, ' ')
    .replace(/\bair ?fr[iy]y?ers?\b/g, 'airfryer').replace(/\b(celular|celulares|smartphones)\b/g, 'smartphone')
    .replace(/\b(televisao|televisor)\b/g, 'tv').replace(/\s+/g, ' ').trim();
}

const UNITS: Record<string, string> = {
  l: 'l', lt: 'l', litro: 'l', litros: 'l', ml: 'ml', g: 'g', gr: 'g', gramas: 'g', kg: 'kg', quilos: 'kg',
  gb: 'gb', tb: 'tb', w: 'w', watts: 'w', pol: 'pol', polegada: 'pol', polegadas: 'pol',
};
const QUANTITY = /\b(\d+(?:_\d+)?) ?(litros?|lt|l|ml|gramas|gr|g|quilos|kg|gb|tb|watts|w|polegadas?|pol)\b/g;

function quantities(normalized: string): Array<{ value: number; unit: string }> {
  return [...normalized.matchAll(QUANTITY)].map(m => ({ value: Number(m[1].replace('_', '.')), unit: UNITS[m[2]] }));
}

/** Palavras que definem a busca: sem preposições e sem medidas ("4 litros"). */
export function mainWords(query: string): string[] {
  const words = normalizeSearch(query).replace(QUANTITY, ' ').split(/\s+/).filter(w => w && !STOP.has(w));
  return [...new Set(words)];
}

const singular = (w: string) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** Acessório em qualquer lugar do título, salvo "com capa", "+ película"… */
const STRONG = new Set(['capa', 'capinha', 'case', 'pelicula', 'refil', 'skin', 'caso', 'involucro']);
/** Acessório só quando vem antes do nome do produto ("Forma de silicone para airfryer"). */
const WEAK = new Set(['forma', 'suporte', 'peca', 'cabo', 'extensao', 'tampa', 'cesto', 'cesta', 'papel', 'filtro', 'borracha', 'resistencia',
  'carregador', 'adaptador', 'adesivo', 'organizador', 'acessorio', 'ejetor', 'grelha', 'assadeira', 'tapete', 'pulseira', 'controle', 'bateria', 'fonte', 'protetor']);
const WITH = new Set(['com', 'e', 'mais', 'brinde', 'inclui', 'gratis']);

export function isAccessory(title: string, query: string): boolean {
  const wanted = new Set(mainWords(query).map(singular));
  const words = normalizeSearch(title.replace(/\+/g, ' mais ')).split(' ').map(singular);
  const first = words.findIndex(w => wanted.has(w));
  return words.some((word, i) => {
    if (wanted.has(word)) return false;
    if (WEAK.has(word)) return first < 0 || i < first;
    if (!STRONG.has(word)) return false;
    return first < 0 || i < first || !words.slice(Math.max(0, i - 2), i).some(w => WITH.has(w));
  });
}

/** O título é mesmo do produto procurado: palavras principais, medida parecida e não é acessório. */
export function isRelevant(title: string, query: string): boolean {
  const normalized = normalizeSearch(title);
  const words = new Set(normalized.split(' ').map(singular));
  const wanted = mainWords(query);
  if (!wanted.length || !wanted.every(w => words.has(singular(w)))) return false;
  if (isAccessory(title, query)) return false;
  const list = normalized.split(' ').map(singular);
  const first = list.findIndex(w => wanted.map(singular).includes(w));
  // "Desengordurante … para Air Fryer": o produto procurado vem no fim ou depois de "para" → é outra coisa.
  if (first > 4 || list.slice(0, first).some(w => w === 'para' || w === 'pra')) return false;
  // "Galaxy A17 A37 A57…": lista de modelos compatíveis é acessório.
  if (new Set(list.filter(w => /^[a-z]\d{2,3}[a-z]?$/.test(w))).size >= 3) return false;
  const have = quantities(normalized);
  return quantities(normalizeSearch(query)).every(q => {
    const same = have.filter(h => h.unit === q.unit);
    // Litros variam um pouco entre marcas (4 → 4,2 L); memória, peso e polegadas têm que bater.
    const tolerance = q.unit === 'l' ? 0.2 : 0;
    return !same.length || same.some(h => Math.abs(h.value - q.value) <= q.value * tolerance + 1e-9);
  });
}

const BRANDS = new Set(['wap', 'mondial', 'philco', 'britania', 'electrolux', 'elgin', 'arno', 'oster', 'cadence', 'midea', 'consul', 'brastemp', 'lg',
  'samsung', 'motorola', 'xiaomi', 'apple', 'realme', 'lenovo', 'dell', 'acer', 'asus', 'hp', 'sony', 'jbl', 'philips', 'tcl', 'hisense', 'aoc', 'multi',
  'nike', 'adidas', 'puma', 'fila', 'olympikus', 'mizuno', 'asics', 'kappa', 'lacoste', 'dux', 'growth', 'integralmedica', 'tramontina', 'bosch', 'makita', 'logitech', 'redragon']);

/** A busca e, se não achar, versões com menos palavras: sem medidas e depois só tipo + marca. */
export function searchAttempts(query: string): string[] {
  const words = mainWords(query);
  const brand = words.find(w => BRANDS.has(w));
  const type = words.find(w => !BRANDS.has(w) && !/\d/.test(w));
  const attempts = [query.trim(), words.join(' ')];
  if (brand && type) attempts.push(`${type} ${brand}`);
  const seen = new Set<string>();
  return attempts.map(a => a.replace(/\bairfryer\b/g, 'air fryer')).filter(a => {
    const key = normalizeSearch(a);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Nota ≥ 4,5 e ≥ 100 vendidos quando a loja informa; dado que falta não descarta. Mais baratos primeiro. */
export function trustedHits(hits: SearchHit[]): SearchHit[] {
  return hits.filter(h => h.link && h.price > 0 && (h.rating === null || h.rating >= 4.5) && (h.sold === null || h.sold >= 100))
    .sort((a, b) => a.price - b.price);
}

/** Tira o que custa muito menos que o resto (peça, amostra, acessório com título enganoso). */
export function withoutOutliers(hits: SearchHit[]): SearchHit[] {
  if (hits.length < 3) return hits;
  const prices = hits.map(h => h.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  return hits.filter(h => h.price >= median * 0.3);
}

/** Mesmo modelo: os dois têm o mesmo código com letras e números (WAOD4, A17…) e as mesmas medidas. */
export function sameModel(a: SearchHit, b: SearchHit): boolean {
  const parts = (title: string) => {
    const n = normalizeSearch(title);
    return {
      codes: n.replace(QUANTITY, ' ').split(/\s+/).filter(w => w.length >= 3 && /[a-z]/.test(w) && /\d/.test(w) && !/^\d+(v|hz|k|w|mp|g|em1|x\d+)$/.test(w)),
      network: /\b5g\b/.test(n),
      sizes: [...new Set(quantities(n).filter(q => q.unit !== 'w').map(q => `${q.value}${q.unit}`))].sort().join(),
    };
  };
  const x = parts(a.title); const y = parts(b.title);
  if (!x.codes.some(c => y.codes.includes(c))) return false;
  // Na dúvida (4G × 5G, 128 × 256 GB) são produtos diferentes: cada um aparece com o seu preço.
  return x.network === y.network && x.sizes === y.sizes;
}

/** Até `limit` produtos, do mais barato; o mesmo modelo em outra loja vai junto; outra loja entra quando houver. */
export function pickHits(hits: SearchHit[], limit = 3): SearchItem[] {
  const items: SearchItem[] = [];
  for (const hit of hits) {
    if (items.some(i => i.link === hit.link)) continue;
    const twin = items.find(i => sameModel(i, hit) && hit.price <= i.price * 2);
    if (twin) {
      const stores = [twin.store, ...twin.alsoIn.map(h => h.store)];
      if (!stores.includes(hit.store)) { twin.alsoIn.push(hit); continue; }
    }
    items.push({ ...hit, alsoIn: [] });
  }
  const picked = items.slice(0, limit);
  const stores = new Set(picked.flatMap(i => [i.store, ...i.alsoIn.map(h => h.store)]));
  const other = items.slice(limit).find(i => !stores.has(i.store));
  if (stores.size === 1 && other && picked.length === limit) picked[limit - 1] = other;
  return picked;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const soldLabel = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil vendidos` : `${n} vendidos`);

function priceLine(h: SearchHit): string {
  const parts = [h.store, `R$ ${brl(h.price)}${h.coupon ? ` com o cupom *${h.coupon}*` : ''}`];
  if (h.rating !== null) parts.push(`⭐ ${h.rating.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`);
  if (h.sold !== null) parts.push(soldLabel(h.sold));
  return parts.join(' · ');
}

/** Resultado bruto das lojas; `unavailable` = a busca ao vivo falhou (não é "não existe"). */
export interface StoreSearch { hits: SearchHit[]; unavailable?: boolean }

export interface SearchOutcome { items: SearchItem[]; unavailable?: boolean; /** Busca com menos palavras que achou estes resultados. */ relaxedTo?: string }

export function formatSearch(query: string, outcome: SearchOutcome): string {
  if (!outcome.items.length && outcome.unavailable) return `A busca nas lojas está instável agora e não consegui procurar *${query}*. Tenta de novo em alguns minutos ou me manda o link do produto. 🔎`;
  if (!outcome.items.length) return `Não achei nas lojas uma opção confiável de *${query}*. Tenta outro nome ou me manda o link do produto. 🔎`;
  const lines = [outcome.relaxedTo
    ? `🔎 Não achei exatamente *${query}*. Achei parecidos (*${outcome.relaxedTo}*):`
    : `🔎 *${query}* nas lojas (mais baratos primeiro):`];
  outcome.items.forEach((h, i) => {
    lines.push('', `*${i + 1}. ${h.title.length > 70 ? `${h.title.slice(0, 67).trimEnd()}…` : h.title}*`, priceLine(h), h.link);
    for (const twin of h.alsoIn) lines.push(`Também em: ${priceLine(twin)}`, twin.link);
  });
  lines.push('', 'Preço pode mudar na loja. Digite *4* para buscar outro produto ou *menu* para as opções.');
  return lines.join('\n');
}

/** Tenta a busca e, se preciso, as versões com menos palavras. */
export async function searchProducts(query: string, find: (q: string) => Promise<StoreSearch>): Promise<SearchOutcome> {
  let unavailable = false;
  for (const [index, attempt] of searchAttempts(query).entries()) {
    const found = await find(attempt);
    unavailable = unavailable || Boolean(found.unavailable);
    const hits = withoutOutliers(trustedHits(found.hits.filter(h => isRelevant(h.title, attempt))));
    if (hits.length) return { items: pickHits(hits), relaxedTo: index ? attempt : undefined };
  }
  return { items: [], unavailable };
}
