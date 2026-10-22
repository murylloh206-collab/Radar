import "server-only";

import crypto from "node:crypto";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";
import { isShopeeConfigured } from "./config";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * COFRE DE SESSÃO SERVER-SIDE (AES-256-GCM)
 * -----------------------------------------
 * Regras estritas:
 * 1. NUNCA expõe cookies ou tokens brutos no frontend, logs ou retornos de API.
 * 2. Criptografa o estado de sessão com chave de 256 bits gerenciada por variável de ambiente.
 * 3. Persiste no Supabase PostgreSQL (tabela app_metadata) ou fallback seguro em arquivo de desenvolvimento.
 * 4. Expõe diagnósticos higienizados (status, provedor, validade, expiração).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recomendado para GCM
const AUTH_TAG_LENGTH = 16;

export interface EncryptedPayload {
  iv: string; // hex
  authTag: string; // hex
  ciphertext: string; // hex
  version: number;
}

export interface SessionStatusDiagnostic {
  provider: "mercadolivre" | "shopee";
  status: "conectado" | "expirado" | "inexistente" | "chave_ausente" | "storage_indisponivel" | "bloqueado";
  updatedAt: string | null;
  expiresAt: string | null;
  lastValidationAt: string | null;
  lastErrorSanitized: string | null;
  actionRequired: string | null;
  environment: "supabase_postgresql" | "local_encrypted_storage" | "shopee_open_api";
}

export interface StoredSessionData {
  rawCookie: string;
  csrfToken?: string | null;
  userAgent?: string;
  savedAt: string;
  expiresAt?: string;
  lastValidatedAt?: string;
  isValid?: boolean;
}

/** Obtém ou deriva a chave mestra de criptografia de 256 bits (32 bytes) */
function getMasterKey(): Buffer | null {
  const secret = process.env.SESSION_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.trim().length < 16) {
    return null;
  }
  // Deriva consistentemente uma chave de 32 bytes via SHA-256
  return crypto.createHash("sha256").update(secret.trim()).digest();
}

/** Criptografa dados em formato AES-256-GCM */
export function encryptSession(plainText: string): EncryptedPayload {
  const key = getMasterKey();
  if (!key) {
    throw new Error("Chave de criptografia de sessão ausente ou inválida. Configure SESSION_ENCRYPTION_KEY.");
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  
  let ciphertext = cipher.update(plainText, "utf8", "hex");
  ciphertext += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    iv: iv.toString("hex"),
    authTag,
    ciphertext,
    version: 1,
  };
}

/** Decriptografa dados AES-256-GCM */
export function decryptSession(payload: EncryptedPayload): string {
  const key = getMasterKey();
  if (!key) {
    throw new Error("Chave de criptografia de sessão ausente. Configure SESSION_ENCRYPTION_KEY.");
  }

  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.authTag, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(payload.ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

const LOCAL_SESSION_FILE = path.resolve(process.cwd(), "data", ".sessions_vault.json");

/** Salva sessão criptografada no Supabase PostgreSQL ou armazenamento local */
export async function saveEncryptedSession(
  provider: "mercadolivre" | "shopee",
  data: StoredSessionData
): Promise<void> {
  const payload = encryptSession(JSON.stringify(data));
  const metadataKey = `session_vault_${provider}`;

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("app_metadata").upsert({
        key: metadataKey,
        value: payload as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        throw new Error(`Erro ao salvar sessão no Supabase: ${error.message}`);
      }
      return;
    } catch (err) {
      if (process.env.VERCEL || process.env.NODE_ENV === "production") {
        throw err;
      }
    }
  }

  // Fallback local seguro (conteúdo criptografado)
  await fs.mkdir(path.dirname(LOCAL_SESSION_FILE), { recursive: true });
  let currentVault: Record<string, EncryptedPayload> = {};
  try {
    const raw = await fs.readFile(LOCAL_SESSION_FILE, "utf8");
    currentVault = JSON.parse(raw);
  } catch {
    // vazio
  }
  currentVault[provider] = payload;
  await fs.writeFile(LOCAL_SESSION_FILE, JSON.stringify(currentVault, null, 2), "utf8");
}

/** Carrega sessão decriptografada exclusivamente na memória do servidor */
export async function loadDecryptedSession(
  provider: "mercadolivre" | "shopee"
): Promise<StoredSessionData | null> {
  const key = getMasterKey();
  if (!key) return null;

  const metadataKey = `session_vault_${provider}`;
  let payload: EncryptedPayload | null = null;

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("app_metadata")
        .select("value")
        .eq("key", metadataKey)
        .maybeSingle();

      if (!error && data?.value) {
        payload = data.value as unknown as EncryptedPayload;
      }
    } catch {
      // continua para fallback local se em dev
    }
  }

  if (!payload) {
    try {
      const raw = await fs.readFile(LOCAL_SESSION_FILE, "utf8");
      const vault = JSON.parse(raw) as Record<string, EncryptedPayload>;
      payload = vault[provider] || null;
    } catch {
      // sem arquivo
    }
  }

  if (!payload || !payload.ciphertext || !payload.iv || !payload.authTag) {
    return null;
  }

  try {
    const jsonStr = decryptSession(payload);
    return JSON.parse(jsonStr) as StoredSessionData;
  } catch (err) {
    console.warn(`[session-vault] Falha ao decriptografar sessão para ${provider}:`, err);
    return null;
  }
}

