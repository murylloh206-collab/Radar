import 'server-only';
import { createHash } from 'crypto';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { notifyOwner } from '@/lib/server/owner-notify';

/*
 * Contador da página /grupo: visitas e cliques em "Entrar no grupo", com aviso no ntfy a cada clique.
 * Sem IP guardado: o visitante vira um código do dia (hash com segredo), só para não contar repetido.
 */

export type GroupEventKind = 'visita' | 'clique';
const REPEAT_WINDOW_MIN = 30;

export function isBot(userAgent: string): boolean {
  return !userAgent || /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|curl|python|headless|lighthouse/i.test(userAgent);
}

/** Código do visitante no dia (muda todo dia; não dá para voltar ao IP). */
export function visitorCode(ip: string, userAgent: string, day: string, secret: string): string {
  return createHash('sha256').update(`${secret}|${day}|${ip}|${userAgent}`).digest('hex').slice(0, 24);
}

/** De onde a pessoa veio: utm_source, senão o site anterior (instagram, google…), senão "direto". */
export function sourceOf(utm: string | null | undefined, referrer: string | null | undefined): string {
  const clean = (v: string) => v.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40);
  if (utm && clean(utm)) return clean(utm);
  try {
    const host = new URL(String(referrer)).hostname.replace(/^(www|m|l|lm)\./, '');
    if (/instagram/.test(host)) return 'instagram';
    if (/facebook|fb\.com/.test(host)) return 'facebook';
    if (/tiktok/.test(host)) return 'tiktok';
    if (/google/.test(host)) return 'google';
    if (/youtube|youtu\.be/.test(host)) return 'youtube';
    if (/^t\.co$|twitter|x\.com/.test(host)) return 'x';
    if (/radarofertasbr|painel-de-ofertas/.test(host)) return 'direto';
    return clean(host) || 'direto';
  } catch { return 'direto'; }
}

/** Início do dia de hoje no horário de Brasília. */
export function startOfTodayBrt(now = Date.now()): string {
  const brt = new Date(now - 3 * 3600e3);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3)).toISOString();
}

export function clickNotice(source: string, clicks: number, visits: number) {
  const rate = visits > 0 ? ` (${Math.round((clicks / visits) * 100)}% das visitas)` : '';
  return {
    title: `Clique no grupo: ${clicks}º de hoje`,
    body: `Alguém tocou em "Entrar no grupo" (veio de: ${source}).\nHoje: ${clicks} cliques e ${visits} visitas${rate}.`,
    tags: 'busts_in_silhouette',
    priority: 'low' as const,
    click: 'https://radarofertasbr.vercel.app/grupo',
  };
}

const count = async (kind: GroupEventKind, since: string) => {
  const { count: n } = await supabase!.from('group_page_events').select('id', { count: 'exact', head: true })
    .eq('kind', kind).gte('created_at', since);
  return n || 0;
};

/** Registra a visita/clique (uma vez por pessoa a cada 30 min) e, no clique, avisa no ntfy. */
export async function recordGroupEvent(input: { kind: GroupEventKind; visitor: string; source: string }): Promise<'gravado' | 'repetido' | 'sem_banco'> {
  if (!isSupabaseConfigured || !supabase) return 'sem_banco';
  const recent = new Date(Date.now() - REPEAT_WINDOW_MIN * 60e3).toISOString();
  const { data: seen } = await supabase.from('group_page_events').select('id')
    .eq('visitor', input.visitor).eq('kind', input.kind).gte('created_at', recent).limit(1);
  if (seen?.length) return 'repetido';
  const { error } = await supabase.from('group_page_events').insert({ kind: input.kind, visitor: input.visitor, source: input.source });
  if (error) { console.error('[Grupo] contador sem a migração 20?', error.message); return 'sem_banco'; }
  if (input.kind === 'clique') {
    const since = startOfTodayBrt();
    const [clicks, visits] = await Promise.all([count('clique', since), count('visita', since)]);
    await notifyOwner(clickNotice(input.source, clicks, visits));
  }
  return 'gravado';
}
