import 'server-only';
import { createHash, randomBytes } from 'crypto';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { decryptJson, decryptSecret, encryptJson, encryptSecret } from '@/lib/server/crypto-vault';

/*
 * API oficial do Mercado Livre pelo aplicativo do Radar (OAuth com PKCE), só leitura.
 * Uso: foto do produto para o assistente (o ML não deixa ler a página do produto a partir do servidor).
 * O acesso fica cifrado no cofre (store_name 'mercadolivre_api') e é renovado sozinho (vence em ~6 h).
 */

const STORE = 'mercadolivre_api';
const API = 'https://api.mercadolibre.com';
/** Endereço de retorno cadastrado no aplicativo do ML em 14/11 (domínio antigo, que continua no ar). */
export const ML_REDIRECT_URI = 'https://painel-de-ofertas.vercel.app/api/integrations/mercadolivre/oauth/callback';

export function mlAppConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = (process.env.ML_APP_CLIENT_ID || process.env.ML_CLIENT_ID || '').trim();
  const clientSecret = (process.env.ML_APP_CLIENT_SECRET || process.env.ML_CLIENT_SECRET || '').trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Monta o endereço de autorização. O retorno cai no domínio antigo (onde não há o login do painel),
 * então o state leva, cifrados (AES-256-GCM), a conta, o verificador PKCE e a validade de 10 min.
 */
export function buildAuthorization(userId: string): { url: string } | null {
  const app = mlAppConfig();
  if (!app) return null;
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = encryptJson({ u: userId, v: verifier, e: Date.now() + 10 * 60 * 1000, n: b64url(randomBytes(8)) });
  const url = new URL('https://auth.mercadolivre.com.br/authorization');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', app.clientId);
  url.searchParams.set('redirect_uri', ML_REDIRECT_URI);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  return { url: url.toString() };
}

/** Abre o state devolvido pelo ML; inválido, adulterado ou vencido → null. */
export function readState(state: string): { userId: string; verifier: string } | null {
  try {
    const data = decryptJson<{ u?: string; v?: string; e?: number }>(state);
    if (!data?.u || !data.v || !data.e || data.e < Date.now()) return null;
    return { userId: data.u, verifier: data.v };
  } catch { return null; }
}

interface Tokens { accessToken: string; refreshToken: string; expiresAt: number; mlUserId?: string }

function db() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Banco de dados não configurado.');
  return supabase;
}

async function saveTokens(userId: string, tokens: Tokens) {
  const { error } = await db().from('store_credentials_vault').upsert({
    user_id: userId,
    store_name: STORE,
    auth_type: 'credentials',
    connection_status: 'conectado',
    is_active: true,
    encrypted_user_token: encryptSecret(tokens.accessToken),
    encrypted_session_data: encryptJson({ refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, mlUserId: tokens.mlUserId }),
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,store_name' });
  if (error) throw new Error(`Não consegui guardar o acesso do Mercado Livre: ${error.message}`);
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const app = mlAppConfig();
  if (!app) throw new Error('Chaves do aplicativo do Mercado Livre não configuradas no servidor.');
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, ...body }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => null) as Record<string, any> | null;
  if (!res.ok || !data?.access_token) throw new Error(`O Mercado Livre recusou a autorização (${data?.error || res.status}).`);
  return {
    accessToken: String(data.access_token),
    refreshToken: String(data.refresh_token || body.refresh_token || ''),
    expiresAt: Date.now() + (Number(data.expires_in) || 21600) * 1000,
    mlUserId: data.user_id ? String(data.user_id) : undefined,
  };
}

/** Troca o código da autorização pelo acesso e guarda cifrado. */
export async function completeAuthorization(userId: string, code: string, verifier: string): Promise<void> {
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: ML_REDIRECT_URI, code_verifier: verifier });
  await saveTokens(userId, tokens);
}

export async function mlApiStatus(userId: string): Promise<{ connected: boolean; configured: boolean }> {
  const configured = Boolean(mlAppConfig());
  try {
    const { data } = await db().from('store_credentials_vault').select('connection_status,is_active')
      .eq('user_id', userId).eq('store_name', STORE).maybeSingle();
    return { configured, connected: Boolean(data?.is_active && data.connection_status === 'conectado') };
  } catch { return { configured, connected: false }; }
}

/** Acesso válido (renova sozinho quando faltam menos de 10 min). Sem conexão → null. */
export async function mlAccessToken(userId: string): Promise<string | null> {
  const { data } = await db().from('store_credentials_vault').select('*').eq('user_id', userId).eq('store_name', STORE).maybeSingle();
  if (!data?.is_active || data.connection_status !== 'conectado') return null;
  const session = decryptJson<{ refreshToken?: string; expiresAt?: number; mlUserId?: string }>(data.encrypted_session_data) || {};
  const access = decryptSecret(data.encrypted_user_token);
  if (access && session.expiresAt && session.expiresAt - Date.now() > 10 * 60 * 1000) return access;
  if (!session.refreshToken) return null;
  try {
    const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: session.refreshToken });
    await saveTokens(userId, { ...tokens, mlUserId: tokens.mlUserId || session.mlUserId });
    return tokens.accessToken;
  } catch {
    await db().from('store_credentials_vault').update({ connection_status: 'sessao_expirada', updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('store_name', STORE);
    return null;
  }
}

const firstPicture = (data: any): string | null => {
  const pics = Array.isArray(data?.pictures) ? data.pictures : [];
  const url = pics[0]?.secure_url || pics[0]?.url || data?.thumbnail || null;
  return url ? String(url).replace(/^http:\/\//, 'https://') : null;
};

/** Foto do produto pelo código no endereço (catálogo MLB, produto de vendedor MLBU ou anúncio MLB-). */
export async function mlProductPhoto(userId: string, productKey: string | null): Promise<string | null> {
  if (!productKey) return null;
  const token = await mlAccessToken(userId).catch(() => null);
  if (!token) return null;
  const tries = /^MLBU/i.test(productKey)
    ? [`/user-products/${productKey}`]
    : [`/products/${productKey}`, `/items/${productKey}`];
  for (const path of tries) {
    try {
      const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const photo = firstPicture(await res.json());
      if (photo) return photo;
    } catch { /* tenta o próximo */ }
  }
  return null;
}
