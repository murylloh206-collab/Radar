import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { readDatabase } from './storage';
import { ADMIN_UUID } from './auth';
import { getUserSubscription } from './plan-guard';
import { PLANS_CONFIG } from '../plans-config';
import { startOfTodaySaoPaulo } from './daily-sent-counter';
import { extractOfferDetailsFromWhatsAppText, extractProductTitleFromFormattedMessage } from './copier-service';

/**
 * Instagram Pro / posts sociais: ofertas enviadas pelo copiador viram posts de story, feed e status do WhatsApp.
 * Tudo sempre escopado pelo userId da sessão (isolamento entre clientes).
 */

export type SocialChannel = 'instagram_story' | 'instagram_feed' | 'whatsapp_status';
export type SocialPostStatus = 'publicado' | 'falha' | 'incerto' | 'pendente';

export interface SocialOfferSnapshot {
  title?: string;
  imageUrl?: string | null;
  currentPrice?: number;
  originalPrice?: number | null;
  discountPct?: number | null;
  coupon?: string | null;
  store?: string;
}

export interface SocialOfferCandidate {
  jobId: string;
  title: string;
  imageUrl: string | null;
  priceCurrent: number;
  priceOriginal: number | null;
  discountPct: number | null;
  coupon: string | null;
  store: string | null;
  affiliateUrl: string;
  sentAt: string;
}

export interface SocialOffer extends Omit<SocialOfferCandidate, 'jobId' | 'sentAt'> {
  id: string;
  userId: string;
  offerNumber: number;
  sourceJobId: string | null;
  createdAt: string;
}

export interface SocialPostRecord {
  id: string;
  userId: string;
  socialOfferId: string;
  channel: SocialChannel;
  connectionId?: string | null;
  artUrl?: string | null;
  status: SocialPostStatus;
  error?: string | null;
  externalId?: string | null;
  origin: 'manual' | 'automatico';
  createdAt: string;
}

const ELIGIBLE_WINDOW_HOURS = 48;
/** Status que contam na cota e marcam a oferta como já divulgada (pendente = publicação em andamento ou interrompida). */
const COUNTED: SocialPostStatus[] = ['publicado', 'incerto', 'pendente'];

// ---------------------------------------------------------------- armazenamento local (dev/testes)
type LocalSocial = { offers: SocialOffer[]; posts: SocialPostRecord[]; settings: Record<string, unknown> };
function localFile() {
  return process.env.RADAR_DB_PATH ? `${process.env.RADAR_DB_PATH}.social.json` : path.join(process.cwd(), '.data', 'social.json');
}
export function readLocalSocial(): LocalSocial {
  try { return { offers: [], posts: [], settings: {}, ...JSON.parse(fs.readFileSync(localFile(), 'utf-8')) }; }
  catch { return { offers: [], posts: [], settings: {} }; }
}
export function writeLocalSocial(data: LocalSocial) {
  fs.mkdirSync(path.dirname(localFile()), { recursive: true });
  fs.writeFileSync(localFile(), JSON.stringify(data));
}
const useDb = () => Boolean(isSupabaseConfigured && supabase);

// ---------------------------------------------------------------- ofertas elegíveis
type JobLike = {
  id: string; status?: string; originType?: string; sentAt?: string | null; affiliateUrl?: string | null;
  mediaUrl?: string | null; messageText?: string | null; socialOffer?: SocialOfferSnapshot | null; userId?: string;
};

const brl = (raw?: string) => (raw ? Number(raw.replace(/\./g, '').replace(',', '.')) : 0);

/** Lê preços do texto que o próprio copiador montou ("De: ~R$ 199,90~" / "Por R$ 99,90"). */
export function parseFormattedPrices(text: string): { current: number; original: number } {
  const clean = (text || '').replace(/[*_~]/g, '');
  const current = /(?:^|[^a-z])por\s*(?:apenas\s*)?:?\s*R\$\s*(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})/i.exec(clean)?.[1];
  const original = /(?:^|[^a-z])de\s*:?\s*R\$\s*(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})/i.exec(clean)?.[1];
  return { current: brl(current), original: brl(original) };
}

