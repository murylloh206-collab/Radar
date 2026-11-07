import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ADMIN_UUID } from './auth';
import { isDevEnvironment } from './plan-guard';
import {
  appendChannelSrcParam,
  normalizeStoreSlug,
  formatStoreDisplayName,
  resolveClickOrigin,
  type ClickOrigin,
} from '@/lib/offer-format';

export {
  appendChannelSrcParam,
  normalizeStoreSlug,
  formatStoreDisplayName,
  resolveClickOrigin,
  type ClickOrigin,
};

export interface TrackedLinkRecord {
  id: string;
  userId: string;
  code: string;
  destinationUrl: string;
  store: string;
  productTitle: string;
  originDefault: ClickOrigin;
  clicksCount: number;
  lastClickedAt: string | null;
  createdAt: string;
  isTest?: boolean;
}

export interface ClickEventRecord {
  id: string;
  userId: string;
  code: string;
  destinationUrl: string;
  store: string;
  productTitle: string;
  origin: ClickOrigin;
  userAgent: string;
  referer: string;
  createdAt: string;
  isTest?: boolean;
}

const LOCAL_TRACKED_LINKS_FILE = path.join(process.cwd(), '.data', 'tracked_links.json');
const LOCAL_CLICK_EVENTS_FILE = path.join(process.cwd(), '.data', 'click_events.json');

function readLocalJsonArray<T>(filePath: string): T[] {
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function writeLocalJsonArray<T>(filePath: string, data: T[]): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data.slice(0, 5000), null, 2), 'utf-8');
  } catch {}
}

