import 'server-only';
import type { StoreName } from '@/lib/types';
import { getStoreCredentialsMapWithSecrets, saveStoreCredentials, type SaveVaultInput } from './credentials-vault';
import { getStoreHealthMap, defaultStoreHealthRepo, type StoreHealth, type StoreHealthRepo, type StoreHealthStatus } from './store-health';
import { checkStoreConnection, defaultStoreCheckDeps, AMAZON_TAG_RE, INVALID_CREDENTIAL_REASONS } from './store-health-checks';

export type ConnectPayload =
  | { store: 'mercadolivre'; cookies: string; tag?: string }
  | { store: 'rakuten'; clientId?: string; clientSecret?: string; sid?: string }
  | { store: 'shopee'; appId: string; appSecret: string }
  | { store: 'amazon'; tag: string };

export interface StoreStatusView {
  store: StoreName;
  status: StoreHealthStatus;
  reason: string | null;
  lastCheckedAt: string | null;
  hint: string | null;
  /** Aviso pontual da conexão (ex.: dados lidos não funcionaram e a conexão anterior foi mantida). */
  notice?: string;
}

export class ConnectError extends Error {
  status = 400;
}

export interface StoreConnectDeps {
  repo: StoreHealthRepo;
  getCredentials(userId: string): Promise<Partial<Record<StoreName, any>>>;
  save(userId: string, input: SaveVaultInput): Promise<void>;
  check(userId: string, store: StoreName): Promise<StoreHealth>;
}

export function defaultStoreConnectDeps(): StoreConnectDeps {
  const checkDeps = defaultStoreCheckDeps();
  return {
    repo: checkDeps.repo,
    getCredentials: userId => getStoreCredentialsMapWithSecrets(userId) as any,
    save: async (userId, input) => { await saveStoreCredentials(userId, input); },
    check: (userId, store) => checkStoreConnection(userId, store, checkDeps),
  };
}

export const VIEW_STORES: StoreName[] = ['mercadolivre', 'shopee', 'netshoes', 'amazon'];
const CLIENT_RE = /^[A-Za-z0-9]{20,64}$/;
const SID_RE = /^\d{5,9}$/;
const SHOPEE_ID_RE = /^\d{6,15}$/;
const ML_TAG_RE = /^[A-Za-z0-9_.-]{3,60}$/;
const clean = (v: unknown) => String(v ?? '').trim();

function invalid(message: string): never {
  throw new ConnectError(message);
}

const SNAPSHOT_FIELDS = ['appId', 'appSecret', 'affiliateTag', 'userToken'] as const;