export function toCandidate(job: JobLike): SocialOfferCandidate | null {
  if (!job.affiliateUrl || !job.sentAt) return null;
  const snap = job.socialOffer || {};
  const parsed = extractOfferDetailsFromWhatsAppText(job.messageText || '', snap.store || '');
  const title = (snap.title || extractProductTitleFromFormattedMessage(job.messageText) || parsed.title || '').trim();
  const formatted = parseFormattedPrices(job.messageText || '');
  const current = Number(snap.currentPrice || formatted.current || parsed.currentPrice || 0);
  if (!title || !(current > 0)) return null;
  const original = Number(snap.originalPrice || formatted.original || parsed.originalPrice || 0) || null;
  const discount = snap.discountPct ?? parsed.discountPct ?? (original && original > current ? Math.round((1 - current / original) * 100) : null);
  return {
    jobId: job.id, title, imageUrl: snap.imageUrl || job.mediaUrl || null, priceCurrent: current,
    priceOriginal: original && original > current ? original : null, discountPct: discount || null,
    coupon: (snap.coupon ?? parsed.couponCode) || null, store: snap.store || null,
    affiliateUrl: job.affiliateUrl, sentAt: job.sentAt,
  };
}

async function recentCopierJobs(userId: string): Promise<JobLike[]> {
  const since = new Date(Date.now() - ELIGIBLE_WINDOW_HOURS * 3600e3).toISOString();
  if (useDb()) {
    const { data, error } = await supabase!.from('publication_jobs')
      .select('id,status,origin_type,sent_at,affiliate_url,media_url,message_text,runtime_payload')
      .eq('user_id', userId).eq('origin_type', 'copiador').eq('status', 'enviado').gte('sent_at', since)
      .order('sent_at', { ascending: false }).limit(120);
    if (error) throw new Error('Não foi possível carregar as ofertas enviadas.');
    return (data || []).map(row => ({ id: row.id, status: row.status, originType: row.origin_type, sentAt: row.sent_at,
      affiliateUrl: row.affiliate_url, mediaUrl: row.media_url, messageText: row.message_text,
      socialOffer: row.runtime_payload?.socialOffer || null }));
  }
  return (readDatabase().jobs || [])
    .filter(j => j.userId === userId && j.originType === 'copiador' && j.status === 'enviado' && j.sentAt && j.sentAt >= since)
    .sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt))) as JobLike[];
}

/** Ofertas que o copiador enviou nas últimas 48h (uma por oferta, mesmo se foi para vários grupos). */
export async function listEligibleOffers(userId: string): Promise<SocialOfferCandidate[]> {
  const seen = new Set<string>();
  const result: SocialOfferCandidate[] = [];
  for (const job of await recentCopierJobs(userId)) {
    const candidate = toCandidate(job);
    if (!candidate || seen.has(candidate.affiliateUrl)) continue;
    seen.add(candidate.affiliateUrl);
    result.push(candidate);
  }
  return result;
}

async function findOwnJob(userId: string, jobId: string): Promise<JobLike | null> {
  if (useDb()) {
    const { data } = await supabase!.from('publication_jobs')
      .select('id,status,origin_type,sent_at,affiliate_url,media_url,message_text,runtime_payload')
      .eq('user_id', userId).eq('id', jobId).maybeSingle();
    return data ? { id: data.id, status: data.status, originType: data.origin_type, sentAt: data.sent_at, affiliateUrl: data.affiliate_url,
      mediaUrl: data.media_url, messageText: data.message_text, socialOffer: data.runtime_payload?.socialOffer || null } : null;
  }
  return ((readDatabase().jobs || []).find(j => j.userId === userId && j.id === jobId) as JobLike) || null;
}

const mapOffer = (row: Record<string, any>): SocialOffer => ({
  id: row.id, userId: row.user_id, offerNumber: row.offer_number, sourceJobId: row.source_job_id, title: row.title,
  store: row.store, imageUrl: row.image_url, priceCurrent: Number(row.price_current), priceOriginal: row.price_original ? Number(row.price_original) : null,
  discountPct: row.discount_pct, coupon: row.coupon, affiliateUrl: row.affiliate_url, createdAt: row.created_at,
});

