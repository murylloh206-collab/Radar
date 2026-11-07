import 'server-only';
import type { UserSession } from './auth';
import type { WhatsAppGroup } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { copierConnection, copierGroupCatalog } from './copier-group-catalog';
import { ensureValidUuid } from './storage';

export async function savedWhatsAppGroups(session: UserSession, connectionId?: string) {
  const selection = await copierConnection(session, connectionId);
  return savedGroupsForConnection(session, selection);
}

export async function savedGroupsForConnection(session: UserSession, selection: Awaited<ReturnType<typeof copierConnection>>) {
  if (!supabase) throw new Error('Banco indisponível.');
  const cached = await supabase.from('whatsapp_groups').select('runtime_group,runtime_owner_jid,last_synced_at')
    .eq('user_id', session.userId).eq('connection_id', selection.connection.id);
  if (cached.error) throw new Error('Não foi possível consultar os grupos salvos.');
  const groups: WhatsAppGroup[] = (cached.data || []).filter(row => selection.connection.ownerJid &&
    row.runtime_owner_jid === selection.connection.ownerJid && row.runtime_group).map(row => row.runtime_group);
  return { ...selection, groups, syncedAt: groups[0]?.lastSyncedAt || null, isLive: false };
}

export async function syncWhatsAppGroups(session: UserSession, connectionId?: string) {
  if (!supabase) throw new Error('Banco indisponível.');
  const catalog = await copierGroupCatalog(session, { connectionId, refresh: true, permissions: true });
  const records = catalog.groups.map(group => ({ id: ensureValidUuid(), user_id: session.userId,
    connection_id: catalog.connection.id, group_jid: group.groupJid, name: group.name,
    participant_count: group.participantCount, is_admin: group.isAdmin,
    runtime_owner_jid: catalog.connection.ownerJid, runtime_group: group, last_synced_at: catalog.syncedAt }));
  // IDs already referenced by other records must remain stable when refreshing a group.
  const existing = await supabase.from('whatsapp_groups').select('id,group_jid,runtime_owner_jid,runtime_group')
    .eq('user_id', session.userId).eq('connection_id', catalog.connection.id);
  if (existing.error) throw new Error('Não foi possível consultar os identificadores dos grupos.');
  records.forEach(row => {
    const previous = existing.data.find(group => group.group_jid === row.group_jid);
    row.id = previous?.id || row.id;
    if (!row.runtime_group.pictureUrl && previous?.runtime_owner_jid === catalog.connection.ownerJid) {
      row.runtime_group.pictureUrl = previous?.runtime_group?.pictureUrl;
    }
  });
  if (records.length) {
    const saved = await supabase.from('whatsapp_groups').upsert(records, { onConflict: 'user_id,connection_id,group_jid' });
    if (saved.error) throw new Error('Não foi possível salvar os grupos sincronizados.');
  }
  const patch = await supabase.from('whatsapp_connections').update({ owner_jid: catalog.connection.ownerJid,
    phone_number: catalog.connection.phoneNumber, status: 'connected', last_verification_status: 'verified',
    last_ping_at: catalog.connection.lastPingAt }).eq('id', catalog.connection.id).eq('user_id', session.userId);
  if (patch.error) throw new Error('Não foi possível salvar a identidade dos grupos.');
  let prune = supabase.from('whatsapp_groups').delete().eq('user_id', session.userId).eq('connection_id', catalog.connection.id);
  if (records.length) prune = prune.not('group_jid', 'in', '(' + records.map(row => '"' + row.group_jid + '"').join(',') + ')');
  const removed = await prune;
  if (removed.error) throw new Error('Não foi possível retirar os grupos que saíram desta conta.');
  return { ...catalog, isLive: true };
}
