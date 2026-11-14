import 'server-only';
import type { StoreName } from '@/lib/types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  generateMercadoLivreMeliLaDetailed,
  generateShopeeShortLinkDetailed,
  tryGenerateRakutenDeepLink,
  rakutenCredentialsFrom,
  ML_SESSION_EXPIRED_REASON,
  type ShopeeShortLinkResponse,
} from './affiliate-converter';
import { getRakutenAccessToken, findNetshoesAdvertiserId, RakutenAuthError, type RakutenCredentials } from './rakuten-auth';
import { recordStoreHealth, defaultStoreHealthRepo, type StoreHealth, type StoreHealthRepo } from './store-health';
import { getStoreCredentialsMapWithSecrets, saveStoreCredentials } from './credentials-vault';

export const ML_TEST_PRODUCT = 'https://www.mercadolivre.com.br/p/MLB39016247';
// Página inicial: link curto válido para qualquer conta, sem depender de um produto existir.
export const SHOPEE_TEST_URL = 'https://shopee.com.br/';
export const NETSHOES_TEST_URL = 'https://www.netshoes.com.br/';
export const AMAZON_TAG_RE = /^[a-z0-9][a-z0-9-]{1,60}-2\d$/i;
export const SHOPEE_INVALID_REASON = 'AppID ou Senha da Shopee inválidos. Reconecte pela extensão.';
export const RAKUTEN_INVALID_REASON = 'Client ID, Client Secret ou SID da Rakuten inválidos.';
/** Motivos que significam "a credencial está errada" (não instabilidade). */
export const INVALID_CREDENTIAL_REASONS = [SHOPEE_INVALID_REASON, RAKUTEN_INVALID_REASON, ML_SESSION_EXPIRED_REASON];
export const CHECKED_STORES: StoreName[] = ['mercadolivre', 'shopee', 'netshoes', 'amazon'];

export interface StoreCheckDeps {
  repo: StoreHealthRepo;
  getCredentials(userId: string): Promise<Partial<Record<StoreName, any>>>;
  saveNetshoesAdvertiserId(userId: string, id: string): Promise<void>;
  meliLa(url: string, tag: string, cookies: string): Promise<{ link: string | null; unauthorized: boolean }>;
  shopee(url: string, appId: string, appSecret: string): Promise<ShopeeShortLinkResponse>;
  rakutenToken(c: RakutenCredentials): Promise<string>;
  findNetshoes(c: RakutenCredentials): Promise<string | null>;
  deepLink(url: string, advertiserId: string, c: RakutenCredentials): Promise<string | null>;
  listUsers(): Promise<string[]>;
}

export function defaultStoreCheckDeps(): StoreCheckDeps {
  return {
    repo: defaultStoreHealthRepo(),
    getCredentials: userId => getStoreCredentialsMapWithSecrets(userId) as any,
    async saveNetshoesAdvertiserId(userId, id) {
      const current = (await getStoreCredentialsMapWithSecrets(userId)).netshoes as any;
      await saveStoreCredentials(userId, { storeName: 'netshoes', sessionData: { ...(current?.sessionData || {}), netshoesAdvertiserId: id } });
    },
    meliLa: generateMercadoLivreMeliLaDetailed,
    shopee: (url, appId, appSecret) => generateShopeeShortLinkDetailed(url, appId, appSecret),
    rakutenToken: c => getRakutenAccessToken(c, { forceRefresh: true }),
    findNetshoes: findNetshoesAdvertiserId,
    deepLink: tryGenerateRakutenDeepLink,
    // Quem foi testado há mais tempo vem primeiro: ninguém fica para trás se o prazo acabar.
    async listUsers() {
      if (!isSupabaseConfigured || !supabase) return [];
      const { data } = await supabase.from('store_credentials_vault').select('user_id').eq('is_active', true).is('revoked_at', null);
      const users = [...new Set((data || []).map((r: any) => String(r.user_id)))];
      const { data: health } = await supabase.from('store_health').select('user_id,last_checked_at');
      const oldest = new Map<string, number>();
      for (const h of health || []) {
        const t = h.last_checked_at ? Date.parse(h.last_checked_at) : 0;
        const u = String(h.user_id);
        oldest.set(u, Math.min(oldest.get(u) ?? Infinity, t));
      }
      return users.sort((a, b) => (oldest.get(a) ?? 0) - (oldest.get(b) ?? 0));
    },
  };
}

type Result = { status: StoreHealth['status']; reason?: string };

