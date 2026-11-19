import 'server-only';
import { createHash } from 'crypto';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { extractWhatsAppMessageText } from '@/lib/server/copier-service';
import {
  ASK_LINK_TEXT, ASK_SEARCH_TEXT, buildReply, extractLinks, formatSearch, formatTodayCoupons, formatTodayOffers, isPrivateChat,
  MAX_LINKS_PER_MESSAGE, MENU_TEXT, parseGroupOffer, parseMenuChoice, replyWithoutLink, trustedHits,
  type ConvertedLink, type GroupOffer, type SearchHit,
} from './link-message';
import { isAssistantOwner } from './access';

/*
 * Assistente WhatsApp v1: mensagens do privado com links → links de afiliado do dono da conta.
 * Fila própria (assistant_inbox), separada da fila do Copiador: uma conversão lenta nunca atrasa os grupos.
 */

/** Limite de links convertidos por contato por dia (protege a conta de afiliado e o número). */
export const DAILY_LINKS_PER_CONTACT = 40;
/** A explicação completa vai na primeira conversa (e de novo depois de 6 h); no meio, respostas curtas pedindo o link. */
const HELP_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** Trava contra loop (ex.: outro robô conversando): no máximo 8 respostas sem link por contato por hora. */
const MAX_NO_LINK_REPLIES_PER_HOUR = 8;
/** Mensagens mais antigas que isso (ex.: o WhatsApp reconectou e despejou o histórico) são ignoradas. */
const MAX_AGE_MS = 10 * 60 * 1000;

type Row = Record<string, any>;

function db() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Banco de dados não configurado.');
  return supabase;
}

export const contactHash = (connectionId: string, jid: string) =>
  createHash('sha256').update(`${connectionId}:${jid}`).digest('hex').slice(0, 32);

/** Assistente ligado nesta conexão? (sem a migração 17, sempre desligado) */
export async function assistantEnabled(connectionId: string): Promise<boolean> {
  try {
    const { data, error } = await db().from('assistant_settings').select('enabled').eq('connection_id', connectionId).maybeSingle();
    return !error && data?.enabled === true;
  } catch { return false; }
}

/**
 * Chamado pelo webhook (já autenticado) com as mensagens recebidas. Guarda só as do privado,
 * de outra pessoa, recentes e com texto, quando o assistente está ligado nesta conexão.
 */
export async function acceptAssistantMessages(connection: { id: string; user_id: string }, entries: any[]): Promise<number> {
  const candidates = entries.filter(entry => {
    const key = entry?.key;
    if (!key || key.fromMe || typeof key.id !== 'string' || !isPrivateChat(key.remoteJid)) return false;
    const ts = Number(entry.messageTimestamp || 0) * 1000;
    return !ts || Date.now() - ts <= MAX_AGE_MS;
  });
  if (!candidates.length || !isAssistantOwner(connection.user_id) || !(await assistantEnabled(String(connection.id)))) return 0;
  const rows = candidates
    .map(entry => ({ entry, text: extractWhatsAppMessageText(entry) }))
    .filter(({ text }) => text && text.trim())
    .map(({ entry, text }) => ({
      user_id: connection.user_id,
      connection_id: String(connection.id),
      message_id: entry.key.id,
      remote_jid: entry.key.remoteJid,
      contact_hash: contactHash(String(connection.id), entry.key.remoteJid),
      message_text: text.slice(0, 4000),
    }));
  if (!rows.length) return 0;
  // Mensagem repetida (o gateway reenviou) não entra de novo: conflito ignorado pela chave única.
  const { data, error } = await db().from('assistant_inbox').upsert(rows, { onConflict: 'connection_id,message_id', ignoreDuplicates: true }).select('id');
  if (error) { console.error('[Assistente] falha ao guardar mensagem:', error.message); return 0; }
  return data?.length || 0;
}

