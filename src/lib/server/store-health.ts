import 'server-only';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { StoreName } from '@/lib/types';

export type StoreHealthStatus = 'ok' | 'falhou' | 'sem_teste' | 'nao_configurado';

export interface StoreHealth {
  storeName: StoreName;
  status: StoreHealthStatus;
  reason: string | null;
  lastCheckedAt: string | null;
  lastOkAt: string | null;
}

export interface StoreHealthRepo {
  upsert(userId: string, h: StoreHealth): Promise<void>;
  list(userId: string): Promise<StoreHealth[]>;
}

export const HEALTH_STORES: StoreName[] = ['mercadolivre', 'shopee', 'netshoes', 'amazon', 'magalu'];

export function memoryStoreHealthRepo(): StoreHealthRepo {
  const rows = new Map<string, StoreHealth>();
  return {
    async upsert(userId, h) {
      rows.set(`${userId}:${h.storeName}`, { ...h });
    },
    async list(userId) {
      return [...rows.entries()].filter(([k]) => k.startsWith(`${userId}:`)).map(([, v]) => ({ ...v }));
    },
  };
}

export function supabaseStoreHealthRepo(): StoreHealthRepo {
  return {
    async upsert(userId, h) {
      if (!isSupabaseConfigured || !supabase) throw new Error('Supabase não configurado.');
      const { error } = await supabase.from('store_health').upsert(
        {
          user_id: userId,
          store_name: h.storeName,
          status: h.status,
          reason: h.reason,
          last_checked_at: h.lastCheckedAt,
          last_ok_at: h.lastOkAt,
        },
        { onConflict: 'user_id,store_name' }
      );
      if (error) throw new Error(`Falha ao gravar saúde da loja: ${error.message}`);
    },
    async list(userId) {
      if (!isSupabaseConfigured || !supabase) return [];
      const { data, error } = await supabase
        .from('store_health')
        .select('store_name,status,reason,last_checked_at,last_ok_at')
        .eq('user_id', userId);
      if (error) throw new Error(`Falha ao ler saúde das lojas: ${error.message}`);
      return (data || []).map((r: any) => ({
        storeName: r.store_name,
        status: r.status,
        reason: r.reason ?? null,
        lastCheckedAt: r.last_checked_at ?? null,
        lastOkAt: r.last_ok_at ?? null,
      }));
    },
  };
}

let defaultRepo: StoreHealthRepo | null = null;
function repoOrDefault(repo?: StoreHealthRepo): StoreHealthRepo {
  if (repo) return repo;
  if (!defaultRepo) defaultRepo = isSupabaseConfigured ? supabaseStoreHealthRepo() : memoryStoreHealthRepo();
  return defaultRepo;
}

export async function recordStoreHealth(
  userId: string,
  storeName: StoreName,
  result: { status: StoreHealthStatus; reason?: string },
  repo?: StoreHealthRepo
): Promise<StoreHealth> {
  const r = repoOrDefault(repo);
  const previous = (await r.list(userId)).find(h => h.storeName === storeName);
  const now = new Date().toISOString();
  const health: StoreHealth = {
    storeName,
    status: result.status,
    reason: result.status === 'ok' ? null : result.reason ?? null,
    lastCheckedAt: now,
    lastOkAt: result.status === 'ok' ? now : previous?.lastOkAt ?? null,
  };
  await r.upsert(userId, health);
  return health;
}

export async function getStoreHealthMap(
  userId: string,
  repo?: StoreHealthRepo
): Promise<Record<StoreName, StoreHealth>> {
  const rows = await repoOrDefault(repo).list(userId);
  const map = {} as Record<StoreName, StoreHealth>;
  for (const store of HEALTH_STORES) {
    map[store] = rows.find(h => h.storeName === store) || {
      storeName: store,
      status: 'nao_configurado',
      reason: null,
      lastCheckedAt: null,
      lastOkAt: null,
    };
  }
  return map;
}