async function evaluate(userId: string, store: StoreName, d: StoreCheckDeps): Promise<Result> {
  const all = await d.getCredentials(userId);
  const raw = all?.[store];
  // Desativada ou revogada no cofre = não configurada (nunca mostrar status de uma credencial que não vale).
  const c = raw && raw.isActive !== false && !raw.revokedAt ? raw : null;
  if (store === 'mercadolivre') {
    const cookies = String(c?.userToken || c?.sessionData?.cookies || '');
    if (!c || !c.affiliateTag || !cookies) return { status: 'nao_configurado' };
    const r = await d.meliLa(ML_TEST_PRODUCT, c.affiliateTag, cookies);
    if (r.link) return { status: 'ok' };
    if (r.unauthorized) return { status: 'falhou', reason: ML_SESSION_EXPIRED_REASON };
    return { status: 'falhou', reason: 'Não consegui testar o Mercado Livre agora. Tento de novo no próximo teste.' };
  }
  if (store === 'shopee') {
    if (!c?.appId || !c?.appSecret) return { status: 'nao_configurado' };
    const r = await d.shopee(SHOPEE_TEST_URL, c.appId, c.appSecret);
    if (r.ok && r.shortLink) return { status: 'ok' };
    if (r.httpStatus === 401 || r.httpStatus === 403 || /signature|unauthori[sz]ed|authentication|credential/i.test(r.errorMessage || '')) {
      return { status: 'falhou', reason: SHOPEE_INVALID_REASON };
    }
    return { status: 'falhou', reason: 'Não consegui testar a Shopee agora. Tento de novo no próximo teste.' };
  }
  if (store === 'netshoes') {
    const rc = rakutenCredentialsFrom(c);
    if (!rc.clientId && !rc.clientSecret && !rc.sid) return { status: 'nao_configurado' };
    if (!rc.clientId || !rc.clientSecret) return { status: 'falhou', reason: 'Falta abrir a página de desenvolvedor (Client ID/Secret) e conectar pela extensão.' };
    if (!rc.sid) return { status: 'falhou', reason: 'Falta abrir a página do publisher (SID) e conectar pela extensão.' };
    try {
      await d.rakutenToken(rc);
    } catch (e) {
      if (e instanceof RakutenAuthError && e.code === 'credenciais_invalidas') return { status: 'falhou', reason: RAKUTEN_INVALID_REASON };
      return { status: 'falhou', reason: 'Não consegui falar com a Rakuten agora. Tento de novo no próximo teste.' };
    }
    const advertiserId = await d.findNetshoes(rc);
    if (!advertiserId) return { status: 'falhou', reason: 'Sua conta Rakuten não tem parceria ativa com a Netshoes.' };
    if (advertiserId !== String(c?.sessionData?.netshoesAdvertiserId || '')) await d.saveNetshoesAdvertiserId(userId, advertiserId);
    const link = await d.deepLink(NETSHOES_TEST_URL, advertiserId, rc);
    return link ? { status: 'ok' } : { status: 'falhou', reason: 'A Rakuten não gerou o link de teste da Netshoes.' };
  }
  if (store === 'amazon') {
    const tag = String(c?.affiliateTag || '').trim();
    if (!tag) return { status: 'nao_configurado' };
    return AMAZON_TAG_RE.test(tag)
      ? { status: 'sem_teste', reason: 'Tag salva. A Amazon não permite teste sem API.' }
      : { status: 'falhou', reason: 'Tag da Amazon em formato inválido (ex.: seunome-20).' };
  }
  return { status: 'nao_configurado' };
}

export async function checkStoreConnection(userId: string, store: StoreName, deps?: StoreCheckDeps): Promise<StoreHealth> {
  const d = deps || defaultStoreCheckDeps();
  let result: Result;
  try {
    result = await evaluate(userId, store, d);
  } catch {
    result = { status: 'falhou', reason: 'Erro inesperado ao testar a conexão. Tento de novo no próximo teste.' };
  }
  return recordStoreHealth(userId, store, result, d.repo);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve('timeout'), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve('timeout'); });
  });
}

export async function runDailyStoreHealth(
  opts: { deadlineAt?: number; perStoreTimeoutMs?: number; concurrency?: number; deps?: StoreCheckDeps } = {}
): Promise<{ checked: number; failed: number }> {
  const d = opts.deps || defaultStoreCheckDeps();
  const perStore = opts.perStoreTimeoutMs ?? 15_000;
  const queue = [...(await d.listUsers())];
  let checked = 0;
  let failed = 0;

  const checkUser = async (userId: string) => {
    const creds = await d.getCredentials(userId).catch(() => ({} as any));
    const stores = CHECKED_STORES.filter(s => creds?.[s]);
    const results = await Promise.allSettled(
      stores.map(async store => {
        const r = await withTimeout(checkStoreConnection(userId, store, d), perStore);
        if (r !== 'timeout') return r;
        return recordStoreHealth(userId, store, { status: 'falhou', reason: 'O teste demorou demais. Tento de novo no próximo teste.' }, d.repo);
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        checked++;
        if (r.value.status === 'falhou') failed++;
      }
    }
  };

  const worker = async () => {
    while (queue.length) {
      if (opts.deadlineAt && Date.now() > opts.deadlineAt) return;
      const userId = queue.shift()!;
      try {
        await checkUser(userId);
      } catch {
        // falha de um usuário não interrompe os demais
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 5) }, worker));
  return { checked, failed };
}