export interface AssistantDeps {
  convert: (userId: string, url: string) => Promise<{ affiliateUrl?: string; error?: string }>;
  send: (userId: string, connectionId: string, remoteJid: string, text: string) => Promise<void>;
  /** Ofertas que o Copiador enviou hoje aos grupos do cliente (mais recentes primeiro). */
  todayOffers?: (userId: string) => Promise<GroupOffer[]>;
  /** Busca ao vivo na Shopee pela API oficial de afiliado do cliente. */
  searchShopee?: (userId: string, query: string) => Promise<SearchHit[]>;
  now?: () => number;
}

/** Ofertas enviadas hoje (horário de Brasília) aos grupos, uma por oferta, mais recentes primeiro. */
async function defaultTodayOffers(userId: string): Promise<GroupOffer[]> {
  const start = new Date(Date.now() - 3 * 60 * 60 * 1000); start.setUTCHours(0, 0, 0, 0);
  const since = new Date(start.getTime() + 3 * 60 * 60 * 1000).toISOString();
  const { data } = await db().from('publication_jobs').select('message_text, affiliate_url, runtime_inbox_id, sent_at')
    .eq('user_id', userId).eq('status', 'enviado').gte('sent_at', since).order('sent_at', { ascending: false }).limit(300);
  const seen = new Set<string>();
  const offers: GroupOffer[] = [];
  for (const row of data || []) {
    const offer = parseGroupOffer(row.message_text || '', row.affiliate_url);
    if (!offer) continue;
    const key = row.runtime_inbox_id || offer.title;
    if (seen.has(key) || seen.has(offer.title)) continue;
    seen.add(key); seen.add(offer.title);
    offers.push(offer);
  }
  return offers;
}

async function defaultSearchShopee(userId: string, query: string): Promise<SearchHit[]> {
  const { runComparatorSearch } = await import('@/lib/server/comparator-search');
  const result = await runComparatorSearch({ query, userId });
  return result.offers.filter(o => o.store === 'shopee' && o.isAffiliateLinkVerified)
    .map(o => ({ title: o.title, price: o.price, rating: o.rating, sold: o.soldCount, link: o.affiliateUrl }));
}

/** Conversão real: o mesmo conversor e as mesmas contas de afiliado do Copiador. */
async function defaultConvert(userId: string, url: string): Promise<{ affiliateUrl?: string; error?: string }> {
  const { getStoreCredentialsMapWithSecrets } = await import('@/lib/server/credentials-vault');
  const { convertToAffiliateLink } = await import('@/lib/server/affiliate-converter');
  const creds = await getStoreCredentialsMapWithSecrets(userId);
  try {
    const result = await Promise.race([
      convertToAffiliateLink(url, creds),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('a loja demorou para responder')), 25_000)),
    ]);
    if (!result.store) return { error: 'loja não suportada (Mercado Livre, Shopee, Amazon ou Netshoes)' };
    // Mesmo critério do Copiador: só link confirmado da conta; nunca o link recebido de volta.
    if (!result.affiliateUrl || !result.isAutoDispatchAllowed || result.affiliateUrl === url) {
      return { error: 'não consegui confirmar o link de afiliado desta loja' };
    }
    return { affiliateUrl: result.affiliateUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return { error: /conect|configur|credenc|tag/i.test(message) ? 'loja ainda não conectada no painel' : message.slice(0, 120) || 'falha ao converter' };
  }
}