/** Registra a oferta (uma vez) e devolve o número dela para este cliente. */
export async function ensureSocialOffer(userId: string, jobId: string): Promise<SocialOffer> {
  const job = await findOwnJob(userId, jobId);
  const candidate = job && job.status === 'enviado' ? toCandidate(job) : null;
  if (!candidate) throw new Error('Oferta não encontrada entre as enviadas por esta conta.');
  if (useDb()) {
    const { data, error } = await supabase!.rpc('social_next_offer_number', {
      p_user: userId, p_job: jobId, p_title: candidate.title, p_store: candidate.store, p_image: candidate.imageUrl,
      p_price: candidate.priceCurrent, p_original: candidate.priceOriginal, p_discount: candidate.discountPct === null ? null : Math.round(candidate.discountPct),
      p_coupon: candidate.coupon, p_affiliate: candidate.affiliateUrl,
    });
    if (error || !data) throw new Error('Não foi possível registrar a oferta. Confira se a migração 09 foi aplicada.');
    return mapOffer(Array.isArray(data) ? data[0] : data);
  }
  const local = readLocalSocial();
  const existing = local.offers.find(o => o.userId === userId && (o.sourceJobId === jobId || o.affiliateUrl === candidate.affiliateUrl));
  if (existing) return existing;
  const offerNumber = Math.max(0, ...local.offers.filter(o => o.userId === userId).map(o => o.offerNumber)) + 1;
  const { jobId: _job, sentAt: _sent, ...rest } = candidate;
  const offer: SocialOffer = { ...rest, id: randomUUID(), userId, offerNumber, sourceJobId: jobId, createdAt: new Date().toISOString() };
  local.offers.push(offer);
  writeLocalSocial(local);
  return offer;
}

export async function getSocialOffer(userId: string, socialOfferId: string): Promise<SocialOffer | null> {
  if (useDb()) {
    const { data } = await supabase!.from('social_offers').select('*').eq('user_id', userId).eq('id', socialOfferId).maybeSingle();
    return data ? mapOffer(data) : null;
  }
  return readLocalSocial().offers.find(o => o.userId === userId && o.id === socialOfferId) || null;
}

/** Ofertas já divulgadas com sucesso nas redes (para a página da bio), mais recentes primeiro. */
export async function listPublishedOffers(userId: string, days = 7): Promise<SocialOffer[]> {
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  if (useDb()) {
    const { data } = await supabase!.from('social_offers').select('*, social_posts!inner(status)').eq('user_id', userId)
      .in('social_posts.status', ['publicado', 'incerto']).gte('created_at', since)
      .order('offer_number', { ascending: false }).limit(60);
    return (data || []).map(mapOffer);
  }
  const local = readLocalSocial();
  const posted = new Set(local.posts.filter(p => p.userId === userId && p.status !== 'falha').map(p => p.socialOfferId));
  return local.offers.filter(o => o.userId === userId && o.createdAt >= since && posted.has(o.id)).sort((a, b) => b.offerNumber - a.offerNumber);
}

export interface BioOffer {
  offerNumber: number;
  title: string;
  imageUrl: string | null;
  priceCurrent: number;
  priceOriginal: number | null;
  coupon: string | null;
  href: string;
  stale: boolean;
}

/** Link rastreado (/r/...) para o link de afiliado do próprio cliente. */
function trackedHref(affiliateUrl: string, title: string, store: string | null, offerNumber: number): string {
  const encoded = Buffer.from(affiliateUrl.trim(), 'utf8').toString('base64url');
  const qs = new URLSearchParams({ src: 'bio', title: title.slice(0, 100), n: String(offerNumber) });
  if (store) qs.set('store', store);
  return `/r/${encoded}?${qs.toString()}`;
}

export async function getBioOffers(userId: string, highlightNumber?: number | null): Promise<{ offers: BioOffer[]; highlighted: BioOffer | null; notFoundNumber: number | null }> {
  const staleBefore = Date.now() - ELIGIBLE_WINDOW_HOURS * 3600e3;
  const offers: BioOffer[] = (await listPublishedOffers(userId)).map(o => ({
    offerNumber: o.offerNumber, title: o.title, imageUrl: o.imageUrl, priceCurrent: o.priceCurrent, priceOriginal: o.priceOriginal,
    coupon: o.coupon, href: trackedHref(o.affiliateUrl, o.title, o.store, o.offerNumber), stale: Date.parse(o.createdAt) < staleBefore,
  }));
  const wanted = highlightNumber && Number.isInteger(highlightNumber) && highlightNumber > 0 ? highlightNumber : null;
  const highlighted = wanted ? offers.find(o => o.offerNumber === wanted) || null : null;
  return { offers, highlighted, notFoundNumber: wanted && !highlighted ? wanted : null };
}

