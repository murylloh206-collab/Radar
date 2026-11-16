import 'server-only';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { readDatabase } from './storage';

const SAO_PAULO = 'America/Sao_Paulo';

/** Meia-noite de hoje no fuso de Brasília, como instante absoluto. */
export function startOfTodaySaoPaulo(now: Date = new Date()): Date {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: SAO_PAULO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  const wallAtUtcMidnight = new Date(utcMidnight.toLocaleString('en-US', { timeZone: SAO_PAULO }));
  const utcAtUtcMidnight = new Date(utcMidnight.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(utcMidnight.getTime() + (utcAtUtcMidnight.getTime() - wallAtUtcMidnight.getTime()));
}

/** Regra única de "enviado hoje": status enviado e sent_at desde a meia-noite de Brasília. */
export function isSentToday(job: { status?: string; sentAt?: string | null }, now: Date = new Date()): boolean {
  if (job.status !== 'enviado' || !job.sentAt) return false;
  const sent = Date.parse(job.sentAt);
  return !Number.isNaN(sent) && sent >= startOfTodaySaoPaulo(now).getTime() && sent <= now.getTime();
}

/** Uma oferta = um post: as cópias da mesma oferta para vários grupos contam 1 no limite diário. */
export function offerKey(job: { id?: string; runtimeInboxId?: string | null; runtime_inbox_id?: string | null;
  incomingMessageId?: string | null; incoming_message_id?: string | null }): string {
  return String(job.runtimeInboxId || job.runtime_inbox_id || job.incomingMessageId || job.incoming_message_id || job.id || '');
}

export function countDistinctOffers(jobs: Parameters<typeof offerKey>[0][]): number {
  return new Set(jobs.map(offerKey).filter(Boolean)).size;
}

/** Ofertas (posts) enviadas hoje — não mensagens. */
export async function countSentToday(userId: string, opts: { connectionId?: string } = {}): Promise<number> {
  if (isSupabaseConfigured && supabase) {
    let query = supabase.from('publication_jobs').select('id, runtime_inbox_id, incoming_message_id')
      .eq('user_id', userId).eq('status', 'enviado').gte('sent_at', startOfTodaySaoPaulo().toISOString()).limit(5000);
    if (opts.connectionId) query = query.eq('connection_id', opts.connectionId);
    const { data, error } = await query;
    if (error) throw new Error('Não foi possível contar os envios de hoje.');
    return countDistinctOffers(data || []);
  }
  return countDistinctOffers((readDatabase().jobs || []).filter(job => job.userId === userId &&
    (!opts.connectionId || job.connectionId === opts.connectionId) && isSentToday(job)) as any[]);
}