async function defaultSend(userId: string, connectionId: string, remoteJid: string, text: string): Promise<void> {
  const { copierConnection } = await import('@/lib/server/copier-group-catalog');
  const session = { userId, role: 'user' as const, email: '', createdAt: 0, expiresAt: 0 };
  const { connection } = await copierConnection(session, connectionId);
  const res = await fetch(`${connection.baseUrl.replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(connection.instanceName)}`, {
    method: 'POST',
    headers: { apikey: connection.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: remoteJid, text }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`O WhatsApp recusou a resposta (HTTP ${res.status}).`);
}

const defaults: AssistantDeps = { convert: defaultConvert, send: defaultSend, todayOffers: defaultTodayOffers, searchShopee: defaultSearchShopee };

/** O que o bot pediu por último a este contato (para entender a resposta seguinte), nos últimos 15 min. */
async function lastAsked(connectionId: string, hash: string, entryId: string, now: number): Promise<string | null> {
  const since = new Date(now - 15 * 60 * 1000).toISOString();
  const { data } = await db().from('assistant_inbox').select('kind').eq('connection_id', connectionId).eq('contact_hash', hash)
    .eq('status', 'done').neq('id', entryId).gte('received_at', since).order('received_at', { ascending: false }).limit(1);
  return data?.[0]?.kind || null;
}

async function linksToday(connectionId: string, hash: string, now: number): Promise<number> {
  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db().from('assistant_inbox').select('links_ok')
    .eq('connection_id', connectionId).eq('contact_hash', hash).eq('status', 'done').gte('received_at', since);
  return (data || []).reduce((sum: number, row: Row) => sum + (Number(row.links_ok) || 0), 0);
}

async function noLinkRepliesLastHour(connectionId: string, hash: string, now: number): Promise<number> {
  const since = new Date(now - 60 * 60 * 1000).toISOString();
  const { data } = await db().from('assistant_inbox').select('id')
    .eq('connection_id', connectionId).eq('contact_hash', hash).in('kind', ['ajuda', 'conversa', 'pediu_link', 'pediu_busca', 'ofertas', 'cupons', 'busca']).gte('received_at', since);
  return data?.length || 0;
}

async function recentlyHelped(connectionId: string, hash: string, now: number): Promise<boolean> {
  const since = new Date(now - HELP_COOLDOWN_MS).toISOString();
  const { data } = await db().from('assistant_inbox').select('id')
    .eq('connection_id', connectionId).eq('contact_hash', hash).eq('kind', 'ajuda').gte('received_at', since).limit(1);
  return Boolean(data?.length);
}

/** Processa uma mensagem já reservada. Nunca lança: o resultado fica no registro. */
export async function handleAssistantEntry(entry: Row, deps: AssistantDeps = defaults): Promise<Row> {
  const now = (deps.now || Date.now)();
  const links = extractLinks(entry.message_text || '');
  const finish = async (patch: Row) => {
    // Depois de responder, o número e o texto saem do banco (fica só o código embaralhado do contato).
    const final = { ...patch, remote_jid: null, message_text: null, processed_at: new Date(now).toISOString() };
    await db().from('assistant_inbox').update(final).eq('id', entry.id);
    return final;
  };
  try {
    if (!links.length) {
      const say = (text: string) => deps.send(entry.user_id, entry.connection_id, entry.remote_jid, text);
      if (await noLinkRepliesLastHour(entry.connection_id, entry.contact_hash, now) >= MAX_NO_LINK_REPLIES_PER_HOUR) {
        return finish({ status: 'ignored', kind: 'sem_link' });
      }
      const choice = parseMenuChoice(entry.message_text || '');
      if (choice === 'menu') { await say(MENU_TEXT); return finish({ status: 'done', kind: 'ajuda' }); }
      if (choice === 'link') { await say(ASK_LINK_TEXT); return finish({ status: 'done', kind: 'pediu_link' }); }
      if (choice === 'busca') { await say(ASK_SEARCH_TEXT); return finish({ status: 'done', kind: 'pediu_busca' }); }
      if (choice === 'ofertas' || choice === 'cupons') {
        const offers = deps.todayOffers ? await deps.todayOffers(entry.user_id) : [];
        await say(choice === 'ofertas' ? formatTodayOffers(offers.slice(0, 5)) : formatTodayCoupons(offers.filter(o => o.coupon).slice(0, 5)));
        return finish({ status: 'done', kind: choice });
      }
      // Resposta à pergunta "o que você procura?": busca ao vivo na Shopee.
      if (await lastAsked(entry.connection_id, entry.contact_hash, entry.id, now) === 'pediu_busca' && deps.searchShopee) {
        const query = String(entry.message_text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        await say(`Procurando *${query}* na Shopee… 🔎`);
        const hits = trustedHits(await deps.searchShopee(entry.user_id, query).catch(() => []));
        await say(formatSearch(query, hits));
        return finish({ status: 'done', kind: 'busca', links_total: hits.length, links_ok: hits.length });
      }
      if (!(await recentlyHelped(entry.connection_id, entry.contact_hash, now))) {
        await say(MENU_TEXT);
        return finish({ status: 'done', kind: 'ajuda' });
      }
      await say(`${replyWithoutLink(entry.message_text || '')}\n\nOu digite *menu* para ver as opções.`);
      return finish({ status: 'done', kind: 'conversa' });
    }
    const used = await linksToday(entry.connection_id, entry.contact_hash, now);
    if (used >= DAILY_LINKS_PER_CONTACT) {
      await deps.send(entry.user_id, entry.connection_id, entry.remote_jid,
        `Você já converteu ${DAILY_LINKS_PER_CONTACT} links hoje. Volte amanhã que eu preparo mais. 😉`);
      return finish({ status: 'done', kind: 'limite', links_total: links.length });
    }
    const allowed = links.slice(0, Math.min(MAX_LINKS_PER_MESSAGE, DAILY_LINKS_PER_CONTACT - used));
    const results: ConvertedLink[] = [];
    for (const link of allowed) {
      const converted = await deps.convert(entry.user_id, link.url).catch(error => ({ error: error instanceof Error ? error.message : 'falha ao converter' }));
      results.push({ label: link.label, url: link.url, ...converted });
    }
    const reply = buildReply(results, { extraLinksIgnored: allowed.length < links.length });
    await deps.send(entry.user_id, entry.connection_id, entry.remote_jid, reply);
    const ok = results.filter(r => r.affiliateUrl).length;
    const firstError = results.find(r => r.error)?.error || null;
    return finish({ status: 'done', kind: 'links', links_total: results.length, links_ok: ok, error: firstError });
  } catch (error) {
    const attempts = Number(entry.attempts || 0) + 1;
    const message = error instanceof Error ? error.message.slice(0, 300) : 'falha';
    if (attempts < 3) {
      await db().from('assistant_inbox').update({ status: 'pending', attempts, error: message }).eq('id', entry.id);
      return { status: 'pending', attempts, error: message };
    }
    return finish({ status: 'failed', attempts, error: message });
  }
}

/** Reserva e processa as mensagens pendentes (até o tempo acabar). */
export async function runAssistantCycle(options: { budgetMs?: number } = {}, deps: AssistantDeps = defaults): Promise<{ processed: number }> {
  if (!isSupabaseConfigured || !supabase) return { processed: 0 };
  const deadline = Date.now() + (options.budgetMs ?? 40_000);
  let processed = 0;
  while (Date.now() < deadline) {
    const { data: pending, error } = await db().from('assistant_inbox').select('*').eq('status', 'pending')
      .order('received_at', { ascending: true }).limit(1);
    if (error || !pending?.length) break;
    // Reserva atômica: só um processo pega a mensagem.
    const { data: claimed } = await db().from('assistant_inbox').update({ status: 'processing' })
      .eq('id', pending[0].id).eq('status', 'pending').select('*');
    if (!claimed?.length) continue;
    await handleAssistantEntry(claimed[0], deps);
    processed++;
  }
  // Reservas presas (função encerrada no meio) voltam para a fila depois de 5 min.
  await db().from('assistant_inbox').update({ status: 'pending' }).eq('status', 'processing')
    .lt('received_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());
  return { processed };
}