export async function connectStore(userId: string, payload: ConnectPayload, deps?: StoreConnectDeps): Promise<StoreStatusView> {
  const d = deps || defaultStoreConnectDeps();
  const now = new Date().toISOString();
  const storeOf = (p: ConnectPayload | null | undefined): StoreName | null =>
    p?.store === 'rakuten' ? 'netshoes' : p?.store && ['mercadolivre', 'shopee', 'amazon'].includes(p.store) ? (p.store as StoreName) : null;
  const target = storeOf(payload);
  const before = target ? (await d.getCredentials(userId))?.[target] : null;
  let store: StoreName;

  if (payload?.store === 'mercadolivre') {
    const cookies = clean(payload.cookies);
    if (!/(^|;\s*)ssid=/.test(cookies)) invalid('Não encontrei a sessão do Mercado Livre. Entre na sua conta de afiliado e tente de novo.');
    const existing = (await d.getCredentials(userId))?.mercadolivre;
    const tag = clean(payload.tag) || clean(existing?.affiliateTag);
    if (!tag) invalid('Informe sua etiqueta de afiliado do Mercado Livre.');
    if (!ML_TAG_RE.test(tag)) invalid('Etiqueta do Mercado Livre em formato inválido.');
    store = 'mercadolivre';
    await d.save(userId, { storeName: store, affiliateTag: tag, tagIdentified: tag, userToken: cookies, authType: 'extension_session', isActive: true, lastVerifiedAt: now });
  } else if (payload?.store === 'rakuten') {
    const clientId = clean(payload.clientId);
    const clientSecret = clean(payload.clientSecret);
    const sid = clean(payload.sid);
    if (!clientId && !clientSecret && !sid) invalid('Nenhum dado da Rakuten foi enviado.');
    if ((clientId || clientSecret) && (!CLIENT_RE.test(clientId) || !CLIENT_RE.test(clientSecret))) invalid('Client ID e Client Secret da Rakuten em formato inválido.');
    if (sid && !SID_RE.test(sid)) invalid('SID da Rakuten em formato inválido (são só números).');
    store = 'netshoes';
    await d.save(userId, {
      storeName: store,
      appId: clientId || undefined,
      appSecret: clientSecret || undefined,
      affiliateTag: sid || undefined,
      authType: 'rakuten_token',
      isActive: true,
      lastVerifiedAt: now,
    });
  } else if (payload?.store === 'shopee') {
    const appId = clean(payload.appId);
    const appSecret = clean(payload.appSecret);
    if (!SHOPEE_ID_RE.test(appId) || !CLIENT_RE.test(appSecret)) invalid('AppID ou Senha da Shopee em formato inválido.');
    store = 'shopee';
    await d.save(userId, { storeName: store, appId, appSecret, authType: 'api_hmac', isActive: true, lastVerifiedAt: now });
  } else if (payload?.store === 'amazon') {
    const tag = clean(payload.tag);
    if (!AMAZON_TAG_RE.test(tag)) invalid('Tag da Amazon em formato inválido (ex.: seunome-20).');
    store = 'amazon';
    await d.save(userId, { storeName: store, affiliateTag: tag, tagIdentified: tag, authType: 'credentials', isActive: true, lastVerifiedAt: now });
  } else {
    invalid('Loja não suportada pela extensão.');
  }

  let health = await d.check(userId, store);
  let notice: string | undefined;
  const hadWorking = before && SNAPSHOT_FIELDS.some(f => clean(before[f]));
  if (health.status === 'falhou' && hadWorking && INVALID_CREDENTIAL_REASONS.includes(health.reason || '')) {
    // Os dados novos estão errados: volta a credencial anterior e confere de novo.
    const restore: SaveVaultInput = { storeName: store };
    for (const f of SNAPSHOT_FIELDS) (restore as any)[f] = clean(before[f]) || undefined;
    await d.save(userId, restore);
    health = await d.check(userId, store);
    notice = 'Os dados lidos foram recusados pela loja; mantive a conexão anterior.';
  }
  const creds = await d.getCredentials(userId);
  return { ...toView(health, creds?.[store], store), ...(notice ? { notice } : {}) };
}

function lastDigits(v: unknown, n = 4): string | null {
  const s = clean(v);
  return s ? `termina em ${s.slice(-n)}` : null;
}

function hintFor(store: StoreName, c: any): string | null {
  if (!c) return null;
  if (store === 'mercadolivre' || store === 'amazon') return lastDigits(c.affiliateTag);
  if (store === 'shopee') return lastDigits(c.appId);
  if (store === 'netshoes') return c.affiliateTag ? `SID ${lastDigits(c.affiliateTag, 3)}` : null;
  return null;
}

const hasAnyCredential = (c: any) =>
  Boolean(c && c.isActive !== false && !c.revokedAt && [c.appId, c.appSecret, c.affiliateTag, c.userToken].some(v => clean(v)));

function toView(h: StoreHealth, c: any, store: StoreName): StoreStatusView {
  // Credencial salva antes do status real existir: mostra "ainda não testado" (com botão), não "não configurado".
  if (h.status === 'nao_configurado' && hasAnyCredential(c)) {
    return { store, status: 'sem_teste', reason: 'Ainda não testado.', lastCheckedAt: null, hint: hintFor(store, c) };
  }
  return { store, status: h.status, reason: h.reason, lastCheckedAt: h.lastCheckedAt, hint: hintFor(store, c) };
}

export async function getStoreStatusViews(userId: string, deps?: Pick<StoreConnectDeps, 'repo' | 'getCredentials'>): Promise<StoreStatusView[]> {
  const repo = deps?.repo || defaultStoreHealthRepo();
  const getCredentials = deps?.getCredentials || ((u: string) => getStoreCredentialsMapWithSecrets(u) as any);
  const [map, creds] = await Promise.all([getStoreHealthMap(userId, repo), getCredentials(userId)]);
  return VIEW_STORES.map(store => toView(map[store], creds?.[store], store));
}