// ---------------------------------------------------------------- posts e cota
export async function recordSocialPost(userId: string, post: Omit<SocialPostRecord, 'id' | 'userId' | 'createdAt'>): Promise<SocialPostRecord> {
  const record: SocialPostRecord = { ...post, id: randomUUID(), userId, createdAt: new Date().toISOString() };
  if (useDb()) {
    const { error } = await supabase!.from('social_posts').insert({
      id: record.id, user_id: userId, social_offer_id: post.socialOfferId, channel: post.channel, connection_id: post.connectionId || null,
      art_url: post.artUrl || null, status: post.status, error: post.error || null, external_id: post.externalId || null, origin: post.origin,
    });
    if (error) throw new Error('Não foi possível registrar a publicação.');
    return record;
  }
  const local = readLocalSocial();
  local.posts.push(record);
  writeLocalSocial(local);
  return record;
}

/** Publicações que contam na cota hoje (publicadas ou com resultado incerto) e a última publicação. */
async function postsToday(userId: string): Promise<{ count: number; lastAt: string | null }> {
  const since = startOfTodaySaoPaulo().toISOString();
  if (useDb()) {
    const { data, count, error } = await supabase!.from('social_posts').select('created_at', { count: 'exact' })
      .eq('user_id', userId).in('status', COUNTED).gte('created_at', since).order('created_at', { ascending: false }).limit(1);
    if (error) throw new Error('Não foi possível consultar a cota de publicações.');
    return { count: count || 0, lastAt: data?.[0]?.created_at || null };
  }
  const posts = readLocalSocial().posts.filter(p => p.userId === userId && COUNTED.includes(p.status) && p.createdAt >= since)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { count: posts.length, lastAt: posts[0]?.createdAt || null };
}

export async function lastSocialPostAt(userId: string): Promise<string | null> {
  if (useDb()) {
    const { data } = await supabase!.from('social_posts').select('created_at').eq('user_id', userId)
      .in('status', ['publicado', 'incerto']).order('created_at', { ascending: false }).limit(1);
    return data?.[0]?.created_at || null;
  }
  const posts = readLocalSocial().posts.filter(p => p.userId === userId && p.status !== 'falha').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return posts[0]?.createdAt || null;
}

let localLock: Promise<unknown> = Promise.resolve();
function withLocalLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = localLock.then(fn, fn);
  localLock = run.catch(() => undefined);
  return run;
}

async function quotaLimit(userId: string): Promise<number | null> {
  if (userId === ADMIN_UUID) return null;
  const sub = await getUserSubscription(userId);
  return (PLANS_CONFIG[sub.effectivePlan] || PLANS_CONFIG.impulse).socialDailyPostLimit;
}

/** Reserva uma vaga na cota de forma atômica (registro 'pendente'). Retorna null se o limite do dia acabou. */
export async function reserveSocialPost(userId: string, post: { socialOfferId: string; channel: SocialChannel; origin: 'manual' | 'automatico' }): Promise<string | null> {
  const limit = await quotaLimit(userId);
  if (limit === 0) return null;
  const since = startOfTodaySaoPaulo().toISOString();
  if (useDb()) {
    const { data, error } = await supabase!.rpc('social_reserve_post', {
      p_user: userId, p_offer: post.socialOfferId, p_channel: post.channel, p_origin: post.origin, p_limit: limit, p_since: since,
    });
    if (error) throw new Error('Não foi possível reservar a publicação. Confira se a migração 09 foi aplicada.');
    return data ? String(data) : null;
  }
  return withLocalLock(async () => {
    const local = readLocalSocial();
    const used = local.posts.filter(p => p.userId === userId && COUNTED.includes(p.status) && p.createdAt >= since).length;
    if (limit !== null && used >= limit) return null;
    const record: SocialPostRecord = { id: randomUUID(), userId, socialOfferId: post.socialOfferId, channel: post.channel, status: 'pendente', origin: post.origin, createdAt: new Date().toISOString() };
    local.posts.push(record);
    writeLocalSocial(local);
    return record.id;
  });
}

