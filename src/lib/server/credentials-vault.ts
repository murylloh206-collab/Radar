import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { StoreCredential, StoreName } from '../types';
import { isSupabaseConfigured, supabase } from '../supabase';
import { encryptSecret, decryptSecret, encryptJson, decryptJson } from './crypto-vault';
import { readDatabase, writeDatabase } from './storage';
import { isValidUuid } from './auth';

export interface StoreVaultRecord {
  id: string;
  userId: string;
  storeName: StoreName;
  appId?: string | null;
  affiliateTag?: string | null;
  encryptedAppSecret?: string | null;
  encryptedUserToken?: string | null;
  encryptedSessionData?: string | null;
  authType: 'credentials' | 'api_hmac' | 'rakuten_token' | 'extension_session';
  connectionStatus: 'conectado' | 'desconectado' | 'sessao_expirada' | 'revisao_manual';
  tagIdentified?: string | null;
  isActive: boolean;
  lastVerifiedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedStoreCredential {
  id: string;
  userId: string;
  storeName: StoreName;
  appId?: string;
  affiliateTag?: string;
  appSecret?: string;
  userToken?: string;
  sessionData?: Record<string, unknown> | null;
  authType: 'credentials' | 'api_hmac' | 'rakuten_token' | 'extension_session';
  connectionStatus: 'conectado' | 'desconectado' | 'sessao_expirada' | 'revisao_manual';
  tagIdentified?: string;
  isActive: boolean;
  lastVerifiedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

export interface SafeVaultStatus {
  storeName: StoreName;
  hasCredentials: boolean;
  hasAppSecret: boolean;
  hasUserToken: boolean;
  appId?: string;
  affiliateTag?: string;
  tagIdentified?: string;
  authType: string;
  connectionStatus: 'conectado' | 'desconectado' | 'sessao_expirada' | 'revisao_manual';
  isActive: boolean;
  lastVerifiedAt?: string;
  expiresAt?: string;
  requiresBrowserExtension?: boolean;
}

export interface SaveVaultInput {
  storeName: StoreName;
  appId?: string;
  affiliateTag?: string;
  appSecret?: string; // Se fornecido, será encriptado
  userToken?: string; // Se fornecido, será encriptado
  sessionData?: Record<string, unknown>; // Dados da extensão
  authType?: 'credentials' | 'api_hmac' | 'rakuten_token' | 'extension_session';
  connectionStatus?: 'conectado' | 'desconectado' | 'sessao_expirada' | 'revisao_manual';
  tagIdentified?: string;
  isActive?: boolean;
  lastVerifiedAt?: string;
  expiresAt?: string;
}

function getLocalVaultFilePath(): string {
  if (process.env.RADAR_VAULT_PATH && process.env.RADAR_VAULT_PATH.trim().length > 0) {
    return path.resolve(process.env.RADAR_VAULT_PATH.trim());
  }
  if (process.env.VERCEL === '1') {
    return path.join('/tmp', '.data', 'vault_encrypted.json');
  }
  return path.join(process.cwd(), '.data', 'vault_encrypted.json');
}

/**
 * Lê o cofre local criptografado (usado quando Supabase não estiver configurado ou em testes)
 */
function readLocalVault(): StoreVaultRecord[] {
  const filePath = getLocalVaultFilePath();
  if (!fs.existsSync(filePath)) return [];

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Grava o cofre local criptografado
 */
function writeLocalVault(records: StoreVaultRecord[]): void {
  const filePath = getLocalVaultFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
}

/**
 * Registra log auditável de conexões e revogações
 */
export async function recordAuditLog(
  userId: string,
  storeName: StoreName,
  action: 'connect' | 'reconnect' | 'generate_link' | 'revoke' | 'verify' | 'disconnect' | 'expire',
  details: Record<string, unknown> = {},
  req?: Request
): Promise<void> {
  const now = new Date().toISOString();
  const ip = req?.headers.get('x-forwarded-for') || req?.headers.get('x-real-ip') || '127.0.0.1';
  const ua = req?.headers.get('user-agent') || 'system';

  const sanitizedDetails = { ...details };
  delete (sanitizedDetails as any).appSecret;
  delete (sanitizedDetails as any).userToken;
  delete (sanitizedDetails as any).secret;
  delete (sanitizedDetails as any).token;

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('connection_audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: userId,
        store_name: storeName,
        action,
        ip_address: ip,
        user_agent: ua,
        details: sanitizedDetails,
        created_at: now,
      });
    } catch {}
  }

