/*
 * Assistente WhatsApp v1 (parte pura, testável): acha os links de produto numa mensagem do privado,
 * pega o nome que a pessoa escreveu antes de cada link e monta a resposta com os links convertidos.
 */

export const MAX_LINKS_PER_MESSAGE = 10;

export interface FoundLink { url: string; label: string | null }

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING = /[)\].,;:!?…*_~]+$/;

/** Nome curto para mostrar na resposta: tira "Oferta:", emojis soltos e o que vem depois de "|". */
export function cleanLabel(raw: string): string | null {
  let text = raw.replace(URL_RE, ' ').replace(/[*_~]/g, '').trim();
  text = text.replace(/^(oferta|produto|link|promo(ção|cao)?)\s*[:\-–]\s*/i, '');
  text = text.split('|')[0].trim();
  text = text.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[\s:\-–→➡️👉]+$/u, '').replace(/\s+/g, ' ').trim();
  if (text.length < 3) return null;
  return text.length > 80 ? `${text.slice(0, 77).trimEnd()}…` : text;
}

/** Quantos links diferentes a mensagem tem (para avisar quando passar do limite por mensagem). */
export function countLinks(text: string): number {
  return new Set((String(text || '').match(URL_RE) || []).map(u => u.replace(TRAILING, ''))).size;
}

/** Nome curto do link quando a pessoa não escreveu o nome do produto (ex.: "meli.la/2nXEGmW"). */
export function shortLinkName(url: string): string {
  try { const u = new URL(url); return `${u.hostname.replace(/^www\./, '')}${u.pathname}`.replace(/\/$/, '').slice(0, 40); }
  catch { return url.slice(0, 40); }
}

/** Links na ordem em que aparecem, sem repetidos, cada um com o texto da linha anterior (ou da mesma linha). */
export function extractLinks(text: string): FoundLink[] {
  const found: FoundLink[] = [];
  const seen = new Set<string>();
  let previousText = '';
  for (const line of String(text || '').split(/\r?\n/)) {
    const urls = line.match(URL_RE) || [];
    const sameLine = cleanLabel(line);
    if (!urls.length) {
      if (line.trim()) previousText = line;
      continue;
    }
    for (const raw of urls) {
      const url = raw.replace(TRAILING, '');
      if (seen.has(url)) continue;
      seen.add(url);
      found.push({ url, label: sameLine || cleanLabel(previousText) });
    }
    previousText = '';
    if (found.length >= MAX_LINKS_PER_MESSAGE) break;
  }
  return found.slice(0, MAX_LINKS_PER_MESSAGE);
}

export interface ConvertedLink { label: string | null; url: string; affiliateUrl?: string; error?: string }

/** Resposta curta, no estilo das mensagens dos grupos. Links que falharam nunca voltam como estavam. */
export function buildReply(results: ConvertedLink[], options: { extraLinksIgnored?: boolean } = {}): string {
  const ok = results.filter(r => r.affiliateUrl);
  const failed = results.filter(r => !r.affiliateUrl);
  const lines: string[] = [];
  if (ok.length) {
    lines.push(ok.length === 1 ? '✅ Aqui está o seu link:' : `✅ Aqui estão os seus ${ok.length} links:`);
    ok.forEach((r, i) => {
      lines.push('');
      const name = r.label || shortLinkName(r.url);
      lines.push(ok.length > 1 ? `*${i + 1}. ${name}*` : `*${name}*`);
      lines.push(r.affiliateUrl!);
    });
  }
  if (failed.length) {
    if (lines.length) lines.push('');
    lines.push(failed.length === 1 ? '⚠️ Não consegui preparar este link:' : '⚠️ Não consegui preparar estes links:');
    for (const r of failed) lines.push(`• ${r.label || shortLinkName(r.url)}: ${r.error || 'loja não suportada'}`);
  }
  if (options.extraLinksIgnored) {
    lines.push('');
    lines.push(`Preparei os ${MAX_LINKS_PER_MESSAGE} primeiros. Manda o resto em outra mensagem (até ${MAX_LINKS_PER_MESSAGE} por vez). 😉`);
  }
  return lines.join('\n');
}

export const HELP_TEXT = [
  'Oi! 👋 Me mande o link de um produto (Mercado Livre, Shopee, Amazon ou Netshoes)',
  'que eu te devolvo o link pronto para comprar.',
  '',
  'Pode mandar vários de uma vez, um por linha.',
].join('\n');