export async function finalizeSocialPost(userId: string, postId: string, result: { status: Exclude<SocialPostStatus, 'pendente'>; artUrl?: string | null; error?: string | null; externalId?: string | null; connectionId?: string | null }) {
  if (useDb()) {
    await supabase!.from('social_posts').update({ status: result.status, art_url: result.artUrl || null, error: result.error || null,
      external_id: result.externalId || null, connection_id: result.connectionId || null }).eq('id', postId).eq('user_id', userId);
    return;
  }
  await withLocalLock(async () => {
    const local = readLocalSocial();
    const post = local.posts.find(p => p.id === postId && p.userId === userId);
    if (post) Object.assign(post, { status: result.status, artUrl: result.artUrl || null, error: result.error || null, externalId: result.externalId || null, connectionId: result.connectionId || null });
    writeLocalSocial(local);
  });
}

export async function getSocialQuota(userId: string): Promise<{ limit: number | null; usedToday: number; allowed: boolean; reason?: string }> {
  const { count } = await postsToday(userId);
  const limit = await quotaLimit(userId);
  if (limit === 0) return { limit, usedToday: count, allowed: false, reason: 'O Instagram Pro está disponível a partir do plano Plus.' };
  if (limit !== null && count >= limit) {
    return { limit, usedToday: count, allowed: false, reason: `Limite diário do seu plano atingido (${count} de ${limit} publicações hoje). Ele renova à meia-noite.` };
  }
  return { limit, usedToday: count, allowed: true };
}

// ---------------------------------------------------------------- arte, envio e publicação
async function uploadArt(userId: string, buffer: Buffer): Promise<string> {
  const fileName = `${Date.now()}_${randomUUID().slice(0, 8)}.jpg`;
  if (useDb()) {
    const storagePath = `${userId}/social/${fileName}`;
    const { error } = await supabase!.storage.from('radar-media').upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });
    if (!error) {
      const { data } = supabase!.storage.from('radar-media').getPublicUrl(storagePath);
      if (data?.publicUrl) return data.publicUrl;
    }
  }
  const dir = path.join(process.cwd(), 'public', 'generated-media', userId, 'social');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), buffer);
  const root = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  return `${root}/generated-media/${encodeURIComponent(userId)}/social/${fileName}`;
}

const money = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildSocialCaption(offer: SocialOffer, channel: SocialChannel, handle?: string): string {
  const lines = [offer.title, ''];
  lines.push(offer.priceOriginal ? `💰 De R$ ${money(offer.priceOriginal)} por R$ ${money(offer.priceCurrent)}` : `💰 R$ ${money(offer.priceCurrent)}`);
  if (offer.coupon) lines.push(`🎟️ Cupom: ${offer.coupon}`);
  lines.push('');
  if (channel === 'whatsapp_status') lines.push(`🛒 Oferta #${offer.offerNumber}: ${offer.affiliateUrl}`);
  else lines.push(`🔗 Oferta #${offer.offerNumber} — link na bio${handle ? ` (${handle})` : ''}`);
  return lines.join('\n');
}