/** Remove com segurança a sessão armazenada */
export async function clearSession(provider: "mercadolivre" | "shopee"): Promise<void> {
  const metadataKey = `session_vault_${provider}`;

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from("app_metadata").delete().eq("key", metadataKey);
    } catch {
      // ignore
    }
  }

  try {
    const raw = await fs.readFile(LOCAL_SESSION_FILE, "utf8");
    const vault = JSON.parse(raw) as Record<string, EncryptedPayload>;
    delete vault[provider];
    await fs.writeFile(LOCAL_SESSION_FILE, JSON.stringify(vault, null, 2), "utf8");
  } catch {
    // ignore
  }
}

/** Retorna diagnóstico seguro e higienizado da sessão para o painel */
export async function getSessionDiagnostic(
  provider: "mercadolivre" | "shopee"
): Promise<SessionStatusDiagnostic> {
  // Provedor Shopee utiliza autenticação nativa Open API (App ID e Secret) + Cofre de Favoritos
  if (provider === "shopee") {
    const hasOpenApi = isShopeeConfigured();
    const shopeeSession = await loadDecryptedSession("shopee").catch(() => null);
    const hasSessionCookie = Boolean(shopeeSession?.rawCookie);

    if (hasOpenApi) {
      return {
        provider: "shopee",
        status: "conectado",
        updatedAt: shopeeSession?.savedAt || new Date().toISOString(),
        expiresAt: shopeeSession?.expiresAt || null,
        lastValidationAt: new Date().toISOString(),
        lastErrorSanitized: null,
        actionRequired: hasSessionCookie
          ? null
          : "Sessão de favoritos opcional. Cole o cookie ou links para puxar favoritos 1-click.",
        environment: "shopee_open_api",
      };
    }
    return {
      provider: "shopee",
      status: "inexistente",
      updatedAt: null,
      expiresAt: null,
      lastValidationAt: null,
      lastErrorSanitized: null,
      actionRequired: "Configurar variáveis SHOPEE_AFFILIATE_APP_ID e SHOPEE_AFFILIATE_SECRET.",
      environment: "shopee_open_api",
    };
  }

  const masterKey = getMasterKey();
  const environment = isSupabaseConfigured() ? "supabase_postgresql" : "local_encrypted_storage";

  if (!masterKey) {
    return {
      provider,
      status: "chave_ausente",
      updatedAt: null,
      expiresAt: null,
      lastValidationAt: null,
      lastErrorSanitized: "Chave de criptografia SESSION_ENCRYPTION_KEY não configurada.",
      actionRequired: "Definir variável de ambiente SESSION_ENCRYPTION_KEY.",
      environment,
    };
  }

  const session = await loadDecryptedSession(provider);

  if (!session || !session.rawCookie) {
    return {
      provider,
      status: "inexistente",
      updatedAt: null,
      expiresAt: null,
      lastValidationAt: null,
      lastErrorSanitized: null,
      actionRequired: "Autenticar ou configurar sessão no painel administrativo.",
      environment,
    };
  }

  // Verifica expiração aproximada se gravada
  const isExpired = session.expiresAt ? new Date(session.expiresAt).getTime() < Date.now() : false;

  if (isExpired || session.isValid === false) {
    return {
      provider,
      status: "expirado",
      updatedAt: session.savedAt || null,
      expiresAt: session.expiresAt || null,
      lastValidationAt: session.lastValidatedAt || null,
      lastErrorSanitized: "A sessão foi invalidada ou expirou no provedor (401/403).",
      actionRequired: "Realizar reautenticação segura.",
      environment,
    };
  }

  return {
    provider,
    status: "conectado",
    updatedAt: session.savedAt || null,
    expiresAt: session.expiresAt || null,
    lastValidationAt: session.lastValidatedAt || null,
    lastErrorSanitized: null,
    actionRequired: null,
    environment,
  };
}
