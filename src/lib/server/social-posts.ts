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
export type SocialPostStatus = 'publicado' | 'falha' | 'incerto';

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
      p_price: candidate.priceCurrent, p_original: candidate.priceOriginal, p_discount: candidate.discountPct,
      p_coupon: candidate.coupon, p_affiliate: candidate.affiliateUrl,
    });
    if (error || !data) throw new Error('Não foi possível registrar a oferta. Confira se a migração 09 foi aplicada.');
    return mapOffer(Array.isArray(data) ? data[0] : data);
  }
  const local = readLocalSocial();
  const existing = local.offers.find(o => o.userId === userId && o.sourceJobId === jobId);
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

/** Ofertas já divulgadas nas redes (para a página da bio), mais recentes primeiro. */
export async function listPublishedOffers(userId: string, days = 7): Promise<SocialOffer[]> {
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  if (useDb()) {
    const { data } = await supabase!.from('social_offers').select('*').eq('user_id', userId).gte('created_at', since)
      .order('offer_number', { ascending: false }).limit(60);
    return (data || []).map(mapOffer);
  }
  return readLocalSocial().offers.filter(o => o.userId === userId && o.createdAt >= since).sort((a, b) => b.offerNumber - a.offerNumber);
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
      .eq('user_id', userId).in('status', ['publicado', 'incerto']).gte('created_at', since).order('created_at', { ascending: false }).limit(1);
    if (error) throw new Error('Não foi possível consultar a cota de publicações.');
    return { count: count || 0, lastAt: data?.[0]?.created_at || null };
  }
  const posts = readLocalSocial().posts.filter(p => p.userId === userId && p.status !== 'falha' && p.createdAt >= since)
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

export async function getSocialQuota(userId: string): Promise<{ limit: number | null; usedToday: number; allowed: boolean; reason?: string }> {
  const { count } = await postsToday(userId);
  let limit: number | null;
  if (userId === ADMIN_UUID) limit = null;
  else {
    const sub = await getUserSubscription(userId);
    limit = (PLANS_CONFIG[sub.effectivePlan] || PLANS_CONFIG.impulse).socialDailyPostLimit;
  }
  if (limit === 0) return { limit, usedToday: count, allowed: false, reason: 'O Instagram Pro está disponível a partir do plano Plus.' };
  if (limit !== null && count >= limit) {
    return { limit, usedToday: count, allowed: false, reason: `Limite diário do seu plano atingido (${count} de ${limit} publicações hoje). Ele renova à meia-noite.` };
  }
  return { limit, usedToday: count, allowed: true };
}