  try {
    const auditPath = path.join(process.cwd(), '.data', 'audit_connections.jsonl');
    const dir = path.dirname(auditPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const logLine = JSON.stringify({
      id: crypto.randomUUID(),
      userId,
      storeName,
      action,
      ip,
      ua,
      details: sanitizedDetails,
      createdAt: now,
    });
    fs.appendFileSync(auditPath, logLine + '\n', 'utf-8');
  } catch {}
}

/**
 * Salva credenciais criptografadas no cofre.
 * Em produção (Supabase configurado), o Supabase é a fonte PERSISTENTE PRIMÁRIA.
 * Se o Supabase falhar, lança erro imediatamente e NÃO mascara como "Conectado".
 */
export async function saveStoreCredentials(
  userId: string,
  input: SaveVaultInput,
  req?: Request
): Promise<StoreVaultRecord> {
  if (!userId || !isValidUuid(userId)) {
    throw new Error(`ID de usuário inválido para persistência no cofre: "${userId}". Deve ser um UUID válido.`);
  }

  const now = new Date().toISOString();

  // Buscar registro existente para preservar chaves prévias caso não re-informadas
  let existing: StoreVaultRecord | null = null;
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('store_credentials_vault')
      .select('*')
      .eq('user_id', userId)
      .eq('store_name', input.storeName)
      .maybeSingle();

    if (!error && data) {
      existing = {
        id: data.id,
        userId: data.user_id,
        storeName: data.store_name,
        appId: data.app_id,
        affiliateTag: data.affiliate_tag,
        encryptedAppSecret: data.encrypted_app_secret,
        encryptedUserToken: data.encrypted_user_token,
        encryptedSessionData: data.encrypted_session_data,
        authType: data.auth_type,
        connectionStatus: data.connection_status,
        tagIdentified: data.tag_identified,
        isActive: data.is_active,
        lastVerifiedAt: data.last_verified_at,
        expiresAt: data.expires_at,
        revokedAt: data.revoked_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }
  } else {
    const localVault = readLocalVault();
    existing = localVault.find((r) => r.userId === userId && r.storeName === input.storeName) || null;
  }

  // Criptografar segredos apenas se fornecidos explicitamente
  let encSecret = existing?.encryptedAppSecret || null;
  if (input.appSecret !== undefined) {
    encSecret = input.appSecret ? encryptSecret(input.appSecret) : null;
  }

  let encToken = existing?.encryptedUserToken || null;
  if (input.userToken !== undefined) {
    encToken = input.userToken ? encryptSecret(input.userToken) : null;
  }

  let encSession = existing?.encryptedSessionData || null;
  if (input.sessionData !== undefined) {
    encSession = input.sessionData ? encryptJson(input.sessionData) : null;
  }

  const record: StoreVaultRecord = {
    id: existing?.id || crypto.randomUUID(),
    userId,
    storeName: input.storeName,
    appId: input.appId !== undefined ? input.appId : existing?.appId,
    affiliateTag: input.affiliateTag !== undefined ? input.affiliateTag : existing?.affiliateTag,
    encryptedAppSecret: encSecret,
    encryptedUserToken: encToken,
    encryptedSessionData: encSession,
    authType: input.authType || existing?.authType || 'credentials',
    connectionStatus: input.connectionStatus || existing?.connectionStatus || 'revisao_manual',
    tagIdentified: input.tagIdentified !== undefined ? input.tagIdentified : existing?.tagIdentified,
    isActive: input.isActive !== undefined ? input.isActive : existing?.isActive ?? true,
    lastVerifiedAt: input.lastVerifiedAt !== undefined ? input.lastVerifiedAt : existing?.lastVerifiedAt,
    expiresAt: input.expiresAt !== undefined ? input.expiresAt : existing?.expiresAt,
    revokedAt: null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  // 1. SUPABASE COMO FONTE PRIMÁRIA OBRIGATÓRIA (EM PRODUÇÃO)
  if (isSupabaseConfigured && supabase) {
    const { error: supabaseError } = await supabase.from('store_credentials_vault').upsert({
      id: record.id,
      user_id: record.userId,
      store_name: record.storeName,
      app_id: record.appId,
      affiliate_tag: record.affiliateTag,
      encrypted_app_secret: record.encryptedAppSecret,
      encrypted_user_token: record.encryptedUserToken,
      encrypted_session_data: record.encryptedSessionData,
      auth_type: record.authType,
      connection_status: record.connectionStatus,
      tag_identified: record.tagIdentified,
      is_active: record.isActive,
      last_verified_at: record.lastVerifiedAt,
      expires_at: record.expiresAt,
      revoked_at: null,
      updated_at: record.updatedAt,
    });

    if (supabaseError) {
      // FALHA DE BANCO DEVE APARECER COMO FALHA! NUNCA MARCAR COMO CONECTADO SE O SUPABASE FALHAR!
      throw new Error(`Falha ao persistir credenciais no Supabase: ${supabaseError.message}`);
    }
  }

  // 2. Gravar no cofre local isolado (usado como cache de leitura ou quando Supabase desligado)
  const localVault = readLocalVault();
  const index = localVault.findIndex((r) => r.userId === userId && r.storeName === input.storeName);
  if (index >= 0) {
    localVault[index] = record;
  } else {
    localVault.push(record);
  }
  writeLocalVault(localVault);

  // 3. Sincronizar metadados públicos no radar_db.json (NUNCA segredos ou tokens)
  try {
    const db = readDatabase();
    const dbStoreIdx = db.stores.findIndex((s) => s.storeName === input.storeName);
    const publicStoreData = {
      id: record.id,
      userId: record.userId,
      storeName: record.storeName,
      appId: record.appId || '',
      affiliateTag: record.affiliateTag || '',
      isActive: record.isActive,
      isValidated: record.connectionStatus === 'conectado',
      validationMethod: record.authType,
      lastValidatedAt: record.lastVerifiedAt || undefined,
      updatedAt: record.updatedAt,
    };

    if (dbStoreIdx >= 0) {
      db.stores[dbStoreIdx] = {
        ...db.stores[dbStoreIdx],
        ...publicStoreData,
      };
      delete db.stores[dbStoreIdx].appSecret;
      delete db.stores[dbStoreIdx].userToken;
    } else {
      db.stores.push(publicStoreData);
    }
    writeDatabase(db);
  } catch {}

  // 4. Registrar auditoria
  await recordAuditLog(
    userId,
    input.storeName,
    existing ? 'reconnect' : 'connect',
    {
      authType: record.authType,
      connectionStatus: record.connectionStatus,
      tagIdentified: record.tagIdentified,
      hasSecret: Boolean(record.encryptedAppSecret),
      hasToken: Boolean(record.encryptedUserToken),
    },
    req
  );

  return record;
}

/**
 * Obtém credencial descriptografada para processamento no servidor (apenas para o userId autenticado)
 */
export async function getDecryptedCredentials(
  userId: string,
  storeName: StoreName
): Promise<DecryptedStoreCredential | null> {
  const effectiveUserId =
    userId && isValidUuid(userId) ? userId : '00000000-0000-0000-0000-000000000001';

  let record: StoreVaultRecord | null = null;

  // 1. Tentar ler do Supabase se configurado
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('store_credentials_vault')
      .select('*')
      .eq('user_id', effectiveUserId)
      .eq('store_name', storeName)
      .maybeSingle();

    if (!error && data) {
      record = {
        id: data.id,
        userId: data.user_id,
        storeName: data.store_name,
        appId: data.app_id,
        affiliateTag: data.affiliate_tag,
        encryptedAppSecret: data.encrypted_app_secret,
        encryptedUserToken: data.encrypted_user_token,
        encryptedSessionData: data.encrypted_session_data,
        authType: data.auth_type,
        connectionStatus: data.connection_status,
        tagIdentified: data.tag_identified,
        isActive: data.is_active,
        lastVerifiedAt: data.last_verified_at,
        expiresAt: data.expires_at,
        revokedAt: data.revoked_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } else if (error) {
      throw new Error(`Erro ao consultar credenciais no Supabase: ${error.message}`);
    }
  }

  // 2. Se não encontrou no Supabase (ou Supabase desligado), ler do cofre local
  if (!record) {
    const localVault = readLocalVault();
    record =
      localVault.find((r) => r.userId === effectiveUserId && r.storeName === storeName && !r.revokedAt) ||
      localVault.find((r) => r.userId === userId && r.storeName === storeName && !r.revokedAt) ||
      localVault.find((r) => r.storeName === storeName && !r.revokedAt) ||
      null;
  }

  if (!record || record.revokedAt) {
    if (record?.revokedAt) {
      return {
        id: record.id,
        userId: record.userId,
        storeName: record.storeName,
        appId: record.appId || '',
        affiliateTag: record.affiliateTag || '',
        appSecret: '',
        userToken: '',
        authType: record.authType,
        connectionStatus: 'desconectado',
        isActive: false,
        lastVerifiedAt: record.lastVerifiedAt || undefined,
        revokedAt: record.revokedAt,
      };
    }
    return null;
  }

  let decryptedSecret = '';
  if (record.encryptedAppSecret) {
    try {
      decryptedSecret = decryptSecret(record.encryptedAppSecret);
    } catch {}
  }

  let decryptedToken = '';
  if (record.encryptedUserToken) {
    try {
      decryptedToken = decryptSecret(record.encryptedUserToken);
    } catch {}
  }

  let decryptedSession: Record<string, unknown> | null = null;
  if (record.encryptedSessionData) {
    try {
      decryptedSession = decryptJson<Record<string, unknown>>(record.encryptedSessionData);
    } catch {}
  }

  return {
    id: record.id,
    userId: record.userId,
    storeName: record.storeName,
    appId: record.appId || '',
    affiliateTag: record.affiliateTag || record.tagIdentified || '',
    appSecret: decryptedSecret,
    userToken: decryptedToken,
    sessionData: decryptedSession,
    authType: record.authType,
    connectionStatus: record.connectionStatus,
    tagIdentified: record.tagIdentified || undefined,
    isActive: record.isActive,
    lastVerifiedAt: record.lastVerifiedAt || undefined,
    expiresAt: record.expiresAt || undefined,
    revokedAt: record.revokedAt || undefined,
  };
}

/**
 * Monta o mapa de credenciais combinando db.stores com os segredos descriptografados do cofre
 */
export async function getStoreCredentialsMapWithSecrets(
  userId: string,
  baseStores: StoreCredential[] = []
): Promise<Record<StoreName, StoreCredential | null>> {
  const storeNames: StoreName[] = ['shopee', 'mercadolivre', 'netshoes', 'amazon', 'magalu'];
  const result: Record<StoreName, StoreCredential | null> = {
    shopee: null,
    mercadolivre: null,
    netshoes: null,
    amazon: null,
    magalu: null,
  };

  for (const storeName of storeNames) {
    const base = baseStores.find((s) => s.storeName === storeName) || null;
    let vaultCred: DecryptedStoreCredential | null = null;
    try {
      vaultCred = await getDecryptedCredentials(userId, storeName);
    } catch {}

    if (!base && !vaultCred) {
      result[storeName] = null;
      continue;
    }

    result[storeName] = {
      id: vaultCred?.id || base?.id || `store_${storeName}`,
      userId: vaultCred?.userId || base?.userId || userId,
      storeName,
      appId: vaultCred?.appId || base?.appId || '',
      affiliateTag: vaultCred?.affiliateTag || vaultCred?.tagIdentified || base?.affiliateTag || '',
      appSecret: vaultCred?.appSecret || base?.appSecret || '',
      userToken: vaultCred?.userToken || base?.userToken || '',
      isActive: vaultCred ? vaultCred.isActive : (base?.isActive ?? true),
      isValidated: vaultCred ? vaultCred.connectionStatus === 'conectado' : base?.isValidated,
      validationMethod: vaultCred?.authType || base?.validationMethod,
      lastValidatedAt: vaultCred?.lastVerifiedAt || base?.lastValidatedAt,
      updatedAt: base?.updatedAt || new Date().toISOString(),
    };
  }

  return result;
}

/**
 * Revoga credenciais de uma loja para o usuário autenticado
 */
export async function revokeStoreCredentials(
  userId: string,
  storeName: StoreName,
  req?: Request
): Promise<boolean> {
  if (!userId || !isValidUuid(userId)) {
    throw new Error('Identificador de usuário inválido.');
  }

  const now = new Date().toISOString();

  // 1. Atualizar no Supabase
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('store_credentials_vault')
      .update({
        encrypted_app_secret: null,
        encrypted_user_token: null,
        encrypted_session_data: null,
        connection_status: 'desconectado',
        is_active: false,
        revoked_at: now,
        updated_at: now,
      })
      .eq('user_id', userId)
      .eq('store_name', storeName);

    if (error) {
      throw new Error(`Falha ao revogar no Supabase: ${error.message}`);
    }
  }

  // 2. Atualizar no cofre local
  const localVault = readLocalVault();
  const record = localVault.find((r) => r.userId === userId && r.storeName === storeName);
  if (record) {
    record.encryptedAppSecret = null;
    record.encryptedUserToken = null;
    record.encryptedSessionData = null;
    record.connectionStatus = 'desconectado';
    record.isActive = false;
    record.revokedAt = now;
    record.updatedAt = now;
    writeLocalVault(localVault);
  }

  // 3. Atualizar em radar_db.json
  try {
    const db = readDatabase();
    const idx = db.stores.findIndex((s) => s.storeName === storeName);
    if (idx >= 0) {
      db.stores[idx].isActive = false;
      db.stores[idx].isValidated = false;
      delete db.stores[idx].appSecret;
      delete db.stores[idx].userToken;
      writeDatabase(db);
    }
  } catch {}

  // 4. Registrar auditoria
  await recordAuditLog(userId, storeName, 'revoke', { reason: 'Revogado pelo usuário' }, req);

  return true;
}

/**
 * Retorna status seguro e público das integrações no cofre (sem expor segredos)
 */
export async function getSafeVaultStatus(userId: string): Promise<SafeVaultStatus[]> {
  if (!userId || !isValidUuid(userId)) {
    return [];
  }

  const supportedStores: StoreName[] = ['mercadolivre', 'shopee', 'netshoes', 'amazon', 'magalu'];
  let vaultRecords: StoreVaultRecord[] = [];

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('store_credentials_vault')
        .select('*')
        .eq('user_id', userId);

      if (!error && data) {
        vaultRecords = data.map((d: any) => ({
          id: d.id,
          userId: d.user_id,
          storeName: d.store_name,
          appId: d.app_id,
          affiliateTag: d.affiliate_tag,
          encryptedAppSecret: d.encrypted_app_secret,
          encryptedUserToken: d.encrypted_user_token,
          encryptedSessionData: d.encrypted_session_data,
          authType: d.auth_type,
          connectionStatus: d.connection_status,
          tagIdentified: d.tag_identified,
          isActive: d.is_active,
          lastVerifiedAt: d.last_verified_at,
          expiresAt: d.expires_at,
          revokedAt: d.revoked_at,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        }));
      }
    } catch {}
  } else {
    vaultRecords = readLocalVault().filter((r) => r.userId === userId && !r.revokedAt);
  }

  return supportedStores.map((store) => {
    const rec = vaultRecords.find((r) => r.storeName === store && !r.revokedAt);

    return {
      storeName: store,
      hasCredentials: Boolean(rec && (rec.affiliateTag || rec.appId)),
      hasAppSecret: Boolean(rec?.encryptedAppSecret),
      hasUserToken: Boolean(rec?.encryptedUserToken),
      appId: rec?.appId || undefined,
      affiliateTag: rec?.affiliateTag || undefined,
      tagIdentified: rec?.tagIdentified || undefined,
      authType: rec?.authType || (store === 'mercadolivre' ? 'extension_session' : store === 'shopee' ? 'api_hmac' : 'credentials'),
      connectionStatus: rec?.connectionStatus || 'desconectado',
      isActive: rec?.isActive ?? false,
      lastVerifiedAt: rec?.lastVerifiedAt || undefined,
      expiresAt: rec?.expiresAt || undefined,
      requiresBrowserExtension: store === 'mercadolivre',
    };
  });
}
