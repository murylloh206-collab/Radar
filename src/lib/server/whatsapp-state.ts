import 'server-only';
import type { WhatsAppConnection } from '@/lib/types';
import { supabase, isSupabaseConfigured, isTestIsolationActive } from '@/lib/supabase';
import { getActiveEvolutionConfig, readDatabase, writeDatabase } from './storage';
import { safeWhatsAppPictureUrl } from './whatsapp-picture';

const pendingChecks = new Map<string, Promise<WhatsAppConnection>>();

export function connectionView(connection: WhatsAppConnection) {
  const recent = !!connection.lastPingAt && Date.now() - Date.parse(connection.lastPingAt) < 60000;
  const state = connection.status === 'connected' ? recent ? 'connected_now' : 'last_known_connection' : 'disconnected';
  return { id: connection.id, label: connection.label, instanceName: connection.instanceName, status: connection.status, state,
    statusLabel: connection.status === 'connected' ? recent ? 'Conectado' : 'Última conexão confirmada' :
      ['connecting', 'qrcode'].includes(connection.status) ? 'Aguardando pareamento' : 'Desconectado',
    ownerJid: connection.ownerJid, phoneNumber: connection.phoneNumber, profileName: connection.profileName,
    profilePicUrl: connection.profilePicUrl, lastPingAt: connection.lastPingAt || null,
    lastVerificationStatus: connection.lastVerificationStatus, isDefault: connection.isDefault };
}

async function gatewayJson(connection: WhatsAppConnection, endpoint: string) {
  const gateway = getActiveEvolutionConfig(connection);
  const response = await fetch(gateway.baseUrl.replace(/\/+$/, '') + endpoint, {
    headers: { apikey: gateway.apiKey }, signal: AbortSignal.timeout(6000), cache: 'no-store',
  });
  if (!response.ok) throw new Error('O gateway não confirmou a consulta.');
  return response.json();
}

async function persistObservation(connection: WhatsAppConnection, patch: Record<string, unknown>) {
  if (isTestIsolationActive() || !isSupabaseConfigured || !supabase) {
    const db = readDatabase();
    const connIdx = (db.connections || []).findIndex(c => c.id === connection.id);
    if (connIdx >= 0) {
      db.connections[connIdx] = {
        ...db.connections[connIdx],
        status: (patch.status as any) || db.connections[connIdx].status,
        lastPingAt: (patch.last_ping_at as string) || db.connections[connIdx].lastPingAt,
        lastVerificationStatus: (patch.last_verification_status as any) || db.connections[connIdx].lastVerificationStatus,
        ownerJid: (patch.owner_jid as string) || db.connections[connIdx].ownerJid,
        phoneNumber: (patch.phone_number as string) || db.connections[connIdx].phoneNumber,
        profileName: (patch.profile_name as string) || db.connections[connIdx].profileName,
        profilePicUrl: (patch.profile_pic_url as string) || db.connections[connIdx].profilePicUrl,
        updatedAt: new Date().toISOString(),
      };
      writeDatabase(db);
    }
    return;
  }
  const saved = await supabase.from('whatsapp_connections').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', connection.id).eq('user_id', connection.userId);
  if (saved.error) throw new Error('Não foi possível salvar a verificação da conexão.');
}

async function checkConnection(connection: WhatsAppConnection) {
  let payload;
  try { payload = await gatewayJson(connection, '/instance/connectionState/' + encodeURIComponent(connection.instanceName)); }
  catch { return { ...connection, lastVerificationStatus: 'unreachable' as const }; }
  const state = String(payload?.instance?.state || payload?.state || '').toLowerCase();
  if (!['open', 'connected', 'close', 'closed', 'disconnected', 'connecting'].includes(state)) {
    return { ...connection, lastVerificationStatus: 'unreachable' as const };
  }
  const status = ['open', 'connected'].includes(state) ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected';
  const lastPingAt = new Date().toISOString();
  await persistObservation(connection, { status, last_ping_at: lastPingAt, last_verification_status: 'verified' });
  return { ...connection, status, lastPingAt, lastVerificationStatus: 'verified' } as WhatsAppConnection;
}

export function hasFreshConnectionObservation(connection: WhatsAppConnection) {
  const age = connection.lastPingAt ? Date.now() - Date.parse(connection.lastPingAt) : Infinity;
  return connection.status === 'connected' && connection.lastVerificationStatus === 'verified' &&
    age >= 0 && age < 8000;
}

export async function verifyWhatsAppConnection(connection: WhatsAppConnection) {
  if (hasFreshConnectionObservation(connection)) return connection;
  const key = connection.userId + ':' + connection.id;
  const existing = pendingChecks.get(key);
  if (existing) return existing;
  const task = checkConnection(connection);
  pendingChecks.set(key, task);
  try { return await task; }
  finally { if (pendingChecks.get(key) === task) pendingChecks.delete(key); }
}

export async function refreshWhatsAppIdentity(connection: WhatsAppConnection) {
  const payload = await gatewayJson(connection, '/instance/fetchInstances?instanceName=' + encodeURIComponent(connection.instanceName));
  const matched = (Array.isArray(payload) ? payload : [payload]).find(candidate =>
    candidate?.name === connection.instanceName || candidate?.instanceName === connection.instanceName || candidate?.instance?.name === connection.instanceName);
  const rawOwner = matched?.ownerJid || matched?.instance?.owner;
  if (typeof rawOwner !== 'string' || !/^\d{5,30}(?::\d+)?@s\.whatsapp\.net$/.test(rawOwner)) throw new Error('Identidade não confirmada pelo gateway.');
  const ownerJid = rawOwner.replace(/:\d+(?=@)/, '');
  const profilePicUrl = safeWhatsAppPictureUrl(matched.profilePicUrl || matched.profilePictureUrl) || undefined;
  const profileName = typeof matched.profileName === 'string' ? matched.profileName : undefined;
  const phoneNumber = ownerJid.split('@')[0];
  await persistObservation(connection, { owner_jid: ownerJid, phone_number: phoneNumber,
    profile_name: profileName || null, profile_pic_url: profilePicUrl || null });
  return { ...connection, ownerJid, phoneNumber, profileName, profilePicUrl };
}
