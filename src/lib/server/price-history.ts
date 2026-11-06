import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ADMIN_UUID } from './auth';

export interface PriceHistoryEntry {
  id: string;
  userId: string;
  productExternalId?: string;
  productTitle: string;
  productUrl: string;
  store: string;
  price: number;
  originalPrice?: number;
  recordedAt: string;
}

const LOCAL_HISTORY_FILE = path.join(process.cwd(), '.data', 'price_history.json');

/**
 * Registra imediatamente o preço de cada oferta coletada (produto, loja, preço, data).
 * Funciona de forma resiliente no Supabase (tabela `price_history`) e em arquivo local de backup.
 */
export async function recordOfferPriceHistory(input: {
  userId?: string;
  productExternalId?: string;
  productTitle: string;
  productUrl: string;
  store: string;
  price: number;
  originalPrice?: number;
}): Promise<void> {
  if (!input.price || input.price <= 0 || !input.productUrl || !input.store) {
    return;
  }

  const entry: PriceHistoryEntry = {
    id: crypto.randomUUID(),
    userId: input.userId || ADMIN_UUID,
    productExternalId: input.productExternalId || undefined,
    productTitle: (input.productTitle || 'Produto').slice(0, 280),
    productUrl: input.productUrl.split('?')[0].trim(),
    store: input.store.toLowerCase().trim(),
    price: Number(input.price.toFixed(2)),
    originalPrice:
      input.originalPrice && input.originalPrice > 0
        ? Number(input.originalPrice.toFixed(2))
        : undefined,
    recordedAt: new Date().toISOString(),
  };

  // 1. Salvar na tabela oficial `price_history` do Supabase
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('price_history').insert({
        id: entry.id,
        user_id: entry.userId,
        product_external_id: entry.productExternalId || null,
        product_title: entry.productTitle,
        product_url: entry.productUrl,
        store: entry.store,
        price: entry.price,
        original_price: entry.originalPrice || null,
        recorded_at: entry.recordedAt,
      });
    } catch {
      // Se a tabela ainda não foi migrada no banco remoto, o fallback local preserva os dados
    }
  }

  // 2. Persistência local de segurança (até 2.000 registros recentes)
  try {
    const dir = path.dirname(LOCAL_HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let list: PriceHistoryEntry[] = [];
    if (fs.existsSync(LOCAL_HISTORY_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(LOCAL_HISTORY_FILE, 'utf-8'));
        if (Array.isArray(parsed)) list = parsed;
      } catch {}
    }
    list.unshift(entry);
    if (list.length > 2000) {
      list = list.slice(0, 2000);
    }
    fs.writeFileSync(LOCAL_HISTORY_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch {
    // Em ambientes serverless read-only (ex: Vercel), ignora erro de disco silenciosamente
  }
}

/**
 * Consulta o histórico de preços dos últimos N dias para um produto.
 */
export async function getProductPriceHistory(
  productUrl: string,
  days = 30
): Promise<PriceHistoryEntry[]> {
  const cleanUrl = productUrl.split('?')[0].trim();
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('price_history')
        .select('*')
        .eq('product_url', cleanUrl)
        .gte('recorded_at', sinceIso)
        .order('recorded_at', { ascending: false })
        .limit(100);

      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((row) => ({
          id: row.id,
          userId: row.user_id,
          productExternalId: row.product_external_id || undefined,
          productTitle: row.product_title,
          productUrl: row.product_url,
          store: row.store,
          price: Number(row.price),
          originalPrice: row.original_price ? Number(row.original_price) : undefined,
          recordedAt: row.recorded_at,
        }));
      }
    } catch {}
  }

  try {
    if (fs.existsSync(LOCAL_HISTORY_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_HISTORY_FILE, 'utf-8'));
      if (Array.isArray(parsed)) {
        const sinceMs = new Date(sinceIso).getTime();
        return parsed.filter(
          (item: PriceHistoryEntry) =>
            item.productUrl === cleanUrl && new Date(item.recordedAt).getTime() >= sinceMs
        );
      }
    }
  } catch {}

  return [];
}

export interface RealDealAuditResult {
  hasEnoughHistory: boolean;
  recordsCount: number;
  historyCount30d: number;
  currentPrice: number;
  claimedOriginalPrice?: number;
  minPrice30d: number | null;
  maxPrice30d: number | null;
  avgPrice30d: number | null;
  realDiscountVsAvgPct: number | null;
  isLowestIn30Days: boolean;
  isLowestIn30d: boolean;
  isBelowAverage30d: boolean;
  isInflatedOriginalPrice: boolean;
  isRealDeal: boolean;
  badgeLabel: string | null;
  warningLabel: string | null;
  inflationReason: string | null;
  summaryText: string;
}

export const recordPriceHistory = recordOfferPriceHistory;

/**
 * Avalia o "Selo de Promoção Real" (Plus / Ultimate) com base na tabela `price_history` (30 dias)
 * e detecta preço "De" inflado ("metade do dobro").
 * REGRA ESTRITA: Sem histórico suficiente (< 2 registros), não exibe selo (retorna badgeLabel: null).
 */