export class SocialPublishError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function sendWhatsAppStatus(userId: string, connectionId: string | undefined, artUrl: string, caption: string) {
  const { copierConnection } = await import('./copier-group-catalog');
  const session = { userId, role: 'user' as const, email: '', createdAt: 0, expiresAt: 0 };
  const { connection } = await copierConnection(session, connectionId);
  const response = await fetch(`${connection.baseUrl.replace(/\/+$/, '')}/message/sendStatus/${encodeURIComponent(connection.instanceName)}`, {
    method: 'POST',
    headers: { apikey: connection.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'image', content: artUrl, caption, allContacts: true }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    return { status: 'falha' as const, connectionId: connection.id, error: `O WhatsApp recusou o status (HTTP ${response.status}).` };
  }
  const data = await response.json().catch(() => null) as { key?: { id?: string } } | null;
  return data?.key?.id
    ? { status: 'publicado' as const, connectionId: connection.id, externalId: data.key.id }
    : { status: 'incerto' as const, connectionId: connection.id, error: 'O gateway não confirmou o envio do status.' };
}

/** Gera a arte com a marca do cliente e publica no canal escolhido. Nunca usa dados de outro cliente. */
export async function publishSocialPost(userId: string, request: { jobId: string; channel: SocialChannel; connectionId?: string; origin?: 'manual' | 'automatico' }) {
  if (!['instagram_story', 'instagram_feed', 'whatsapp_status'].includes(request.channel)) {
    throw new SocialPublishError('Canal de publicação inválido.', 400);
  }
  const quota = await getSocialQuota(userId);
  if (!quota.allowed) throw new SocialPublishError(quota.reason || 'Publicação não permitida.', quota.limit === 0 ? 403 : 429);

  let offer: SocialOffer;
  try { offer = await ensureSocialOffer(userId, request.jobId); }
  catch (error) { throw new SocialPublishError(error instanceof Error ? error.message : 'Oferta não encontrada.', 404); }
  if (!offer.imageUrl) throw new SocialPublishError('Esta oferta não tem foto do produto para gerar a arte.', 422);

  const postId = await reserveSocialPost(userId, { socialOfferId: offer.id, channel: request.channel, origin: request.origin || 'manual' });
  if (!postId) {
    const latest = await getSocialQuota(userId);
    throw new SocialPublishError(latest.reason || 'Limite diário do seu plano atingido.', latest.limit === 0 ? 403 : 429);
  }

  let artUrl: string | null = null;
  let result: { status: Exclude<SocialPostStatus, 'pendente'>; connectionId?: string; externalId?: string; error?: string };
  try {
    const { renderBrandedOfferArt } = await import('./offer-art/branded');
    const { getBrandSettings } = await import('./brand-settings');
    const art = await renderBrandedOfferArt(userId, {
      format: request.channel === 'instagram_feed' ? 'feed' : 'story',
      title: offer.title, imagePathOrUrl: offer.imageUrl, priceCurrent: offer.priceCurrent, priceOriginal: offer.priceOriginal,
      discountPct: offer.discountPct, coupon: offer.coupon || undefined, offerNumber: offer.offerNumber,
    });
    artUrl = await uploadArt(userId, art);
    const brand = await getBrandSettings(userId);
    const caption = buildSocialCaption(offer, request.channel, brand.watermarkHandle);
    if (request.channel === 'whatsapp_status') {
      try { result = await sendWhatsAppStatus(userId, request.connectionId, artUrl, caption); }
      catch (error) { result = { status: 'falha', error: error instanceof Error ? error.message : 'Falha ao enviar o status.' }; }
    } else {
      const meta = await import('./meta-graph-service');
      const published = request.channel === 'instagram_story'
        ? await meta.publishStoryToInstagram(userId, { imageUrl: artUrl })
        : await meta.publishFeedPostToInstagram(userId, { imageUrl: artUrl, caption });
      result = published.ok ? { status: 'publicado', externalId: published.mediaId } : { status: 'falha', error: published.error || 'O Instagram recusou a publicação.' };
    }
  } catch (error) {
    result = { status: 'falha', error: error instanceof Error ? error.message : 'Não foi possível gerar a arte.' };
  }

  await finalizeSocialPost(userId, postId, { ...result, artUrl, connectionId: result.connectionId || null });
  const post: SocialPostRecord = { id: postId, userId, socialOfferId: offer.id, channel: request.channel, connectionId: result.connectionId || null,
    artUrl, status: result.status, error: result.error || null, externalId: result.externalId || null, origin: request.origin || 'manual', createdAt: new Date().toISOString() };
  return { offer, post, artUrl };
}

// ---------------------------------------------------------------- prévia e configurações do automático
export async function previewSocialArt(userId: string, request: { jobId: string; format: 'story' | 'feed' }): Promise<Buffer> {
  const job = await findOwnJob(userId, request.jobId);
  const candidate = job && job.status === 'enviado' ? toCandidate(job) : null;
  if (!candidate) throw new SocialPublishError('Oferta não encontrada entre as enviadas por esta conta.', 404);
  if (!candidate.imageUrl) throw new SocialPublishError('Esta oferta não tem foto do produto para gerar a arte.', 422);
  const existing = useDb()
    ? (await supabase!.from('social_offers').select('offer_number').eq('user_id', userId).eq('source_job_id', request.jobId).maybeSingle()).data?.offer_number
    : readLocalSocial().offers.find(o => o.userId === userId && o.sourceJobId === request.jobId)?.offerNumber;
  const { renderBrandedOfferArt } = await import('./offer-art/branded');
  return renderBrandedOfferArt(userId, {
    format: request.format, title: candidate.title, imagePathOrUrl: candidate.imageUrl, priceCurrent: candidate.priceCurrent,
    priceOriginal: candidate.priceOriginal, discountPct: candidate.discountPct, coupon: candidate.coupon || undefined,
    offerNumber: existing || undefined,
  });
}

export interface AutopostSettings {
  enabled: boolean;
  channels: SocialChannel[];
  minIntervalMinutes: number;
  windowStart: string;
  windowEnd: string;
  minDiscountPct: number;
  connectionId: string | null;
}

export const DEFAULT_AUTOPOST: AutopostSettings = {
  enabled: false, channels: ['instagram_story'], minIntervalMinutes: 60, windowStart: '09:00', windowEnd: '22:00', minDiscountPct: 30, connectionId: null,
};

export function normalizeAutopost(input: Partial<AutopostSettings>, base: AutopostSettings = DEFAULT_AUTOPOST): AutopostSettings {
  const time = (value: unknown, fallback: string) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
  const channels = Array.isArray(input.channels)
    ? input.channels.filter((c): c is SocialChannel => ['instagram_story', 'instagram_feed', 'whatsapp_status'].includes(String(c)))
    : base.channels;
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : base.enabled,
    channels: channels.length ? Array.from(new Set(channels)) : base.channels,
    minIntervalMinutes: Number.isFinite(input.minIntervalMinutes) ? Math.min(1440, Math.max(15, Math.round(Number(input.minIntervalMinutes)))) : base.minIntervalMinutes,
    windowStart: time(input.windowStart, base.windowStart),
    windowEnd: time(input.windowEnd, base.windowEnd),
    minDiscountPct: Number.isFinite(input.minDiscountPct) ? Math.min(95, Math.max(0, Math.round(Number(input.minDiscountPct)))) : base.minDiscountPct,
    connectionId: input.connectionId === null || typeof input.connectionId === 'string' ? (input.connectionId || null) : base.connectionId,
  };
}

