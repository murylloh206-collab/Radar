import { parseGroupOffer, productKey, type GroupOffer } from './link-message';

/*
 * Acha, entre as ofertas de hoje do grupo, a do produto que a pessoa mandou (parte pura, testável).
 * A opção 3 do menu e a resposta do link usam as MESMAS linhas, para nunca discordarem.
 */

export interface GroupRow {
  messageText: string;
  affiliateUrl: string | null;
  cleanUrl: string | null;
  originalUrl: string | null;
  mediaUrl: string | null;
  inboxId: string | null;
  store: string | null;
  title: string | null;
  /** O link foi confirmado como da conta no momento do envio. */
  verified: boolean;
}

export interface GroupMatch { by: 'link' | 'produto' | 'titulo'; mediaUrl: string | null; coupon: string | null; price: string | null }

/** Uma por oferta (a mais recente de cada título), na ordem em que vieram: mais recentes primeiro. */
export function offersFromRows(rows: GroupRow[]): GroupOffer[] {
  const seen = new Set<string>();
  const offers: GroupOffer[] = [];
  for (const row of rows) {
    const offer = parseGroupOffer(row.messageText, row.affiliateUrl);
    if (!offer) continue;
    const key = row.inboxId || offer.title;
    if (seen.has(key) || seen.has(offer.title)) continue;
    seen.add(key); seen.add(offer.title);
    offers.push(offer);
  }
  return offers;
}

/** Endereço comparável: sem "#", sem barra no fim e, nos encurtadores, sem parâmetros. */
export function normalizeLink(url?: string | null): string {
  try {
    const u = new URL(String(url || '').trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const short = /^(meli\.la|s\.shopee\.com\.br|br\.shp\.ee|shope\.ee|amzn\.to|a\.co)$/.test(host);
    return `https://${host}${u.pathname.replace(/\/+$/, '')}${short ? '' : u.search}`;
  } catch { return ''; }
}

/** Todos os códigos de produto escritos nos endereços (catálogo e anúncio do Mercado Livre, ASIN…). */
export function productKeys(...urls: Array<string | null | undefined>): Set<string> {
  const keys = new Set<string>();
  for (const raw of urls) {
    if (!raw) continue;
    const key = productKey(raw);
    if (key) keys.add(key);
    let text = raw;
    try { text = decodeURIComponent(raw); } catch { /* fica como veio */ }
    for (const m of text.matchAll(/(?:wid=|item_id[:=])(MLB\d{6,})/gi)) keys.add(m[1].toUpperCase());
  }
  return keys;
}

const tokens = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em', 'a', 'o', 'por', 'sem', 'no', 'na']);
/** Palavras que mudam o modelo: têm que aparecer nos dois títulos ou em nenhum. */
const VARIANT = ['pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'fe', 'se', 'kit', 'combo', 'refil'];

/** Nome do produto escrito no próprio endereço (ex.: /smartphone-samsung-galaxy-a17/p/MLB…). */
export function titleFromUrl(url?: string | null): string | null {
  try {
    const parts = new URL(String(url || '')).pathname.split('/').filter(Boolean);
    const slug = parts.filter(p => p.split('-').length >= 3).sort((a, b) => b.length - a.length)[0];
    return slug ? decodeURIComponent(slug).replace(/^MLB-?\d+-/i, '').replace(/_JM$/i, '').replace(/-/g, ' ').trim() || null : null;
  } catch { return null; }
}

/** Todas as palavras do título do grupo estão no nome do produto, sem trocar a versão (Pro, Plus, kit…). */
export function sameTitle(groupTitle: string, productTitle: string): boolean {
  const group = tokens(groupTitle).filter(t => !STOP.has(t));
  const product = new Set(tokens(productTitle));
  if (new Set(group).size < 3 || !group.every(t => product.has(t))) return false;
  return VARIANT.every(v => group.includes(v) === product.has(v));
}

export interface MatchTarget { affiliateUrl?: string; cleanUrl?: string; sourceUrl?: string; store?: string }

/**
 * Procura por (a) mesmo link de afiliado, (b) mesmo código de produto e (c) mesmo nome, nesta ordem.
 * No nome (c) o preço não é usado: pode ser outro anúncio do mesmo produto.
 */
export function matchGroupOffer(rows: GroupRow[], target: MatchTarget): GroupMatch | null {
  const links = new Set([normalizeLink(target.affiliateUrl), normalizeLink(target.sourceUrl)].filter(Boolean));
  const keys = productKeys(target.cleanUrl, target.sourceUrl);
  const name = titleFromUrl(target.cleanUrl);
  const steps: Array<[GroupMatch['by'], (row: GroupRow) => boolean]> = [
    ['link', row => links.has(normalizeLink(row.affiliateUrl))],
    ['produto', row => [...productKeys(row.cleanUrl, row.originalUrl)].some(k => keys.has(k))],
    ['titulo', row => Boolean(name && row.title && (!target.store || row.store === target.store) && sameTitle(row.title, name))],
  ];
  for (const [by, test] of steps) {
    const found = rows.filter(test);
    if (!found.length) continue;
    // Mesma regra da lista: vale a oferta mais recente de cada título; entre elas, a que tem cupom.
    const offers = offersFromRows(found);
    const offer = offers.find(o => o.coupon) || offers[0];
    if (!offer) continue;
    const row = found.find(r => parseGroupOffer(r.messageText, r.affiliateUrl)?.title === offer.title) || found[0];
    return { by, mediaUrl: by === 'titulo' ? null : row.mediaUrl, coupon: offer.coupon, price: by === 'titulo' ? null : offer.price };
  }
  return null;
}
