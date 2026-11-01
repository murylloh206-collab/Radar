import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { supabase } from '@/lib/supabase';
import { copierConnection, copierGroupCatalog } from '@/lib/server/copier-group-catalog';
import { WhatsAppPhotoError } from '@/lib/server/whatsapp-photo-context';
import { ensureValidUuid } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false }, { status: 401, headers });
  try {
    if (!supabase) throw new Error('Banco não configurado.');
    const id = req.nextUrl.searchParams.get('connectionId') || undefined;
    const { connection } = await copierConnection(session, id);
    const cached = await supabase.from('whatsapp_groups').select('*').eq('user_id', session.userId).eq('connection_id', connection.id);
    if (cached.error) throw new Error('Falha ao ler o cache de grupos.');
    let groups = (cached.data || []).filter(row => row.runtime_owner_jid === connection.ownerJid && row.runtime_group).map(row => row.runtime_group);
    let isLive = false;
    let warning: string | undefined;
    if (req.nextUrl.searchParams.get('refresh') === 'true' || req.nextUrl.searchParams.get('sync') === 'true') {
      try {
        const catalog = await copierGroupCatalog(session, { connectionId: connection.id, refresh: true });
        const records = catalog.groups.map(group => ({ id: cached.data?.find(row => row.group_jid === group.groupJid)?.id || ensureValidUuid(),
          user_id: session.userId, connection_id: connection.id, group_jid: group.groupJid, name: group.name,
          participant_count: group.participantCount, is_admin: group.isAdmin, runtime_owner_jid: catalog.connection.ownerJid,
          runtime_group: group, last_synced_at: catalog.syncedAt }));
        if (records.length) {
          const saved = await supabase.from('whatsapp_groups').upsert(records, { onConflict: 'user_id,connection_id,group_jid' });
          if (saved.error) throw new Error('Falha ao salvar os grupos.');
        }
        let prune = supabase.from('whatsapp_groups').delete().eq('user_id', session.userId).eq('connection_id', connection.id);
        if (records.length) prune = prune.not('group_jid', 'in', '(' + records.map(record => '"' + record.group_jid + '"').join(',') + ')');
        const removed = await prune;
        if (removed.error) throw new Error('Falha ao atualizar a lista de grupos.');
        const identity = await supabase.from('whatsapp_connections').update({ owner_jid: catalog.connection.ownerJid,
          phone_number: catalog.connection.phoneNumber, status: 'connected', last_ping_at: catalog.connection.lastPingAt })
          .eq('id', connection.id).eq('user_id', session.userId);
        if (identity.error) throw new Error('Falha ao confirmar a identidade.');
        connection.ownerJid = catalog.connection.ownerJid;
        groups = catalog.groups; isLive = true;
      } catch { warning = 'Não foi possível atualizar agora. A última lista confirmada desta conta foi preservada.'; }
    }
    const cachedAt = groups[0]?.lastSyncedAt || null;
    return NextResponse.json({ ok: true, groups, isLive, cachedAt, lastSyncedAt: cachedAt,
      connectionId: connection.id, accountJid: connection.ownerJid, warning, syncWarning: warning }, { headers });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof WhatsAppPhotoError ? error.message : 'Não foi possível consultar os grupos persistidos. Confira a migração 06.' },
      { status: error instanceof WhatsAppPhotoError ? error.status : 503, headers });
  }
}
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false }, { status: 401, headers });
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false }, { status: 400, headers }); }
  if (body.action && body.action !== 'sync') return NextResponse.json({ ok: false, error: 'Ação não suportada.' }, { status: 400, headers });
  const url = new URL(req.url); url.searchParams.set('refresh', 'true');
  if (body.connectionId) url.searchParams.set('connectionId', body.connectionId);
  return GET(new NextRequest(url, { headers: req.headers }));
}
