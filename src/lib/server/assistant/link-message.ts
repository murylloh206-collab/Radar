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
      lines.push(ok.length > 1 ? `*${i + 1}. ${r.label || 'Produto'}*` : `*${r.label || 'Produto'}*`);
      lines.push(r.affiliateUrl!);
    });
  }
  if (failed.length) {
    if (lines.length) lines.push('');
    lines.push(failed.length === 1 ? '⚠️ Não consegui preparar este link:' : '⚠️ Não consegui preparar estes links:');
    for (const r of failed) lines.push(`• ${r.label || 'Produto'}: ${r.error || 'loja não suportada'}`);
  }
  if (options.extraLinksIgnored) {
    lines.push('');
    lines.push(`Mande no máximo ${MAX_LINKS_PER_MESSAGE} links por mensagem.`);
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