export async function getAutopostSettings(userId: string): Promise<AutopostSettings> {
  if (useDb()) {
    const { data } = await supabase!.from('social_autopost_settings').select('*').eq('user_id', userId).maybeSingle();
    if (!data) return { ...DEFAULT_AUTOPOST };
    return normalizeAutopost({ enabled: data.enabled, channels: data.channels, minIntervalMinutes: data.min_interval_minutes,
      windowStart: data.window_start, windowEnd: data.window_end, minDiscountPct: data.min_discount_pct, connectionId: data.connection_id });
  }
  return normalizeAutopost((readLocalSocial().settings[userId] as Partial<AutopostSettings>) || {});
}

export async function saveAutopostSettings(userId: string, partial: Partial<AutopostSettings>): Promise<AutopostSettings> {
  const next = normalizeAutopost(partial, await getAutopostSettings(userId));
  if (useDb()) {
    const { error } = await supabase!.from('social_autopost_settings').upsert({
      user_id: userId, enabled: next.enabled, channels: next.channels, min_interval_minutes: next.minIntervalMinutes,
      window_start: next.windowStart, window_end: next.windowEnd, min_discount_pct: next.minDiscountPct,
      connection_id: next.connectionId, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw new Error('Não foi possível salvar as configurações. Confira se a migração 09 foi aplicada.');
    return next;
  }
  const local = readLocalSocial();
  local.settings[userId] = next;
  writeLocalSocial(local);
  return next;
}

// ---------------------------------------------------------------- automático com freio
function minuteOfDaySaoPaulo(now: Date): number {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(now).split(':').map(Number);
  return h * 60 + m;
}
function insideWindow(now: Date, start: string, end: string): boolean {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const [s, e, n] = [toMin(start), toMin(end), minuteOfDaySaoPaulo(now)];
  return s === e || (s < e ? n >= s && n <= e : n >= s || n <= e);
}

async function usersWithAutopost(): Promise<Array<{ userId: string; settings: AutopostSettings }>> {
  if (useDb()) {
    const { data } = await supabase!.from('social_autopost_settings').select('user_id').eq('enabled', true).limit(500);
    return Promise.all((data || []).map(async row => ({ userId: String(row.user_id), settings: await getAutopostSettings(String(row.user_id)) })));
  }
  const local = readLocalSocial();
  return Object.keys(local.settings).map(userId => ({ userId, settings: normalizeAutopost(local.settings[userId] as Partial<AutopostSettings>) }))
    .filter(entry => entry.settings.enabled);
}

/** Histórico recente do automático por oferta (link de afiliado): já divulgadas e com falhas repetidas. */
async function socialHistory(userId: string): Promise<{ posted: Set<string>; failedTwice: Set<string>; lastAttemptAt: string | null }> {
  const since = new Date(Date.now() - ELIGIBLE_WINDOW_HOURS * 3600e3).toISOString();
  let rows: Array<{ affiliate: string; status: SocialPostStatus; createdAt: string }> = [];
  if (useDb()) {
    const { data } = await supabase!.from('social_posts').select('status, created_at, social_offers!inner(affiliate_url)')
      .eq('user_id', userId).gte('created_at', since).order('created_at', { ascending: false }).limit(500);
    rows = (data || []).map((row: any) => ({ affiliate: String(row.social_offers?.affiliate_url || ''), status: row.status, createdAt: row.created_at }));
  } else {
    const local = readLocalSocial();
    const offers = new Map(local.offers.filter(o => o.userId === userId).map(o => [o.id, o.affiliateUrl]));
    rows = local.posts.filter(p => p.userId === userId && p.createdAt >= since)
      .map(p => ({ affiliate: offers.get(p.socialOfferId) || '', status: p.status, createdAt: p.createdAt }))
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  }
  const posted = new Set(rows.filter(r => COUNTED.includes(r.status)).map(r => r.affiliate));
  const failures = new Map<string, number>();
  for (const r of rows) if (r.status === 'falha') failures.set(r.affiliate, (failures.get(r.affiliate) || 0) + 1);
  return { posted, failedTwice: new Set([...failures].filter(([, n]) => n >= 2).map(([a]) => a)), lastAttemptAt: rows[0]?.createdAt || null };
}

/**
 * Publica no máximo UMA oferta por cliente por execução, respeitando horário, intervalo mínimo,
 * desconto mínimo e a cota do plano. Erros de um cliente nunca afetam os demais nem o copiador.
 */
/** Tempo mínimo livre para começar uma publicação (arte + envio) sem estourar o limite da função. */
const PUBLISH_TIME_NEEDED_MS = 35000;

export async function runSocialAutopostCycle(options: { budgetMs?: number; deadlineAt?: number } = {}): Promise<{ checked: number; published: number; errors: number }> {
  const hardDeadline = options.deadlineAt ?? Date.now() + 60000;
  const deadline = Math.min(Date.now() + (options.budgetMs ?? 15000), hardDeadline);
  const canStartPublish = () => Date.now() + PUBLISH_TIME_NEEDED_MS <= hardDeadline;
  const report = { checked: 0, published: 0, errors: 0 };
  let entries: Array<{ userId: string; settings: AutopostSettings }> = [];
  try { entries = await usersWithAutopost(); } catch { return report; }
  for (const { userId, settings } of entries) {
    if (Date.now() > deadline || !canStartPublish()) break;
    report.checked++;
    try {
      const now = new Date();
      if (!insideWindow(now, settings.windowStart, settings.windowEnd)) continue;
      // o intervalo conta qualquer tentativa (inclusive falha): nada de repetir em rajada
      const history = await socialHistory(userId);
      if (history.lastAttemptAt && Date.now() - Date.parse(history.lastAttemptAt) < settings.minIntervalMinutes * 60e3) continue;
      if (!(await getSocialQuota(userId)).allowed) continue;
      const offer = (await listEligibleOffers(userId))
        .filter(o => !history.posted.has(o.affiliateUrl) && !history.failedTwice.has(o.affiliateUrl) && o.imageUrl && (o.discountPct || 0) >= settings.minDiscountPct)
        .sort((a, b) => (b.discountPct || 0) - (a.discountPct || 0) || b.sentAt.localeCompare(a.sentAt))[0];
      if (!offer) continue;
      let publishedAny = false;
      for (const channel of settings.channels) {
        if (!canStartPublish() || !(await getSocialQuota(userId)).allowed) break;
        try {
          const result = await publishSocialPost(userId, { jobId: offer.jobId, channel, connectionId: settings.connectionId || undefined, origin: 'automatico' });
          if (result.post.status !== 'falha') publishedAny = true; else report.errors++;
        } catch { report.errors++; }
      }
      if (publishedAny) report.published++;
    } catch { report.errors++; }
  }
  return report;
}
