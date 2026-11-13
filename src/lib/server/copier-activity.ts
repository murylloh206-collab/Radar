import 'server-only';
import { supabase } from '@/lib/supabase';
import { startOfTodaySaoPaulo } from './daily-sent-counter';

export async function copierActivity(userId: string, connectionId: string) {
  if (!supabase) throw new Error('Banco indisponível.');
  const start = startOfTodaySaoPaulo().toISOString();
  const inboxQuery = () => supabase!.from('copier_inbox').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('connection_id', connectionId);
  const jobsQuery = () => supabase!.from('publication_jobs').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('connection_id', connectionId).not('runtime_payload', 'is', null);
  const replies = await Promise.all([
    supabase.from('copier_worker_heartbeat').select('last_seen_at').order('last_seen_at', { ascending: false }).limit(1),
    supabase.from('copier_inbox').select('id,status,received_at,completed_at,last_error,result,payload->data->key->>remoteJid')
      .eq('user_id', userId).eq('connection_id', connectionId).order('received_at', { ascending: false }).limit(40),
    supabase.from('publication_jobs').select('id,status,target_name,media_url,error_details,scheduled_for,sent_at,updated_at,runtime_delivery')
      .eq('user_id', userId).eq('connection_id', connectionId).not('runtime_payload', 'is', null).order('created_at', { ascending: false }).limit(40),
    inboxQuery().gte('received_at', start), inboxQuery().in('status', ['pending', 'processing']),
    jobsQuery().eq('status', 'enviado').gte('sent_at', start), jobsQuery().eq('status', 'agendado'),
    jobsQuery().in('status', ['aguardando_aprovacao', 'rascunho']), jobsQuery().eq('status', 'falha'),
  ]);
  if (replies.some(reply => reply.error)) throw new Error('Não foi possível consultar o processamento persistido.');
  const lastSeen = replies[0].data?.[0]?.last_seen_at || null;
  return { lastSeen, workerActive: !!lastSeen && Date.now() - Date.parse(lastSeen) < 60000,
    inbox: replies[1].data || [], jobs: replies[2].data || [],
    receivedToday: replies[3].count || 0, pendingEvents: replies[4].count || 0, sentToday: replies[5].count || 0,
    scheduledCount: replies[6].count || 0, reviewCount: replies[7].count || 0, failedCount: replies[8].count || 0 };
}
