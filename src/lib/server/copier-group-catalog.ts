import type { UserSession } from '@/lib/server/auth';
import type { WhatsAppConnection, WhatsAppGroup } from '@/lib/types';
import { readDatabase, isValidGatewayUrl, normalizeWhatsAppPhone, compareWhatsAppIds } from '@/lib/server/storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { safeWhatsAppPictureUrl } from '@/lib/server/whatsapp-picture';
import { livePhotoOwner, photoConfigKey, photoGatewayRequest, WhatsAppPhotoError } from '@/lib/server/whatsapp-photo-context';

type RegisteredConnection = WhatsAppConnection & { persistence: 'multi' | 'legacy' | 'local' };
const catalogCache = new Map<string, { groups: WhatsAppGroup[]; expires: number; syncedAt: string }>();
const pending = new Map<string, Promise<WhatsAppGroup[]>>();

function environmentGateway() {
  return {
    baseUrl: (process.env.EVOLUTION_BASE_URL || process.env.WHATSAPP_GATEWAY_URL || '').trim(),
    apiKey: (process.env.EVOLUTION_API_KEY || process.env.WHATSAPP_GATEWAY_KEY || '').trim(),
    instanceName: (process.env.EVOLUTION_INSTANCE_NAME || process.env.WHATSAPP_GATEWAY_INSTANCE || '').trim(),
  };
}

export async function copierConnections(session: UserSession): Promise<RegisteredConnection[]> {
  if (!isSupabaseConfigured || !supabase) {
    if (process.env.VERCEL === '1') throw new WhatsAppPhotoError('DATABASE_REQUIRED', 503, 'Configure a persistência das conexões no servidor.');
    const db = readDatabase();
    const connections = (db.connections || []).filter(connection => connection.userId === session.userId);
    if (connections.length) return connections.map(connection => ({ ...connection, persistence: 'local' }));
    if (db.whatsapp.userId !== session.userId) return [];
    return [{ ...db.whatsapp, label: db.whatsapp.profileName || 'Meu WhatsApp', isDefault: true,
      createdAt: db.whatsapp.updatedAt, persistence: 'local' }];
  }
  const { data: registered, error } = await supabase.from('whatsapp_connections').select('*').eq('user_id', session.userId);
  if (error && !['42P01', 'PGRST205'].includes(error.code)) {
    throw new WhatsAppPhotoError('CONNECTIONS_UNAVAILABLE', 503, 'Não foi possível consultar suas conexões.');
  }
  const { data: legacy, error: legacyError } = await supabase.from('integrations_whatsapp').select('*').eq('user_id', session.userId);
  if (legacyError) throw new WhatsAppPhotoError('CONNECTIONS_UNAVAILABLE', 503, 'Não foi possível consultar a conexão salva.');
  const rows: Record<string, unknown>[] = registered?.length ? registered : legacy || [];
  const environment = environmentGateway();
  return rows.map(row => {
    const credentials = (legacy || []).find(candidate => candidate.instance_name === row.instance_name);
    const connection: RegisteredConnection = {
      id: String(row.id), userId: session.userId, label: String(row.label || row.profile_name || 'Meu WhatsApp'),
      instanceName: String(row.instance_name || ''),
      baseUrl: String(row.base_url || credentials?.base_url || environment.baseUrl),
      apiKey: String(row.api_key || credentials?.api_key || environment.apiKey),
      status: ['connected', 'connecting', 'qrcode'].includes(String(row.status)) ? row.status as WhatsAppConnection['status'] : 'disconnected',
      ownerJid: typeof row.owner_jid === 'string' ? row.owner_jid : undefined,
      phoneNumber: typeof row.phone_number === 'string' ? row.phone_number : undefined,
      profileName: typeof row.profile_name === 'string' ? row.profile_name : undefined,
      lastPingAt: typeof row.last_ping_at === 'string' ? row.last_ping_at : undefined,
      isDefault: registered?.length ? row.is_default === true : true,
      createdAt: String(row.created_at || ''), updatedAt: String(row.updated_at || ''),
      persistence: registered?.length ? 'multi' : 'legacy',
    };
    return connection;
  });
}