/** Mensagens do privado que o assistente pode responder (nunca grupos, status ou o próprio número). */
export function isPrivateChat(remoteJid: unknown): remoteJid is string {
  return typeof remoteJid === 'string' && /^\d{6,20}@(s\.whatsapp\.net|lid)$/.test(remoteJid);
}

/** Respostas curtas para mensagem sem link: responde ao que a pessoa disse e pede o link. */
export function replyWithoutLink(text: string): string {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (/\b(obrigad|valeu|vlw|brigad|agradec)/.test(t)) return 'De nada! Quando precisar, é só mandar outro link. 😉';
  if (/\b(tudo bem|td bem|tudo bom|td bom|como vai|como voce esta|blz|beleza)\b/.test(t)) return 'Tudo sim, e com você? 😊 Qual o link do produto que você quer?';
  if (/\bbom dia+/.test(t)) return 'Bom dia! ☀️ Me manda o link do produto que eu preparo pra você.';
  if (/\bboa tarde+/.test(t)) return 'Boa tarde! Me manda o link do produto que eu preparo pra você.';
  if (/\bboa noite+/.test(t)) return 'Boa noite! 🌙 Me manda o link do produto que eu preparo pra você.';
  if (/^(oi+|ola|opa|eai|e ai|hey|salve)\b/.test(t)) return 'Oi! 👋 Me manda o link do produto que eu preparo o seu link pra comprar.';
  if (/\b(cupom|desconto|promo)/.test(t)) return 'Me manda o link do produto que eu preparo o seu link pra comprar. Se houver cupom na oferta do grupo, ele vale no carrinho. 😉';
  return 'Me manda o link do produto que eu preparo o seu link pra comprar. 😉';
}

// ---------------------------------------------------------------- menu com números
export const MENU_TEXT = [
  'Oi! 👋 Sou o assistente do *Radar de Ofertas*. Responda com o número:',
  '',
  '1️⃣ Transformar o link de um produto no link pra comprar',
  '2️⃣ Ofertas de hoje do grupo',
  '3️⃣ Cupons de hoje',
  '4️⃣ Buscar um produto na Shopee',
  '',
  'Se preferir, me mande direto o link do produto. 😉',
].join('\n');

export const ASK_LINK_TEXT = 'Beleza! Me manda o link do produto (pode ser vários, um por linha) que eu preparo o seu link pra comprar. 🔗';
export const ASK_SEARCH_TEXT = 'O que você procura? Escreve o nome do produto, por exemplo: *air fryer 4 litros* 🔎';

export type MenuChoice = 'menu' | 'link' | 'ofertas' | 'cupons' | 'busca';

/** "1", "1️⃣", "opção 2", "menu", "0"… → escolha do menu; texto comum → null. */
export function parseMenuChoice(text: string): MenuChoice | null {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[⃣️]/g, '').trim();
  if (/^(menu|inicio|opcoes|0)$/.test(t)) return 'menu';
  const n = /^(?:opcao|op|numero|n)?\s*([1-4])\s*[.)!]?$/.exec(t)?.[1];
  return n === '1' ? 'link' : n === '2' ? 'ofertas' : n === '3' ? 'cupons' : n === '4' ? 'busca' : null;
}

export interface GroupOffer { title: string; price: string | null; coupon: string | null; link: string }

