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

export async function countSentToday(userId: string, opts: { connectionId?: string } = {}): Promise<number> {
  if (isSupabaseConfigured && supabase) {
    let query = supabase.from('publication_jobs').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'enviado').gte('sent_at', startOfTodaySaoPaulo().toISOString());
    if (opts.connectionId) query = query.eq('connection_id', opts.connectionId);
    const { count, error } = await query;
    if (error) throw new Error('Não foi possível contar os envios de hoje.');
    return count || 0;
  }
  return (readDatabase().jobs || []).filter(job => job.userId === userId &&
    (!opts.connectionId || job.connectionId === opts.connectionId) && isSentToday(job)).length;
}
