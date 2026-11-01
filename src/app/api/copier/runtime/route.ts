import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { supabase } from '@/lib/supabase';
import { copierConnection } from '@/lib/server/copier-group-catalog';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    if (!supabase) throw new Error('Banco não configurado.');
    const { connection } = await copierConnection(session, req.nextUrl.searchParams.get('connectionId') || undefined);
    const [heartbeat, inbox, jobs, webhook] = await Promise.all([
      supabase.from('copier_worker_heartbeat').select('last_seen_at').order('last_seen_at', { ascending: false }).limit(1),
      supabase.from('copier_inbox').select('id,status,received_at,completed_at,last_error,result').eq('user_id', session.userId)
        .eq('connection_id', connection.id).order('received_at', { ascending: false }).limit(10),
      supabase.from('publication_jobs').select('id,status,target_name,error_details,scheduled_for,sent_at,runtime_delivery')
        .eq('user_id', session.userId).eq('connection_id', connection.id).not('runtime_payload', 'is', null).order('created_at', { ascending: false }).limit(10),
      supabase.from('whatsapp_connections').select('runtime_webhook_version,runtime_webhook_error')
        .eq('user_id', session.userId).eq('id', connection.id).maybeSingle(),
    ]);
    if (heartbeat.error || inbox.error || jobs.error || webhook.error) throw new Error('Migração ou banco indisponível.');
    const lastSeen = heartbeat.data[0]?.last_seen_at || null;
    return NextResponse.json({ ok: true, lastSeen, workerActive: !!lastSeen && Date.now() - Date.parse(lastSeen) < 60000,
      webhook: webhook.data,
      inbox: inbox.data.map(entry => ({ id: entry.id, status: entry.status, receivedAt: entry.received_at, completedAt: entry.completed_at,
        reason: entry.last_error || entry.result?.reason, processingMs: entry.result?.processingMs })), jobs: jobs.data },
    { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'Diagnóstico indisponível. Confira a migração 06 e a execução do worker.' }, { status: 503 });
  }
}