/** Lê título, preço, cupom e link de uma mensagem que o Copiador enviou aos grupos. */
export function parseGroupOffer(messageText: string, affiliateUrl?: string | null): GroupOffer | null {
  const text = String(messageText || '');
  const bold = [...text.matchAll(/\*([^*\n]{4,})\*/g)].map(m => m[1].trim());
  const title = bold.find(b => !/^(por\s|r\$|de\s|cupom|compre|oferta|radar)/i.test(b) && !/^[A-Z0-9]{4,20}$/.test(b));
  const price = /Por\s*R\$\s*([\d.]+,\d{2})/i.exec(text)?.[1] || null;
  const rawCoupon = /Cupom:\s*\*?([A-Z0-9][A-Z0-9_-]{2,30})\*?/i.exec(text)?.[1]?.toUpperCase() || null;
  // "ATIVE", "APLIQUE"… são instruções, não códigos.
  const coupon = rawCoupon && !/^(ATIVE|ATIVAR|ATIVO|APLIQUE|APLICAR|CLIQUE|ACESSE|PAGINA|ANUNCIO|PRODUTO|CARRINHO|APP|AQUI|LINK)$/.test(rawCoupon) ? rawCoupon : null;
  const urls = text.match(/https?:\/\/[^\s<>"'`]+/g) || [];
  const link = (affiliateUrl && /^https?:\/\//.test(affiliateUrl) ? affiliateUrl : urls[urls.length - 1] || '').replace(/[)\].,;:!?…*_~']+$/, '');
  if (!title || !link) return null;
  return { title: title.length > 70 ? `${title.slice(0, 67).trimEnd()}…` : title, price, coupon, link };
}

export function formatTodayOffers(offers: GroupOffer[]): string {
  if (!offers.length) return 'Hoje ainda não saiu oferta no grupo. Volta mais tarde ou me manda o link de um produto. 😉';
  const lines = ['🔥 *Ofertas de hoje do grupo:*'];
  offers.forEach((o, i) => { lines.push('', `*${i + 1}. ${o.title}*${o.price ? ` — R$ ${o.price}` : ''}`, o.link); });
  lines.push('', 'Digite *menu* para ver as opções.');
  return lines.join('\n');
}

export function formatTodayCoupons(offers: GroupOffer[]): string {
  const withCoupon = offers.filter(o => o.coupon);
  if (!withCoupon.length) return 'Hoje ainda não saiu oferta com cupom no grupo. Digite *2* para ver as ofertas de hoje. 😉';
  const lines = ['🎟️ *Cupons de hoje do grupo:*'];
  withCoupon.forEach((o, i) => { lines.push('', `*${i + 1}. ${o.title}*`, `Cupom: *${o.coupon}*${o.price ? ` · R$ ${o.price} com o cupom` : ''}`, o.link); });
  lines.push('', '⚠️ Cupom tem limite de uso e pode esgotar. Aplique no carrinho antes de pagar.');
  return lines.join('\n');
}

export interface SearchHit { title: string; price: number; rating: number | null; sold: number | null; link: string }

/** Só recomenda o que tem prova de qualidade (decisão do dono): nota ≥ 4,5 e ≥ 100 vendidos. */
export function trustedHits(hits: SearchHit[], limit = 3): SearchHit[] {
  return hits.filter(h => (h.rating || 0) >= 4.5 && (h.sold || 0) >= 100 && h.link)
    .sort((a, b) => a.price - b.price).slice(0, limit);
}

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const soldLabel = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil vendidos` : `${n} vendidos`);

export function formatSearch(query: string, hits: SearchHit[]): string {
  if (!hits.length) return `Não achei na Shopee uma opção confiável de *${query}* (nota 4,5+ e muitos vendidos). Tenta outro nome ou me manda o link do produto. 🔎`;
  const lines = [`🔎 *${query}* na Shopee (os mais baratos com boa nota):`];
  hits.forEach((h, i) => {
    lines.push('', `*${i + 1}. ${h.title.length > 70 ? `${h.title.slice(0, 67).trimEnd()}…` : h.title}*`,
      `R$ ${brl(h.price)} · ⭐ ${h.rating?.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} · ${soldLabel(h.sold || 0)}`, h.link);
  });
  lines.push('', 'Digite *4* para buscar outro produto ou *menu* para as opções.');
  return lines.join('\n');
}

// ---------------------------------------------------------------- resposta por link (foto + link + cupom)
/** Legenda de cada produto: só o link novo e o cupom (ou o aviso de que não achou). */
export function linkCaption(affiliateUrl: string, coupon?: string | null): string {
  return coupon
    ? `🔗 ${affiliateUrl}\n\n🎟️ Cupom: *${coupon}*: aplique no carrinho (pode esgotar)`
    : `🔗 ${affiliateUrl}\n\n🎟️ Não achei cupom para este produto agora.`;
}

/** Código que identifica o produto no endereço (para achar a mesma oferta nos grupos). */
export function productKey(cleanUrl?: string | null): string | null {
  const u = String(cleanUrl || '');
  return /\/(?:p|up)\/(MLBU?\d{6,})/i.exec(u)?.[1]?.toUpperCase()
    || /\b(MLB)-?(\d{6,})\b/i.exec(u)?.slice(1).join('').toUpperCase()
    || /\/product\/\d+\/(\d{5,})/.exec(u)?.[1]
    || /-i\.\d+\.(\d{5,})/.exec(u)?.[1]
    || /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i.exec(u)?.[1]?.toUpperCase()
    || /netshoes\.com\.br\/(?:p\/)?[^?#]*?([A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]{3})/i.exec(u)?.[1]?.toUpperCase()
    || null;
}
