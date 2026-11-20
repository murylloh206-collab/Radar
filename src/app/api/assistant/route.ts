import { NextRequest, NextResponse } from 'next/server';
import { getStrictSession } from '@/lib/server/auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { copierConnections } from '@/lib/server/copier-group-catalog';
import { isAssistantOwner } from '@/lib/server/assistant/access';
import { mlApiStatus } from '@/lib/server/ml-api';

export const dynamic = 'force-dynamic';

/** Estado do assistente por conexão do cliente + números de hoje + últimas conversas (sem telefones). */
export async function GET(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Entre na sua conta.' }, { status: 401 });
  if (!isAssistantOwner(session.userId)) return NextResponse.json({ ok: false, locked: true, error: 'Página não encontrada.' }, { status: 404 });
  if (!isSupabaseConfigured || !supabase) return NextResponse.json({ ok: false, error: 'Banco de dados não configurado.' }, { status: 503 });

  const connections = await copierConnections(session).catch(() => []);
  const ids = connections.map(c => c.id);
  const settings = ids.length ? await supabase.from('assistant_settings').select('connection_id, enabled').in('connection_id', ids) : { data: [], error: null };
  if (settings.error) return NextResponse.json({ ok: false, error: 'Falta rodar a migração 17 no banco.' }, { status: 503 });
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const { data: recent } = await supabase.from('assistant_inbox')
    .select('id, connection_id, status, kind, links_total, links_ok, error, received_at, contact_hash')
    .eq('user_id', session.userId).order('received_at', { ascending: false }).limit(200);
  const rows = recent || [];
  const today = rows.filter(r => r.received_at >= since.toISOString());
  const mlApi = await mlApiStatus(session.userId);
  return NextResponse.json({
    ok: true,
    mlApi,
    connections: connections.map(c => ({
      id: c.id, label: c.label, phoneNumber: c.phoneNumber || null, status: c.status,
      enabled: (settings.data || []).some(s => s.connection_id === c.id && s.enabled),
    })),
    today: {
      conversations: new Set(today.map(r => r.contact_hash)).size,
      links: today.reduce((sum, r) => sum + (r.links_ok || 0), 0),
      failures: today.reduce((sum, r) => sum + Math.max(0, (r.links_total || 0) - (r.links_ok || 0)), 0),
    },
    recent: rows.slice(0, 20).map(r => ({
      id: r.id, connectionId: r.connection_id, status: r.status, kind: r.kind,
      linksTotal: r.links_total, linksOk: r.links_ok, error: r.error, at: r.received_at,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Liga ou desliga o assistente numa conexão do próprio cliente. */
export async function POST(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Entre na sua conta.' }, { status: 401 });
  if (!isAssistantOwner(session.userId)) return NextResponse.json({ ok: false, locked: true, error: 'Página não encontrada.' }, { status: 404 });
  if (!isSupabaseConfigured || !supabase) return NextResponse.json({ ok: false, error: 'Banco de dados não configurado.' }, { status: 503 });
  const body = await req.json().catch(() => null);
  const connectionId = typeof body?.connectionId === 'string' ? body.connectionId : '';
  const enabled = body?.enabled === true;
  const connections = await copierConnections(session).catch(() => []);
  if (!connections.some(c => c.id === connectionId)) return NextResponse.json({ ok: false, error: 'Conexão não encontrada na sua conta.' }, { status: 404 });
  const { error } = await supabase.from('assistant_settings').upsert(
    { connection_id: connectionId, user_id: session.userId, enabled, updated_at: new Date().toISOString() },
    { onConflict: 'connection_id' },
  );
  if (error) return NextResponse.json({ ok: false, error: 'Falta rodar a migração 17 no banco.' }, { status: 503 });
  return NextResponse.json({ ok: true, enabled });
}