export function generateShortCodeForUrl(destinationUrl: string, origin: ClickOrigin = 'whatsapp'): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${destinationUrl.trim()}::${origin}`)
    .digest('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 10);
  return hash || 'oferta';
}

/**
 * Cria ou recupera um link rastreado `/r/[code]` associado a um produto, loja e origem.
 */
export async function registerTrackedLink(input: {
  userId?: string;
  code?: string;
  destinationUrl: string;
  store?: string;
  productTitle?: string;
  originDefault?: ClickOrigin;
  isTest?: boolean;
}): Promise<TrackedLinkRecord> {
  const userId = input.userId || ADMIN_UUID;
  const originDefault: ClickOrigin = input.originDefault || 'whatsapp';
  const code = (input.code || generateShortCodeForUrl(input.destinationUrl, originDefault)).trim();
  const store = normalizeStoreSlug(input.store, input.destinationUrl);
  const productTitle = (input.productTitle || 'Oferta Verificada').trim();
  const now = new Date().toISOString();
  const isTest = Boolean(input.isTest);

  const localLinks = readLocalJsonArray<TrackedLinkRecord>(LOCAL_TRACKED_LINKS_FILE);
  const existingIdx = localLinks.findIndex((l) => l.code === code);

  let record: TrackedLinkRecord;
  if (existingIdx >= 0) {
    record = {
      ...localLinks[existingIdx],
      destinationUrl: input.destinationUrl || localLinks[existingIdx].destinationUrl,
      store: store || localLinks[existingIdx].store,
      productTitle: productTitle || localLinks[existingIdx].productTitle,
      originDefault: input.originDefault || localLinks[existingIdx].originDefault,
      isTest: input.isTest !== undefined ? isTest : Boolean(localLinks[existingIdx].isTest),
    };
    localLinks[existingIdx] = record;
  } else {
    record = {
      id: crypto.randomUUID(),
      userId,
      code,
      destinationUrl: input.destinationUrl,
      store,
      productTitle,
      originDefault,
      clicksCount: 0,
      lastClickedAt: null,
      createdAt: now,
      isTest,
    };
    localLinks.unshift(record);
  }

  writeLocalJsonArray(LOCAL_TRACKED_LINKS_FILE, localLinks);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('tracked_links').upsert(
        {
          user_id: userId,
          code,
          destination_url: record.destinationUrl,
          store: record.store,
          product_title: record.productTitle,
          origin_default: record.originDefault,
          is_test: Boolean(record.isTest),
        },
        { onConflict: 'code' }
      );
    } catch {}
  }

  return record;
}

export async function findTrackedLinkByCode(code: string): Promise<TrackedLinkRecord | null> {
  const cleanCode = code.trim();
  if (!cleanCode) return null;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('tracked_links')
        .select('*')
        .eq('code', cleanCode)
        .maybeSingle();

      if (!error && data?.destination_url) {
        return {
          id: data.id,
          userId: data.user_id || ADMIN_UUID,
          code: data.code,
          destinationUrl: data.destination_url,
          store: normalizeStoreSlug(data.store, data.destination_url),
          productTitle: data.product_title || 'Oferta Rastreada',
          originDefault: (data.origin_default as ClickOrigin) || 'whatsapp',
          clicksCount: Number(data.clicks_count || 0),
          lastClickedAt: data.last_clicked_at || null,
          createdAt: data.created_at || new Date().toISOString(),
          isTest: Boolean(data.is_test),
        };
      }
    } catch {}
  }

  const localLinks = readLocalJsonArray<TrackedLinkRecord>(LOCAL_TRACKED_LINKS_FILE);
  return localLinks.find((l) => l.code === cleanCode) || null;
}

/**
 * Registra um evento de clique completo em `/r/[code]` (data, loja, produto e origem).
 */
export async function recordClickEvent(input: {
  userId?: string;
  code: string;
  destinationUrl: string;
  store?: string | null;
  productTitle?: string | null;
  origin: ClickOrigin;
  userAgent?: string | null;
  referer?: string | null;
  createdAt?: string;
  isTest?: boolean;
}): Promise<ClickEventRecord> {
  const userId = input.userId || ADMIN_UUID;
  const store = normalizeStoreSlug(input.store, input.destinationUrl);
  const productTitle = (input.productTitle || 'Oferta Rastreada').trim();
  const createdAt = input.createdAt || new Date().toISOString();
  const isTest = Boolean(input.isTest);

  const event: ClickEventRecord = {
    id: crypto.randomUUID(),
    userId,
    code: input.code,
    destinationUrl: input.destinationUrl,
    store,
    productTitle,
    origin: input.origin,
    userAgent: (input.userAgent || 'navegador').slice(0, 255),
    referer: (input.referer || 'direto').slice(0, 255),
    createdAt,
    isTest,
  };

  // 1. Persistir no arquivo local (.data/click_events.json e atualizar contador em .data/tracked_links.json)
  const localEvents = readLocalJsonArray<ClickEventRecord>(LOCAL_CLICK_EVENTS_FILE);
  localEvents.unshift(event);
  writeLocalJsonArray(LOCAL_CLICK_EVENTS_FILE, localEvents);

  const localLinks = readLocalJsonArray<TrackedLinkRecord>(LOCAL_TRACKED_LINKS_FILE);
  const linkIdx = localLinks.findIndex((l) => l.code === input.code);
  if (linkIdx >= 0) {
    localLinks[linkIdx].clicksCount = (localLinks[linkIdx].clicksCount || 0) + 1;
    localLinks[linkIdx].lastClickedAt = createdAt;
    if (isTest) localLinks[linkIdx].isTest = true;
    writeLocalJsonArray(LOCAL_TRACKED_LINKS_FILE, localLinks);
  } else {
    localLinks.unshift({
      id: crypto.randomUUID(),
      userId,
      code: input.code,
      destinationUrl: input.destinationUrl,
      store,
      productTitle,
      originDefault: input.origin,
      clicksCount: 1,
      lastClickedAt: createdAt,
      createdAt,
      isTest,
    });
    writeLocalJsonArray(LOCAL_TRACKED_LINKS_FILE, localLinks);
  }

  // 2. Persistir no Supabase (reaproveitando `click_events` e `tracked_links`)
  if (isSupabaseConfigured && supabase) {
    try {
      const { error: errRich } = await supabase.from('click_events').insert({
        code: event.code,
        destination_url: event.destinationUrl,
        store: event.store,
        product_title: event.productTitle,
        origin: event.origin,
        user_id: event.userId,
        user_agent: event.userAgent,
        referer: event.referer,
        created_at: event.createdAt,
        is_test: isTest,
      });

      if (errRich) {
        await supabase.from('click_events').insert({
          code: event.code,
          destination_url: event.destinationUrl,
          store: event.store,
          user_agent: event.userAgent,
          referer: `${event.origin}:${event.referer}`.slice(0, 255),
          created_at: event.createdAt,
        });
      }
    } catch {}
  }

  return event;
}

/**
 * Lista todos os cliques registrados (combinando Supabase e armazenamento local sem duplicar IDs).
 * REGRA FASE 4: Em produção (`NODE_ENV === 'production'`), qualquer clique com `isTest === true`
 * é automaticamente excluído das métricas.
 */
export async function listClickEvents(params?: {
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  excludeTest?: boolean;
}): Promise<ClickEventRecord[]> {
  const localEvents = readLocalJsonArray<ClickEventRecord>(LOCAL_CLICK_EVENTS_FILE);
  const byKey = new Map<string, ClickEventRecord>();

  for (const ev of localEvents) {
    byKey.set(`${ev.code}::${ev.createdAt.slice(0, 19)}`, ev);
  }

  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase
        .from('click_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);

      if (params?.startDate) {
        query = query.gte('created_at', params.startDate.toISOString());
      }
      if (params?.endDate) {
        query = query.lte('created_at', params.endDate.toISOString());
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const createdAt = row.created_at || new Date().toISOString();
          const key = `${row.code}::${createdAt.slice(0, 19)}`;
          if (!byKey.has(key)) {
            const rawRef = String(row.referer || '');
            let inferredOrigin: ClickOrigin = (row.origin as ClickOrigin) || 'outro';
            if (!row.origin && rawRef.includes(':')) {
              const prefix = rawRef.split(':')[0] as ClickOrigin;
              if (['whatsapp', 'telegram', 'vitrine', 'card', 'outro'].includes(prefix)) {
                inferredOrigin = prefix;
              }
            }
            byKey.set(key, {
              id: row.id || crypto.randomUUID(),
              userId: row.user_id || ADMIN_UUID,
              code: row.code,
              destinationUrl: row.destination_url,
              store: normalizeStoreSlug(row.store, row.destination_url),
              productTitle: row.product_title || 'Oferta Rastreada',
              origin: inferredOrigin,
              userAgent: row.user_agent || 'navegador',
              referer: rawRef,
              createdAt,
              isTest: Boolean(row.is_test) || String(row.user_agent || '').includes('RadarTestSimulator'),
            });
          }
        }
      }
    } catch {}
  }

  let merged = Array.from(byKey.values());
  const mustExcludeTest = params?.excludeTest === true || !isDevEnvironment();
  if (mustExcludeTest) {
    merged = merged.filter((e) => !e.isTest && !String(e.userAgent || '').includes('RadarTestSimulator'));
  }

  if (params?.startDate) {
    const minMs = params.startDate.getTime();
    merged = merged.filter((e) => new Date(e.createdAt).getTime() >= minMs);
  }
  if (params?.endDate) {
    const maxMs = params.endDate.getTime();
    merged = merged.filter((e) => new Date(e.createdAt).getTime() <= maxMs);
  }

  return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Apaga todos os cliques e links rastreados marcados com `isTest === true` (`is_test = true`).
 */
export async function clearTestClicksAndLinks(userId: string = ADMIN_UUID): Promise<{
  deletedClicks: number;
  deletedLinks: number;
}> {
  const localEvents = readLocalJsonArray<ClickEventRecord>(LOCAL_CLICK_EVENTS_FILE);
  const keptEvents = localEvents.filter(
    (e) => !e.isTest && !String(e.userAgent || '').includes('RadarTestSimulator')
  );
  const deletedClicks = localEvents.length - keptEvents.length;
  writeLocalJsonArray(LOCAL_CLICK_EVENTS_FILE, keptEvents);

  const localLinks = readLocalJsonArray<TrackedLinkRecord>(LOCAL_TRACKED_LINKS_FILE);
  const keptLinks = localLinks.filter((l) => !l.isTest);
  const deletedLinks = localLinks.length - keptLinks.length;
  writeLocalJsonArray(LOCAL_TRACKED_LINKS_FILE, keptLinks);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('click_events').delete().eq('is_test', true).eq('user_id', userId);
      await supabase.from('tracked_links').delete().eq('is_test', true).eq('user_id', userId);
    } catch {}
  }

  return { deletedClicks, deletedLinks };
}

