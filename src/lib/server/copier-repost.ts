import 'server-only';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/*
 * Repostagem automática: oferta que não saiu por ERRO CORRIGÍVEL (foto, loja desconectada, sessão do ML,
 * link que demorou, preço não lido…) volta para a fila e é processada de novo — quando a causa for corrigida, ela sai.
 * Só ofertas com até 2 h (mesma regra do copiador contra ofertas vencidas) e no máximo MAX_REPOST_ATTEMPTS tentativas.
 */

export const MAX_REPOST_ATTEMPTS = 8;
export const REPOST_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const RETRYABLE = [
  /Fotografia do produto indisponível/i,
  /Credenciais de afiliado não configuradas ou inativas/i,
  /Sessão do Mercado Livre expirou/i,
  /Não foi possível gerar o meli\.la/i,
  /Rakuten não gerou|Conecte a Rakuten/i,
  /AppID ou Senha da Shopee|Shopee Open API/i,
  /Erro ao resolver link|operation was aborted|timed? ?out|tempo esgotado/i,
  /Mensagem sem preço/i,
];

export interface RepostRow {
  id: string;
  status: string;
  payload: any;
  result: any;
  jobs: Array<{ status: string; error_details?: string | null }>;
}

export function isRetryableFailure(row: RepostRow): boolean {
  if ((row.jobs || []).some(j => ['enviado', 'enviando', 'agendado'].includes(j.status))) return false;
  const texts = [String(row.result?.reason || '')];
  for (const j of row.jobs || []) if (j.status === 'aguardando_aprovacao' && j.error_details) texts.push(String(j.error_details));
  return texts.some(t => RETRYABLE.some(re => re.test(t)));
}

function messageTimeMs(row: RepostRow): number {
  const raw = Array.isArray(row.payload?.data) ? row.payload.data[0] : row.payload?.data;
  const ts = Number(raw?.messageTimestamp || 0);
  return ts > 1e12 ? ts : ts * 1000;
}

export function selectRepostCandidates(rows: RepostRow[], now = Date.now()): RepostRow[] {
  return rows.filter(r => {
    if (r.status !== 'completed') return false;
    const t = messageTimeMs(r);
    if (!t || now - t > REPOST_MAX_AGE_MS) return false;
    if (Number(r.payload?.radarRepostCount || 0) >= MAX_REPOST_ATTEMPTS) return false;
    return isRetryableFailure(r);
  });
}

/** Devolve as ofertas para a fila (tira da revisão a versão parada). Retorna quantas foram devolvidas. */
export async function requeueForRepost(rows: RepostRow[]): Promise<number> {
  if (!isSupabaseConfigured || !supabase || !rows.length) return 0;
  let n = 0;
  for (const r of rows) {
    await supabase
      .from('publication_jobs')
      .update({ status: 'cancelado', error_details: 'Substituída por nova tentativa automática (repostagem).' })
      .eq('runtime_inbox_id', r.id)
      .eq('status', 'aguardando_aprovacao');
    const payload = { ...r.payload, radarRepostCount: Number(r.payload?.radarRepostCount || 0) + 1 };
    const { error } = await supabase
      .from('copier_inbox')
      .update({ status: 'pending', attempts: 0, available_at: new Date().toISOString(), lease_until: null, lease_token: null, last_error: null, payload })
      .eq('id', r.id)
      .eq('status', 'completed');
    if (!error) n++;
  }
  return n;
}

/** Ciclo do agendador: procura as falhas corrigíveis recentes e devolve para a fila (no máximo `limit` por vez). */
export async function runRepostCycle(limit = 10): Promise<{ requeued: number }> {
  if (!isSupabaseConfigured || !supabase) return { requeued: 0 };
  const since = new Date(Date.now() - REPOST_MAX_AGE_MS - 10 * 60e3).toISOString();
  const { data: inbox } = await supabase
    .from('copier_inbox')
    .select('id,status,payload,result')
    .eq('status', 'completed')
    .gte('received_at', since)
    .order('received_at', { ascending: true })
    .limit(200);
  const rows: RepostRow[] = [];
  for (const r of inbox || []) {
    const { data: jobs } = await supabase.from('publication_jobs').select('status,error_details').eq('runtime_inbox_id', r.id);
    rows.push({ ...(r as any), jobs: jobs || [] });
  }
  const candidates = selectRepostCandidates(rows).slice(0, limit);
  return { requeued: await requeueForRepost(candidates) };
}