export async function copierConnection(session: UserSession, id?: string) {
  const connections = await copierConnections(session);
  const connection = id && id !== 'default' ? connections.find(candidate => candidate.id === id) :
    connections.find(candidate => candidate.isDefault) || (connections.length === 1 ? connections[0] : undefined);
  if (!connection) throw new WhatsAppPhotoError('CONNECTION_NOT_FOUND', 404, 'Selecione um WhatsApp da sua conta em Conexões.');
  if (!connection.baseUrl || !connection.apiKey || !connection.instanceName || !isValidGatewayUrl(connection.baseUrl).valid) {
    throw new WhatsAppPhotoError('CONNECTION_NOT_CONFIGURED', 422, 'O gateway desta conexão não está configurado.');
  }
  return { connection, connections };
}

export function publicCopierConnection(connection: RegisteredConnection) {
  return { id: connection.id, label: connection.label, phoneNumber: connection.phoneNumber,
    profileName: connection.profileName, ownerJid: connection.ownerJid, status: connection.status,
    isDefault: connection.isDefault, lastPingAt: connection.lastPingAt };
}

export async function copierGroupCatalog(session: UserSession, options: { connectionId?: string; refresh?: boolean; permissions?: boolean }) {
  const { connection, connections } = await copierConnection(session, options.connectionId);
  const owner = await livePhotoOwner(connection);
  const key = `${session.userId}:${connection.id}:${photoConfigKey(connection)}:${owner}:${!!options.permissions}`;
  let cached = catalogCache.get(key);
  if (!cached || cached.expires <= Date.now() || options.refresh) {
    let task = pending.get(key);
    if (!task) { task = fetchGroups(connection, owner, !!options.permissions); pending.set(key, task); }
    try {
      const groups = await task;
      cached = { groups, syncedAt: new Date().toISOString(), expires: Date.now() + 30000 };
      catalogCache.set(key, cached);
      while (catalogCache.size > 100) catalogCache.delete(catalogCache.keys().next().value!);
    } finally { if (pending.get(key) === task) pending.delete(key); }
  }
  const currentConnection = { ...connection, ownerJid: owner, phoneNumber: normalizeWhatsAppPhone(owner),
    status: 'connected' as const, lastPingAt: new Date().toISOString() };
  return { connection: currentConnection, connections, groups: cached.groups, syncedAt: cached.syncedAt };
}

async function fetchGroups(connection: RegisteredConnection, owner: string, permissions: boolean): Promise<WhatsAppGroup[]> {
  const response = await photoGatewayRequest(connection,
    `/group/fetchAllGroups/${encodeURIComponent(connection.instanceName)}?getParticipants=${permissions}`);
  if (!response.ok) throw new WhatsAppPhotoError('GROUPS_UNAVAILABLE', 502, 'O WhatsApp não retornou seus grupos. Tente atualizar.');
  const groups: unknown = await response.json();
  if (!Array.isArray(groups)) throw new WhatsAppPhotoError('INVALID_GROUPS', 502, 'O gateway retornou uma lista inválida.');
  return groups.flatMap((group: Record<string, unknown>) => {
    if (!group || typeof group !== 'object') return [];
    const jid = group.id || group.jid;
    const name = group.subject || group.name;
    if (typeof jid !== 'string' || !/^\d{5,30}@g\.us$/.test(jid) || typeof name !== 'string' || !name.trim()) return [];
    const participants = Array.isArray(group.participants) ? group.participants : [];
    const participant = participants.find(candidate => candidate && typeof candidate === 'object' &&
      compareWhatsAppIds(owner, String(candidate.id || candidate.jid || ''), String(candidate.phoneNumber || '')));
    const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
    const permissionKnown = group.announce === false || !!participant;
    const canPost = isAdmin || group.announce === false || (group.announce === true && participant ? false : undefined);
    return [{ id: `${connection.id}:${jid}`, userId: connection.userId, connectionId: connection.id,
      groupJid: jid, name: name.trim(), pictureUrl: safeWhatsAppPictureUrl(group.pictureUrl || group.profilePictureUrl) || undefined,
      participantCount: Number(group.size || participants.length || 0), isAdmin: !!isAdmin, canPost,
      permissionStatus: isAdmin ? 'verified_admin' as const : permissionKnown ? (canPost ? 'verified_member' as const : 'restricted_readonly' as const) : 'unverified' as const,
      isOrigin: false, isDestination: false, lastSyncedAt: new Date().toISOString() }];
  });
}