export async function evaluateRealDealBadge(params: {
  productUrl: string;
  currentPrice: number;
  claimedOriginalPrice?: number;
}): Promise<RealDealAuditResult> {
  const { productUrl, currentPrice, claimedOriginalPrice } = params;
  if (!productUrl || !currentPrice || currentPrice <= 0) {
    return {
      hasEnoughHistory: false,
      recordsCount: 0,
      historyCount30d: 0,
      currentPrice: currentPrice || 0,
      claimedOriginalPrice,
      minPrice30d: null,
      maxPrice30d: null,
      avgPrice30d: null,
      realDiscountVsAvgPct: null,
      isLowestIn30Days: false,
      isLowestIn30d: false,
      isBelowAverage30d: false,
      isInflatedOriginalPrice: false,
      isRealDeal: false,
      badgeLabel: null,
      warningLabel: null,
      inflationReason: null,
      summaryText: 'Informe a URL do produto e o preço atual para auditar o histórico de 30 dias.',
    };
  }

  const history = await getProductPriceHistory(productUrl, 30);

  // Sem histórico suficiente (< 2 coletas registradas), NUNCA mostra selo
  if (history.length < 2) {
    return {
      hasEnoughHistory: false,
      recordsCount: history.length,
      historyCount30d: history.length,
      currentPrice,
      claimedOriginalPrice,
      minPrice30d: history[0]?.price ?? null,
      maxPrice30d: history[0]?.price ?? null,
      avgPrice30d: history[0]?.price ?? null,
      realDiscountVsAvgPct: null,
      isLowestIn30Days: false,
      isLowestIn30d: false,
      isBelowAverage30d: false,
      isInflatedOriginalPrice: false,
      isRealDeal: false,
      badgeLabel: null,
      warningLabel: null,
      inflationReason: null,
      summaryText: `Sem histórico suficiente (${history.length}/2 coletas nos últimos 30 dias). Nenhum selo exibido.`,
    };
  }

  const prices = history.map((h) => Number(h.price)).filter((p) => p > 0);
  const minPrice30d = Number(Math.min(...prices, currentPrice).toFixed(2));
  const maxPrice30d = Number(Math.max(...prices).toFixed(2));
  const avgPrice30d = Number((prices.reduce((acc, v) => acc + v, 0) / prices.length).toFixed(2));

  const realDiscountVsAvgPct =
    avgPrice30d > currentPrice
      ? Math.round(((avgPrice30d - currentPrice) / avgPrice30d) * 100)
      : 0;

  // Só é "Menor preço dos últimos 30 dias" se o preço atual for <= mínimo de 30 dias E menor que o maior/média histórica
  const isLowestIn30Days =
    currentPrice <= minPrice30d && maxPrice30d > currentPrice && currentPrice <= avgPrice30d * 0.98;
  const isBelowAverage30d = currentPrice <= avgPrice30d * 0.95;

  // Detector de preço "De" inflado: se a loja afirma "De R$ X", mas nos últimos 30 dias o produto nunca custou perto disso (> 15% acima do máximo real observado)
  const isInflatedOriginalPrice = Boolean(
    claimedOriginalPrice &&
      claimedOriginalPrice > currentPrice &&
      maxPrice30d > 0 &&
      claimedOriginalPrice > maxPrice30d * 1.15
  );

  let warningLabel: string | null = null;
  if (isInflatedOriginalPrice && claimedOriginalPrice) {
    warningLabel = `Preço "De" inflado: a loja informa R$ ${claimedOriginalPrice.toFixed(2).replace('.', ',')}, mas o maior preço real em 30 dias foi R$ ${maxPrice30d.toFixed(2).replace('.', ',')}.`;
  }

  // Se o preço "De" estiver inflado, bloqueamos o selo
  const isRealDeal = !isInflatedOriginalPrice && (isLowestIn30Days || isBelowAverage30d);

  let badgeLabel: string | null = null;
  if (!isInflatedOriginalPrice && isLowestIn30Days) {
    badgeLabel = 'Menor preço dos últimos 30 dias';
  } else if (!isInflatedOriginalPrice && isBelowAverage30d) {
    badgeLabel = `Promoção Real (${realDiscountVsAvgPct}% abaixo da média 30d)`;
  }

  const summaryText = `Histórico 30d (${history.length} coletas): Mín R$ ${minPrice30d.toFixed(2).replace('.', ',')} · Média R$ ${avgPrice30d.toFixed(2).replace('.', ',')} · Máx R$ ${maxPrice30d.toFixed(2).replace('.', ',')}.`;

  return {
    hasEnoughHistory: true,
    recordsCount: history.length,
    historyCount30d: history.length,
    currentPrice,
    claimedOriginalPrice,
    minPrice30d,
    maxPrice30d,
    avgPrice30d,
    realDiscountVsAvgPct,
    isLowestIn30Days,
    isLowestIn30d: isLowestIn30Days,
    isBelowAverage30d,
    isInflatedOriginalPrice,
    isRealDeal,
    badgeLabel,
    warningLabel,
    inflationReason: warningLabel,
    summaryText,
  };
}


