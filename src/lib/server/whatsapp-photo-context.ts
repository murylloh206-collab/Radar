import { createHash } from 'node:crypto';
import type { UserSession } from '@/lib/server/auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { getActiveEvolutionConfig, isValidGatewayUrl, readDatabase } from '@/lib/server/storage';

type GatewayConfig = ReturnType<typeof getActiveEvolutionConfig>;
type LiveGroup = { id: string; pictureUrl?: unknown };

export class WhatsAppPhotoError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
  }
}

export async function photoGatewayConfig(session: UserSession): Promise<GatewayConfig> {
  let config: GatewayConfig;
  if (isSupabaseConfigured && supabase) {
    const { data: connection, error } = await supabase.from('integrations_whatsapp')
      .select('user_id, base_url, api_key, instance_name').eq('user_id', session.userId).maybeSingle();
    if (error) throw new WhatsAppPhotoError('CONFIG_UNAVAILABLE', 503, 'Não foi possível consultar a conexão salva.');
    if (connection) {
      // Environment credentials belong to the site administrator, never to another tenant.
      const environment = session.role === 'admin' ? environmentConfig() : { baseUrl: '', apiKey: '', instanceName: '' };
      config = {
        baseUrl: connection.base_url || environment.baseUrl,
        apiKey: connection.api_key || environment.apiKey,
        instanceName: connection.instance_name && connection.instance_name !== 'RadarInstancia1'
          ? connection.instance_name : environment.instanceName || connection.instance_name || '',
      };
    } else if (session.role === 'admin') {
      config = environmentConfig();
    } else {
      throw new WhatsAppPhotoError('CONNECTION_NOT_FOUND', 403, 'Nenhuma conexão vinculada à sua conta.');
    }
  } else if (process.env.VERCEL === '1') {
    if (session.role !== 'admin') throw new WhatsAppPhotoError('CONNECTION_NOT_FOUND', 403, 'Nenhuma conexão persistente vinculada à sua conta.');
    config = environmentConfig();
  } else {
    const connection = readDatabase().whatsapp;
    if (session.role !== 'admin' && session.userId !== connection.userId) {
      throw new WhatsAppPhotoError('FORBIDDEN', 403, 'Conta não autorizada.');
    }
    config = getActiveEvolutionConfig(connection);
  }
  if (!config.baseUrl || !config.apiKey || !config.instanceName || !isValidGatewayUrl(config.baseUrl).valid) {
    throw new WhatsAppPhotoError('CONNECTION_NOT_CONFIGURED', 422, 'Configure a conexão do WhatsApp no painel.');
  }
  return config;
}

function environmentConfig(): GatewayConfig {
  return {
    baseUrl: (process.env.EVOLUTION_BASE_URL || process.env.WHATSAPP_GATEWAY_URL || '').trim(),
    apiKey: (process.env.EVOLUTION_API_KEY || process.env.WHATSAPP_GATEWAY_KEY || '').trim(),
    instanceName: (process.env.EVOLUTION_INSTANCE_NAME || process.env.WHATSAPP_GATEWAY_INSTANCE || '').trim(),
  };
}

export function photoConfigKey(config: GatewayConfig): string {
  // Include credential rotation without retaining the plaintext secret in cache keys.
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

export async function photoGatewayRequest(config: GatewayConfig, endpoint: string, body?: object): Promise<Response> {
  try {
    return await fetch(`${config.baseUrl.replace(/\/+$/, '')}${endpoint}`, {
      method: body ? 'POST' : 'GET',
      headers: { apikey: config.apiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
  } catch {
    throw new WhatsAppPhotoError('GATEWAY_UNAVAILABLE', 503, 'Não foi possível consultar as fotos no gateway agora.');
  }
}

async function gatewayJson(config: GatewayConfig, endpoint: string): Promise<unknown> {
  const response = await photoGatewayRequest(config, endpoint);
  if (!response.ok) throw new WhatsAppPhotoError('GATEWAY_UNAVAILABLE', 502, 'O gateway não confirmou a consulta.');
  try { return await response.json(); }
  catch { throw new WhatsAppPhotoError('INVALID_GATEWAY_RESPONSE', 502, 'Resposta inválida do gateway.'); }
}

function record(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}

export function canonicalPhotoOwner(owner: string): string {
  return owner.replace(/:\d+(?=@s\.whatsapp\.net$)/, '');
}

const identityPending = new Map<string, Promise<string>>();

export async function livePhotoOwner(config: GatewayConfig): Promise<string> {
  const key = photoConfigKey(config);
  const existing = identityPending.get(key);
  if (existing) return existing;
  const task = fetchLivePhotoOwner(config);
  identityPending.set(key, task);
  try { return await task; }
  finally { identityPending.delete(key); }
}

async function fetchLivePhotoOwner(config: GatewayConfig): Promise<string> {
  const instance = encodeURIComponent(config.instanceName);
  const [statePayload, instancesPayload] = await Promise.all([
    gatewayJson(config, `/instance/connectionState/${instance}`),
    gatewayJson(config, `/instance/fetchInstances?instanceName=${instance}`),
  ]);
  const stateRecord = record(statePayload);
  const state = stateRecord.state || record(stateRecord.instance).state;
  if (state === 'close' || state === 'closed') {
    throw new WhatsAppPhotoError('WHATSAPP_DISCONNECTED', 409, 'O gateway confirmou que esta instância está desconectada.');
  }
  if (state !== 'open') throw new WhatsAppPhotoError('CONNECTION_UNCONFIRMED', 503, 'O gateway ainda não confirmou a conexão.');
  const instances = Array.isArray(instancesPayload) ? instancesPayload : [instancesPayload];
  const matched = instances.map(record).find(candidate =>
    candidate.name === config.instanceName || candidate.instanceName === config.instanceName);
  const owner = matched?.ownerJid;
  if (typeof owner !== 'string' || !/^\d{5,30}(?::\d+)?@s\.whatsapp\.net$/.test(owner)) {
    throw new WhatsAppPhotoError('ACCOUNT_UNCONFIRMED', 503, 'O gateway não informou a identidade da conta conectada.');
  }
  return canonicalPhotoOwner(owner);
}

const groupCache = new Map<string, { groups: LiveGroup[]; expires: number }>();
const groupsPending = new Map<string, Promise<LiveGroup[]>>();

export async function livePhotoGroups(config: GatewayConfig, owner: string): Promise<LiveGroup[]> {
  const key = `${photoConfigKey(config)}:${owner}`;
  const cached = groupCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.groups;
  const existing = groupsPending.get(key);
  if (existing) return existing;
  const task = fetchLivePhotoGroups(config);
  groupsPending.set(key, task);
  try {
    const groups = await task;
    groupCache.set(key, { groups, expires: Date.now() + 15000 });
    while (groupCache.size > 100) groupCache.delete(groupCache.keys().next().value!);
    return groups;
  } finally { groupsPending.delete(key); }
}

async function fetchLivePhotoGroups(config: GatewayConfig): Promise<LiveGroup[]> {
  const payload = await gatewayJson(config, `/group/fetchAllGroups/${encodeURIComponent(config.instanceName)}?getParticipants=false`);
  if (!Array.isArray(payload)) throw new WhatsAppPhotoError('INVALID_GROUPS_RESPONSE', 502, 'O gateway não retornou a lista de grupos.');
  return payload.map(record).flatMap(group => {
    const id = group.id || group.jid;
    return typeof id === 'string' && /^\d{5,30}@g\.us$/.test(id) ? [{ id, pictureUrl: group.pictureUrl }] : [];
  });
}
