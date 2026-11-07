import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ADMIN_UUID } from './auth';
import { getDatabase, readDatabase, savePublicationJob, writeDatabase } from './storage';
import {
  appendChannelSrcParam,
  formatStoreDisplayName,
  listClickEvents,
  normalizeStoreSlug,
} from './click-tracker';
import { listConvertedSales } from './converted-sales';
import { detectProductCategory } from './hook-generator';
import { buildWhatsAppMessage } from './message-builder';
import { sendOfferToTelegram } from './telegram-service';
import { runWorkerCycle } from './worker-engine';
import { getProductPriceHistory, recordOfferPriceHistory } from './price-history';
import { PublicationJob } from '@/lib/types';

// ============================================================================
// TIPOS E ESTRUTURAS DA FASE 4 — INTELIGÊNCIA, EQUIPE E SEGUNDO PLANO (ULTIMATE)
// ============================================================================

export type AlertNotifyChannel = 'whatsapp' | 'telegram' | 'both';

export interface PriceDropAlertRecord {
  id: string;
  userId: string;
  productTitle: string;
  productUrl: string;
  affiliateUrl: string;
  store: string;
  targetPrice: number;
  currentPrice: number;
  lastCheckedPrice: number | null;
  notifyChannel: AlertNotifyChannel;
  status: 'active' | 'triggered' | 'paused';
  triggeredAt: string | null;
  lastNotifiedChannel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntelligenceSettingsRecord {
  userId: string;
  radarEnabled: boolean;
  radarMinDropPct: number;
  radarIncludeFlashDeals: boolean;
  weeklyReportEnabled: boolean;
  weeklyReportWhatsapp: boolean;
  weeklyReportEmail: string;
  weeklyReportDayOfWeek: number; // 1 = Segunda
  lastWeeklyReportSentAt: string | null;
  updatedAt: string;
}

export interface WhatToPostRecommendation {
  hasEnoughData: boolean;
  emptyStateExplanation: string | null;
  dataPointsAnalyzed: {
    realClicksCount: number;
    realSalesCount: number;
    sentOffersCount: number;
  };
  bestPostingHour: {
    hourLabel: string;
    reason: string;
  } | null;
  topCategories: Array<{
    categoryKey: string;
    categoryLabel: string;
    clicks: number;
    sales: number;
    conversionSignal: string;
  }>;
  topStores: Array<{
    storeSlug: string;
    storeName: string;
    clicks: number;
    sales: number;
    revenueBRL: number;
  }>;
  suggestedOffers: Array<{
    title: string;
    storeName: string;
    price: number | null;
    affiliateUrl: string;
    clicks: number;
    sales: number;
    reason: string;
  }>;
}

export interface WeeklyReportSummary {
  periodLabel: string;
  currentWeekClicks: number;
  previousWeekClicks: number;
  clicksDiffPct: number | null;
  clicksComparisonText: string;
  currentWeekSalesCount: number;
  currentWeekSalesValue: number;
  bestOffer: {
    title: string;
    store: string;
    clicks: number;
  } | null;
  reportMessageText: string;
  channelsDispatched: {
    whatsapp: { attempted: boolean; ok: boolean; detail: string };
    email: { attempted: boolean; ok: boolean; detail: string };
  };
  generatedAt: string;
}

export interface TeamMemberPermissions {
  canPostOffers: boolean;
  canApproveRadar: boolean;
  canManageConnections: boolean;
  canViewMetrics: boolean;
}

export interface TeamMemberRecord {
  id: string;
  workspaceOwnerId: string;
  name: string;
  email: string;
  role: 'dono' | 'colaborador';
  permissions: TeamMemberPermissions;
  status: 'active' | 'invited' | 'disabled';
  createdAt: string;
}

export interface WorkspaceChannelRecord {
  id: string;
  userId: string;
  channelType: 'whatsapp' | 'telegram';
  label: string;
  targetIdentifier: string; // JID do grupo WhatsApp ou Chat ID do Telegram
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

export type BackgroundJobKey =
  | 'scheduled_posts'
  | 'price_drop_alerts'
  | 'opportunity_radar'
  | 'weekly_report';

export interface BackgroundJobStatusRecord {
  userId: string;
  jobKey: BackgroundJobKey;
  jobLabel: string;
  cadenceDescription: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: 'idle' | 'running' | 'ok' | 'error';
  lastError: string | null;
  itemsProcessed: number;
  updatedAt: string;
}

// ============================================================================
// ARMAZENAMENTO LOCAL (.data/) COM SINCRONIZAÇÃO SUPABASE
// ============================================================================

const LOCAL_ALERTS_FILE = path.join(process.cwd(), '.data', 'price_drop_alerts.json');
const LOCAL_SETTINGS_FILE = path.join(process.cwd(), '.data', 'intelligence_settings.json');
const LOCAL_TEAM_FILE = path.join(process.cwd(), '.data', 'team_members.json');
const LOCAL_CHANNELS_FILE = path.join(process.cwd(), '.data', 'workspace_channels.json');
const LOCAL_BG_STATUS_FILE = path.join(process.cwd(), '.data', 'background_jobs_status.json');

function readLocalFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return parsed ?? fallback;
    }
  } catch {}
  return fallback;
}

function writeLocalFile<T>(filePath: string, data: T): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch {}
}

// ============================================================================
// 1. CONFIGURAÇÕES DE INTELIGÊNCIA (RADAR + RELATÓRIO SEMANAL)
// ============================================================================

export function getDefaultIntelligenceSettings(
  userId: string = ADMIN_UUID
): IntelligenceSettingsRecord {
  return {
    userId,
    radarEnabled: true,
    radarMinDropPct: 25,
    radarIncludeFlashDeals: true,
    weeklyReportEnabled: true,
    weeklyReportWhatsapp: true,
    weeklyReportEmail: '',
    weeklyReportDayOfWeek: 1,
    lastWeeklyReportSentAt: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function getIntelligenceSettings(
  userId: string = ADMIN_UUID
): Promise<IntelligenceSettingsRecord> {
  const allLocal = readLocalFile<Record<string, IntelligenceSettingsRecord>>(LOCAL_SETTINGS_FILE, {});
  const local = allLocal[userId];

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('intelligence_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        const mapped: IntelligenceSettingsRecord = {
          userId,
          radarEnabled: Boolean(data.radar_enabled ?? true),
          radarMinDropPct: Number(data.radar_min_drop_pct ?? 25),
          radarIncludeFlashDeals: Boolean(data.radar_include_flash_deals ?? true),
          weeklyReportEnabled: Boolean(data.weekly_report_enabled ?? true),
          weeklyReportWhatsapp: Boolean(data.weekly_report_whatsapp ?? true),
          weeklyReportEmail: data.weekly_report_email || '',
          weeklyReportDayOfWeek: Number(data.weekly_report_day_of_week ?? 1),
          lastWeeklyReportSentAt: data.last_weekly_report_sent_at || null,
          updatedAt: data.updated_at || new Date().toISOString(),
        };
        allLocal[userId] = mapped;
        writeLocalFile(LOCAL_SETTINGS_FILE, allLocal);
        return mapped;
      }
    } catch {}
  }

  return local
    ? { ...getDefaultIntelligenceSettings(userId), ...local, userId }
    : getDefaultIntelligenceSettings(userId);
}

export async function saveIntelligenceSettings(
  userId: string,
  partial: Partial<Omit<IntelligenceSettingsRecord, 'userId' | 'updatedAt'>>
): Promise<IntelligenceSettingsRecord> {
  const current = await getIntelligenceSettings(userId);
  const minDrop =
    partial.radarMinDropPct !== undefined
      ? Math.max(5, Math.min(90, Math.round(Number(partial.radarMinDropPct) || 25)))
      : current.radarMinDropPct;

  const updated: IntelligenceSettingsRecord = {
    ...current,
    ...partial,
    userId,
    radarMinDropPct: minDrop,
    updatedAt: new Date().toISOString(),
  };

  const allLocal = readLocalFile<Record<string, IntelligenceSettingsRecord>>(LOCAL_SETTINGS_FILE, {});
  allLocal[userId] = updated;
  writeLocalFile(LOCAL_SETTINGS_FILE, allLocal);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('intelligence_settings').upsert(
        {
          user_id: userId,
          radar_enabled: updated.radarEnabled,
          radar_min_drop_pct: updated.radarMinDropPct,
          radar_include_flash_deals: updated.radarIncludeFlashDeals,
          weekly_report_enabled: updated.weeklyReportEnabled,
          weekly_report_whatsapp: updated.weeklyReportWhatsapp,
          weekly_report_email: updated.weeklyReportEmail || null,
          weekly_report_day_of_week: updated.weeklyReportDayOfWeek,
          last_weekly_report_sent_at: updated.lastWeeklyReportSentAt,
          updated_at: updated.updatedAt,
        },
        { onConflict: 'user_id' }
      );
    } catch {}
  }

  return updated;
}

// ============================================================================
// 2. ALERTA DE QUEDA DE PREÇO (ULTIMATE)
// ============================================================================

export async function listPriceDropAlerts(
  userId: string = ADMIN_UUID
): Promise<PriceDropAlertRecord[]> {
  const localList = readLocalFile<PriceDropAlertRecord[]>(LOCAL_ALERTS_FILE, []).filter(
    (a) => !a.userId || a.userId === userId
  );

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('price_drop_alerts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        const byId = new Map<string, PriceDropAlertRecord>();
        for (const item of localList) byId.set(item.id, item);
        for (const row of data) {
          if (!byId.has(row.id)) {
            byId.set(row.id, {
              id: row.id,
              userId: row.user_id,
              productTitle: row.product_title,
              productUrl: row.product_url,
              affiliateUrl: row.affiliate_url || row.product_url,
              store: normalizeStoreSlug(row.store, row.product_url),
              targetPrice: Number(row.target_price || 0),
              currentPrice: Number(row.current_price || 0),
              lastCheckedPrice: row.last_checked_price ? Number(row.last_checked_price) : null,
              notifyChannel: (row.notify_channel as AlertNotifyChannel) || 'whatsapp',
              status: (row.status as 'active' | 'triggered' | 'paused') || 'active',
              triggeredAt: row.triggered_at || null,
              lastNotifiedChannel: row.last_notified_channel || null,
              createdAt: row.created_at,
              updatedAt: row.updated_at || row.created_at,
            });
          }
        }
        return Array.from(byId.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
    } catch {}
  }

  return localList.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function createPriceDropAlert(params: {
  userId?: string;
  productTitle: string;
  productUrl: string;
  affiliateUrl?: string;
  store?: string;
  currentPrice: number;
  targetPrice: number;
  notifyChannel?: AlertNotifyChannel;
}): Promise<PriceDropAlertRecord> {
  const userId = params.userId || ADMIN_UUID;
  const now = new Date().toISOString();
  const store = normalizeStoreSlug(params.store, params.productUrl);
  const currentPrice = Number(Number(params.currentPrice || 0).toFixed(2));
  const targetPrice = Number(Number(params.targetPrice || 0).toFixed(2));
  const notifyChannel: AlertNotifyChannel = params.notifyChannel || 'whatsapp';

  const record: PriceDropAlertRecord = {
    id: crypto.randomUUID(),
    userId,
    productTitle: (params.productTitle || 'Produto Monitorado').trim(),
    productUrl: params.productUrl.trim(),
    affiliateUrl: (params.affiliateUrl || params.productUrl).trim(),
    store,
    targetPrice,
    currentPrice,
    lastCheckedPrice: currentPrice,
    notifyChannel,
    status: 'active',
    triggeredAt: null,
    lastNotifiedChannel: null,
    createdAt: now,
    updatedAt: now,
  };

  const allLocal = readLocalFile<PriceDropAlertRecord[]>(LOCAL_ALERTS_FILE, []);
  allLocal.unshift(record);
  writeLocalFile(LOCAL_ALERTS_FILE, allLocal);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('price_drop_alerts').insert({
        id: record.id,
        user_id: userId,
        product_title: record.productTitle,
        product_url: record.productUrl,
        affiliate_url: record.affiliateUrl,
        store: record.store,
        target_price: record.targetPrice,
        current_price: record.currentPrice,
        last_checked_price: record.lastCheckedPrice,
        notify_channel: record.notifyChannel,
        status: record.status,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      });
    } catch {}
  }

  return record;
}

export async function deletePriceDropAlert(
  userId: string,
  alertId: string
): Promise<boolean> {
  const allLocal = readLocalFile<PriceDropAlertRecord[]>(LOCAL_ALERTS_FILE, []);
  const filtered = allLocal.filter((a) => !(a.id === alertId && (!a.userId || a.userId === userId)));
  writeLocalFile(LOCAL_ALERTS_FILE, filtered);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('price_drop_alerts').delete().eq('id', alertId).eq('user_id', userId);
    } catch {}
  }

  return filtered.length !== allLocal.length;
}

/**
 * Avalia todos os alertas de queda de preço ativos do usuário.
 * Quando o preço atual atinge ou cai abaixo de `targetPrice`, envia aviso via WhatsApp e/ou Telegram.
 */
export async function evaluateAndTriggerPriceDropAlerts(
  userId: string = ADMIN_UUID,
  priceOverrides?: Record<string, number>
): Promise<{
  checkedCount: number;
  triggeredCount: number;
  triggeredAlerts: PriceDropAlertRecord[];
  notifications: Array<{ alertId: string; channel: string; ok: boolean; detail: string }>;
}> {
  const allLocal = readLocalFile<PriceDropAlertRecord[]>(LOCAL_ALERTS_FILE, []);
  const userAlerts = allLocal.filter(
    (a) => (!a.userId || a.userId === userId) && a.status === 'active'
  );

  let db;
  try {
    db = await getDatabase();
  } catch {
    db = readDatabase();
  }

  const triggeredAlerts: PriceDropAlertRecord[] = [];
  const notifications: Array<{ alertId: string; channel: string; ok: boolean; detail: string }> = [];
  const now = new Date().toISOString();

  for (const alert of userAlerts) {
    // 1. Verificar preço atualizado: override de teste/checagem manual -> catálogo -> histórico 30d -> currentPrice salvo
    let latestPrice = alert.currentPrice;

    if (priceOverrides && typeof priceOverrides[alert.id] === 'number') {
      latestPrice = priceOverrides[alert.id];
    } else if (priceOverrides && typeof priceOverrides[alert.productUrl] === 'number') {
      latestPrice = priceOverrides[alert.productUrl];
    } else {
      const catProd = (db.products || []).find(
        (p) =>
          p.productUrl === alert.productUrl ||
          p.affiliateUrl === alert.affiliateUrl ||
          p.title.toLowerCase() === alert.productTitle.toLowerCase()
      );
      if (catProd && catProd.currentPrice > 0) {
        latestPrice = catProd.currentPrice;
      } else {
        const hist = await getProductPriceHistory(alert.productUrl, 30);
        if (hist.length > 0 && hist[0].price > 0) {
          latestPrice = hist[0].price;
        }
      }
    }

    alert.lastCheckedPrice = latestPrice;
    alert.currentPrice = latestPrice;
    alert.updatedAt = now;

    // 2. Verificar se o preço atingiu ou caiu abaixo da meta definida pelo usuário
    if (latestPrice > 0 && latestPrice <= alert.targetPrice) {
      alert.status = 'triggered';
      alert.triggeredAt = now;

      await recordOfferPriceHistory({
        productUrl: alert.productUrl,
        productTitle: alert.productTitle,
        store: alert.store,
        price: latestPrice,
      });

      const alertText = buildWhatsAppMessage({
        title: alert.productTitle,
        originalPrice: alert.targetPrice > latestPrice ? alert.targetPrice : undefined,
        currentPrice: latestPrice,
        affiliateUrl: alert.affiliateUrl || alert.productUrl,
        hookText: `🔔 ALERTA DE QUEDA DE PREÇO ATINGIDO (Meta: R$ ${alert.targetPrice.toFixed(2).replace('.', ',')})!`,
        channelOrigin: alert.notifyChannel === 'telegram' ? 'telegram' : 'whatsapp',
      });

      const notifiedChannels: string[] = [];

      // Disparo via WhatsApp usando o motor de envios existente
      if (alert.notifyChannel === 'whatsapp' || alert.notifyChannel === 'both') {
        const destGroup = (db.groups || []).find((g) => g.isDestination);
        const job: PublicationJob = {
          id: `alert-wa-${alert.id.slice(0, 8)}-${Date.now()}`,
          userId,
          originType: 'fila',
          targetJid: destGroup?.groupJid || 'status@broadcast',
          targetName: destGroup?.name || 'Alerta de Queda de Preço (WhatsApp)',
          messageText: alertText,
          mediaType: 'none',
          originalUrl: alert.productUrl,
          cleanUrl: alert.productUrl,
          affiliateUrl: appendChannelSrcParam(alert.affiliateUrl || alert.productUrl, 'whatsapp'),
          linkVerified: true,
          status: 'agendado',
          scheduledFor: now,
          attempts: 0,
          maxAttempts: 3,
          createdAt: now,
          updatedAt: now,
        };
        await savePublicationJob(job);
        notifiedChannels.push('whatsapp');
        notifications.push({
          alertId: alert.id,
          channel: 'whatsapp',
          ok: true,
          detail: `Alerta enfileirado no motor do WhatsApp (${job.targetName}).`,
        });
      }

      // Disparo via Telegram usando a Bot API oficial
      if (alert.notifyChannel === 'telegram' || alert.notifyChannel === 'both') {
        const tgRes = await sendOfferToTelegram({
          userId,
          text: alertText,
        });
        notifiedChannels.push('telegram');
        notifications.push({
          alertId: alert.id,
          channel: 'telegram',
          ok: tgRes.ok,
          detail: tgRes.ok
            ? 'Alerta enviado imediatamente ao Telegram!'
            : tgRes.error || 'Telegram não conectado no momento.',
        });
      }

      alert.lastNotifiedChannel = notifiedChannels.join('+');
      triggeredAlerts.push(alert);
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('price_drop_alerts')
          .update({
            current_price: alert.currentPrice,
            last_checked_price: alert.lastCheckedPrice,
            status: alert.status,
            triggered_at: alert.triggeredAt,
            last_notified_channel: alert.lastNotifiedChannel,
            updated_at: alert.updatedAt,
          })
          .eq('id', alert.id)
          .eq('user_id', userId);
      } catch {}
    }
  }

  writeLocalFile(LOCAL_ALERTS_FILE, allLocal);

  await updateBackgroundJobStatus(userId, 'price_drop_alerts', {
    lastStatus: 'ok',
    lastError: null,
    itemsProcessed: triggeredAlerts.length,
  });

  return {
    checkedCount: userAlerts.length,
    triggeredCount: triggeredAlerts.length,
    triggeredAlerts,
    notifications,
  };
}

// ============================================================================
// 3. "O QUE POSTAR HOJE" (ULTIMATE) — BASEADO 100% EM MÉTRICAS REAIS DO USUÁRIO
// ============================================================================

const CATEGORY_HUMAN_LABELS: Record<string, string> = {
  tenis: 'Tênis e Calçados Esportivos',
  caixa_de_som: 'Áudio e Caixas de Som Bluetooth',
  suplementos: 'Suplementos e Fitness',
  smartphones: 'Smartphones e Celulares',
  perfumes: 'Perfumaria e Cosméticos',
  relogios: 'Smartwatches e Relógios',
  ferramentas: 'Ferramentas e Casa',
  eletrodomesticos: 'Eletroportáteis e Cozinha',
  roupas: 'Moda e Vestuário',
  automotivo: 'Acessórios Automotivos',
  beleza: 'Beleza e Cuidados Pessoais',
  eletronicos: 'Eletrônicos e Fones',
  games: 'Games e Periféricos',
  geral: 'Utilidades e Ofertas Gerais',
};

export async function getWhatToPostTodayRecommendations(
  userId: string = ADMIN_UUID
): Promise<WhatToPostRecommendation> {
  // Buscar apenas dados reais (excluindo dados de teste para não distorcer a inteligência)
  const [clicks, sales] = await Promise.all([
    listClickEvents({ userId, excludeTest: true }),
    listConvertedSales({ userId, excludeTest: true }),
  ]);

  let db;
  try {
    db = await getDatabase();
  } catch {
    db = readDatabase();
  }

  const sentJobs = (db.jobs || []).filter((j) => j.status === 'enviado');

  const realClicksCount = clicks.length;
  const realSalesCount = sales.length;
  const sentOffersCount = sentJobs.length;

  // Regra estrita: sem dados reais suficientes, mostrar estado vazio honesto explicando o motivo
  if (realClicksCount < 2 && realSalesCount < 1 && sentOffersCount < 2) {
    return {
      hasEnoughData: false,
      emptyStateExplanation:
        'Ainda não há histórico suficiente de cliques ou vendas convertidas na sua conta para gerar recomendações personalizadas. Publique pelo menos 2 ofertas nos seus canais ou acumule cliques reais nos links /r/[code] para destravar a inteligência de melhor horário, categorias campeãs e ofertas recomendadas.',
      dataPointsAnalyzed: {
        realClicksCount,
        realSalesCount,
        sentOffersCount,
      },
      bestPostingHour: null,
      topCategories: [],
      topStores: [],
      suggestedOffers: [],
    };
  }

  // 1. Calcular o Melhor Horário de Postagem com base nos horários de maior engajamento real (cliques + envios)
  const hourBuckets = new Map<number, { clicks: number; sales: number; sent: number }>();
  for (let h = 0; h < 24; h++) {
    hourBuckets.set(h, { clicks: 0, sales: 0, sent: 0 });
  }

  for (const c of clicks) {
    const h = new Date(c.createdAt).getHours();
    const b = hourBuckets.get(h);
    if (b) b.clicks += 1;
  }
  for (const s of sales) {
    const h = new Date(s.saleDate).getHours();
    const b = hourBuckets.get(h);
    if (b) b.sales += 1;
  }
  for (const j of sentJobs) {
    const h = new Date(j.sentAt || j.createdAt).getHours();
    const b = hourBuckets.get(h);
    if (b) b.sent += 1;
  }

  let bestHour = 19;
  let bestHourScore = -1;
  for (const [hour, stats] of hourBuckets.entries()) {
    const score = stats.sales * 5 + stats.clicks * 2 + stats.sent;
    if (score > bestHourScore) {
      bestHourScore = score;
      bestHour = hour;
    }
  }

  const bestBucket = hourBuckets.get(bestHour) || { clicks: 0, sales: 0, sent: 0 };
  const padHour = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const nextHour = (bestHour + 1) % 24;

  // 2. Categorias que mais converteram / receberam cliques
  const categoryStats = new Map<
    string,
    { clicks: number; sales: number; revenue: number }
  >();

  for (const c of clicks) {
    const cat = detectProductCategory(c.productTitle);
    const cur = categoryStats.get(cat) || { clicks: 0, sales: 0, revenue: 0 };
    cur.clicks += 1;
    categoryStats.set(cat, cur);
  }
  for (const s of sales) {
    const cat = detectProductCategory(s.productTitle);
    const cur = categoryStats.get(cat) || { clicks: 0, sales: 0, revenue: 0 };
    cur.sales += s.quantity || 1;
    cur.revenue += s.orderValue || 0;
    categoryStats.set(cat, cur);
  }
  for (const j of sentJobs) {
    const cat = detectProductCategory(j.targetName || j.messageText || '');
    const cur = categoryStats.get(cat) || { clicks: 0, sales: 0, revenue: 0 };
    categoryStats.set(cat, cur);
  }

  const topCategories = Array.from(categoryStats.entries())
    .map(([categoryKey, st]) => ({
      categoryKey,
      categoryLabel: CATEGORY_HUMAN_LABELS[categoryKey] || categoryKey,
      clicks: st.clicks,
      sales: st.sales,
      conversionSignal:
        st.sales > 0
          ? `${st.sales} venda(s) convertida(s) · R$ ${st.revenue.toFixed(2)}`
          : `${st.clicks} clique(s) registrado(s)`,
      score: st.sales * 10 + st.clicks * 2,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ score: _score, ...rest }) => rest);

  // 3. Lojas com melhor desempenho
  const storeStats = new Map<
    string,
    { clicks: number; sales: number; revenueBRL: number }
  >();
  for (const c of clicks) {
    const slug = normalizeStoreSlug(c.store, c.destinationUrl);
    const cur = storeStats.get(slug) || { clicks: 0, sales: 0, revenueBRL: 0 };
    cur.clicks += 1;
    storeStats.set(slug, cur);
  }
  for (const s of sales) {
    const slug = normalizeStoreSlug(s.store);
    const cur = storeStats.get(slug) || { clicks: 0, sales: 0, revenueBRL: 0 };
    cur.sales += s.quantity || 1;
    cur.revenueBRL = Number((cur.revenueBRL + (s.orderValue || 0)).toFixed(2));
    storeStats.set(slug, cur);
  }

  const topStores = Array.from(storeStats.entries())
    .map(([storeSlug, st]) => ({
      storeSlug,
      storeName: formatStoreDisplayName(storeSlug),
      clicks: st.clicks,
      sales: st.sales,
      revenueBRL: st.revenueBRL,
    }))
    .sort((a, b) => b.sales * 10 + b.clicks - (a.sales * 10 + a.clicks))
    .slice(0, 4);

  // 4. Ofertas recomendadas para postar/repostar hoje (baseadas em conversão + catálogo)
  const offerPerformance = new Map<
    string,
    {
      title: string;
      storeName: string;
      price: number | null;
      affiliateUrl: string;
      clicks: number;
      sales: number;
    }
  >();

  for (const c of clicks) {
    const key = c.productTitle.toLowerCase().trim();
    const existing = offerPerformance.get(key);
    if (existing) {
      existing.clicks += 1;
    } else {
      offerPerformance.set(key, {
        title: c.productTitle,
        storeName: formatStoreDisplayName(c.store),
        price: null,
        affiliateUrl: c.destinationUrl,
        clicks: 1,
        sales: 0,
      });
    }
  }

  for (const s of sales) {
    const key = s.productTitle.toLowerCase().trim();
    const existing = offerPerformance.get(key);
    if (existing) {
      existing.sales += s.quantity || 1;
      if (!existing.price && s.orderValue > 0) existing.price = s.orderValue;
    } else {
      offerPerformance.set(key, {
        title: s.productTitle,
        storeName: formatStoreDisplayName(s.store),
        price: s.orderValue > 0 ? s.orderValue : null,
        affiliateUrl: '',
        clicks: 0,
        sales: s.quantity || 1,
      });
    }
  }

  // Enriquecer com catálogo local se disponível
  for (const prod of db.products || []) {
    if (!prod.currentPrice || prod.currentPrice <= 0) continue;
    const key = prod.title.toLowerCase().trim();
    const existing = offerPerformance.get(key);
    if (existing) {
      existing.price = prod.currentPrice;
      if (!existing.affiliateUrl) existing.affiliateUrl = prod.affiliateUrl;
    } else if (offerPerformance.size < 6) {
      offerPerformance.set(key, {
        title: prod.title,
        storeName: formatStoreDisplayName(prod.storeName),
        price: prod.currentPrice,
        affiliateUrl: prod.affiliateUrl,
        clicks: 0,
        sales: 0,
      });
    }
  }

  const suggestedOffers = Array.from(offerPerformance.values())
    .sort((a, b) => b.sales * 10 + b.clicks * 2 - (a.sales * 10 + a.clicks * 2))
    .slice(0, 4)
    .map((item) => ({
      ...item,
      reason:
        item.sales > 0
          ? `Campeã de vendas (${item.sales} conversão(ões) e ${item.clicks} clique(s))`
          : item.clicks > 0
          ? `Alto interesse do público (${item.clicks} clique(s) reais registrados)`
          : 'Oferta verificada disponível no catálogo na sua categoria ativa',
    }));

  return {
    hasEnoughData: true,
    emptyStateExplanation: null,
    dataPointsAnalyzed: {
      realClicksCount,
      realSalesCount,
      sentOffersCount,
    },
    bestPostingHour: {
      hourLabel: `${padHour(bestHour)} às ${padHour(nextHour)}`,
      reason:
        bestBucket.sales > 0 || bestBucket.clicks > 0
          ? `Horário de pico da sua audiência (${bestBucket.clicks} clique(s) e ${bestBucket.sales} venda(s) concentrados nesta faixa)`
          : `Faixa com maior volume de disparos entregues (${bestBucket.sent} postagem(ns) enviadas)`,
    },
    topCategories,
    topStores,
    suggestedOffers,
  };
}

// ============================================================================
// 4. RADAR DE OPORTUNIDADES (ULTIMATE) — SEMPRE VAI PARA FILA DE REVISÃO
// ============================================================================

/**
 * Analisa o catálogo e o histórico de preços de 30 dias em busca de:
 * - Quedas fortes de preço (`>= radarMinDropPct`, padrão 25%)
 * - Ofertas relâmpago (`radarIncludeFlashDeals`)
 *
 * REGRA INEGOCIÁVEL: NUNCA posta sozinho (`status` SEMPRE `'aguardando_aprovacao'`).
 */
export async function runOpportunityRadarScan(
  userId: string = ADMIN_UUID,
  options?: { minDropPctOverride?: number }
): Promise<{
  scannedCount: number;
  queuedForReviewCount: number;
  queuedJobs: PublicationJob[];
  reviewQueue: PublicationJob[];
}> {
  const settings = await getIntelligenceSettings(userId);
  const minDropPct =
    options?.minDropPctOverride !== undefined
      ? Math.max(5, Math.min(90, Number(options.minDropPctOverride)))
      : settings.radarMinDropPct;

  let db;
  try {
    db = await getDatabase();
  } catch {
    db = readDatabase();
  }

  const products = db.products || [];
  const existingJobs = db.jobs || [];
  const destGroup = (db.groups || []).find((g) => g.isDestination);
  const queuedJobs: PublicationJob[] = [];
  const now = new Date().toISOString();

  for (const prod of products) {
    if (!prod.currentPrice || prod.currentPrice <= 0) continue;
    const url = prod.productUrl || prod.affiliateUrl;
    if (!url) continue;

    // Evitar enfileirar duplicado se já estiver na fila de revisão (`aguardando_aprovacao`)
    const alreadyInReview = existingJobs.some(
      (j) =>
        j.status === 'aguardando_aprovacao' &&
        (j.cleanUrl === url || j.affiliateUrl === prod.affiliateUrl)
    );
    if (alreadyInReview) continue;

    // Calcular queda de preço real vs originalPrice ou média histórica de 30 dias
    let referencePrice = prod.originalPrice && prod.originalPrice > prod.currentPrice ? prod.originalPrice : 0;
    const history30d = await getProductPriceHistory(url, 30);
    if (history30d.length > 0) {
      const maxHist = Math.max(...history30d.map((h) => h.price));
      if (maxHist > referencePrice) referencePrice = maxHist;
    }

    const dropPct =
      referencePrice > prod.currentPrice
        ? Math.round(((referencePrice - prod.currentPrice) / referencePrice) * 100)
        : 0;

    const isFlashDeal =
      settings.radarIncludeFlashDeals &&
      (/rel[aâ]mpago|flash|oferta do dia|full|cupom/i.test(prod.title) || dropPct >= 35);

    const qualifiesByDrop = dropPct >= minDropPct;
    const qualifiesByFlash = isFlashDeal && dropPct >= Math.max(10, minDropPct - 10);

    if (!qualifiesByDrop && !qualifiesByFlash) continue;

    const reasonTag = qualifiesByDrop
      ? `Queda forte detectada: ${dropPct}% OFF`
      : `Oferta Relâmpago detectada (${dropPct}% OFF)`;

    const trackedAffiliate = appendChannelSrcParam(prod.affiliateUrl || url, 'whatsapp');
    const formattedMsg = buildWhatsAppMessage({
      title: prod.title,
      originalPrice: referencePrice > prod.currentPrice ? referencePrice : undefined,
      currentPrice: prod.currentPrice,
      discountPct: dropPct > 0 ? dropPct : undefined,
      affiliateUrl: trackedAffiliate,
      channelOrigin: 'whatsapp',
    });

    // REGRA CRÍTICA: Status SEMPRE 'aguardando_aprovacao' (NUNCA 'agendado' nem 'enviado' direto!)
    const reviewJob: PublicationJob = {
      id: `radar-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      originType: 'curador',
      productId: prod.id,
      targetJid: destGroup?.groupJid || 'status@broadcast',
      targetName: `[RADAR · ${reasonTag}] ${prod.title.slice(0, 60)}`,
      messageText: formattedMsg,
      mediaUrl: prod.imageUrl || undefined,
      mediaType: prod.imageUrl ? 'image' : 'none',
      originalUrl: url,
      cleanUrl: url,
      affiliateUrl: trackedAffiliate,
      linkVerified: true,
      status: 'aguardando_aprovacao',
      scheduledFor: now,
      attempts: 0,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
    };

    await savePublicationJob(reviewJob);
    queuedJobs.push(reviewJob);
  }

  const updatedDb = readDatabase();
  const reviewQueue = (updatedDb.jobs || []).filter((j) => j.status === 'aguardando_aprovacao');

  await updateBackgroundJobStatus(userId, 'opportunity_radar', {
    lastStatus: 'ok',
    lastError: null,
    itemsProcessed: queuedJobs.length,
  });

  return {
    scannedCount: products.length,
    queuedForReviewCount: queuedJobs.length,
    queuedJobs,
    reviewQueue,
  };
}

export async function decideRadarReviewJob(
  jobId: string,
  decision: 'approve' | 'reject'
): Promise<{ ok: boolean; job?: PublicationJob; message: string }> {
  const db = readDatabase();
  const idx = (db.jobs || []).findIndex((j) => j.id === jobId);
  if (idx < 0) {
    return { ok: false, message: 'Oportunidade não encontrada na fila de revisão.' };
  }

  if (decision === 'reject') {
    const removed = db.jobs.splice(idx, 1)[0];
    writeDatabase(db);
    return {
      ok: true,
      job: removed,
      message: 'Oportunidade descartada da fila de revisão.',
    };
  }

  db.jobs[idx].status = 'agendado';
  db.jobs[idx].updatedAt = new Date().toISOString();
  writeDatabase(db);
  await savePublicationJob(db.jobs[idx]);

  return {
    ok: true,
    job: db.jobs[idx],
    message: 'Oportunidade aprovada! Ela foi movida para a fila de envio seguro.',
  };
}

// ============================================================================
// 5. RELATÓRIO SEMANAL AUTOMÁTICO (WHATSAPP + E-MAIL RESEND / SMTP)
// ============================================================================

async function sendWeeklyReportEmailIfConfigured(params: {
  toEmail: string;
  subject: string;
  textBody: string;
}): Promise<{ attempted: boolean; ok: boolean; detail: string }> {
  const toEmail = (params.toEmail || '').trim();
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const smtpHost = (process.env.SMTP_HOST || '').trim();

  if (!toEmail) {
    return {
      attempted: false,
      ok: false,
      detail: 'Nenhum e-mail de destino configurado nas opções do Relatório Semanal.',
    };
  }

  if (!resendKey && !smtpHost) {
    return {
      attempted: false,
      ok: false,
      detail:
        'Envio por e-mail inativo: configure RESEND_API_KEY (ou SMTP_HOST) nas variáveis de ambiente do servidor para habilitar o disparo por e-mail.',
    };
  }

  if (resendKey) {
    try {
      const fromAddress = process.env.RESEND_FROM_EMAIL || 'Radar de Ofertas <relatorios@radardeofertas.com.br>';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [toEmail],
          subject: params.subject,
          text: params.textBody,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        return {
          attempted: true,
          ok: true,
          detail: `Relatório semanal enviado por e-mail para ${toEmail} via Resend!`,
        };
      }
      const errJson = await res.json().catch(() => ({}));
      return {
        attempted: true,
        ok: false,
        detail: `Aviso Resend API: ${errJson?.message || `HTTP ${res.status}`}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        attempted: true,
        ok: false,
        detail: `Erro de rede ao enviar e-mail via Resend: ${msg}`,
      };
    }
  }

  return {
    attempted: false,
    ok: false,
    detail: `Servidor SMTP (${smtpHost}) detectado; configure RESEND_API_KEY ou conector SMTP para disparo externo.`,
  };
}

export async function generateAndSendWeeklyReport(
  userId: string = ADMIN_UUID,
  options?: { dispatchNow?: boolean; emailOverride?: string }
): Promise<WeeklyReportSummary> {
  const settings = await getIntelligenceSettings(userId);
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [allClicks, currentSales] = await Promise.all([
    listClickEvents({ userId, excludeTest: true }),
    listConvertedSales({ userId, startDate: sevenDaysAgo, endDate: now, excludeTest: true }),
  ]);

  const currentWeekClicksList = allClicks.filter((c) => {
    const dt = new Date(c.createdAt);
    return dt >= sevenDaysAgo && dt <= now;
  });

  const previousWeekClicksList = allClicks.filter((c) => {
    const dt = new Date(c.createdAt);
    return dt >= fourteenDaysAgo && dt < sevenDaysAgo;
  });

  const currentWeekClicks = currentWeekClicksList.length;
  const previousWeekClicks = previousWeekClicksList.length;

  let clicksDiffPct: number | null = null;
  let clicksComparisonText = 'Sem base na semana anterior para comparação percentual';

  if (previousWeekClicks > 0) {
    clicksDiffPct = Math.round(((currentWeekClicks - previousWeekClicks) / previousWeekClicks) * 100);
    const sign = clicksDiffPct >= 0 ? `+${clicksDiffPct}%` : `${clicksDiffPct}%`;
    clicksComparisonText = `${sign} vs. semana anterior (${previousWeekClicks} clique(s))`;
  } else if (currentWeekClicks > 0) {
    clicksComparisonText = `${currentWeekClicks} clique(s) nesta semana (0 na semana anterior)`;
  } else {
    clicksComparisonText = '0 cliques registrados nas últimas duas semanas';
  }

  // Identificar a melhor oferta da semana
  const byOffer = new Map<string, { title: string; store: string; clicks: number }>();
  for (const c of currentWeekClicksList) {
    const key = `${c.store}::${c.productTitle}`;
    const existing = byOffer.get(key);
    if (existing) {
      existing.clicks += 1;
    } else {
      byOffer.set(key, {
        title: c.productTitle,
        store: formatStoreDisplayName(c.store),
        clicks: 1,
      });
    }
  }

  const bestOffer =
    Array.from(byOffer.values()).sort((a, b) => b.clicks - a.clicks)[0] || null;

  const currentWeekSalesCount = currentSales.length;
  const currentWeekSalesValue = Number(
    currentSales.reduce((acc, s) => acc + (s.orderValue || 0), 0).toFixed(2)
  );

  const periodLabel = `${sevenDaysAgo.toLocaleDateString('pt-BR')} a ${now.toLocaleDateString('pt-BR')}`;

  const lines = [
    `📊 *RELATÓRIO SEMANAL — RADAR DE OFERTAS*`,
    `📅 Período: ${periodLabel}`,
    ``,
    `🖱️ *Cliques na semana:* *${currentWeekClicks}* (${clicksComparisonText})`,
    bestOffer
      ? `🏆 *Melhor oferta da semana:* *${bestOffer.title}* (${bestOffer.store} · ${bestOffer.clicks} clique(s))`
      : `🏆 *Melhor oferta da semana:* Nenhuma oferta clicada no período`,
    `💰 *Vendas convertidas (7d):* *${currentWeekSalesCount}* (Total: R$ ${currentWeekSalesValue.toFixed(2).replace('.', ',')})`,
    ``,
    `🎯 _Gerado automaticamente pelo Painel Radar de Ofertas_`,
  ];
  const reportMessageText = lines.join('\n');

  const channelsDispatched = {
    whatsapp: {
      attempted: false,
      ok: false,
      detail: 'Disparo desativado ou apenas pré-visualização.',
    },
    email: {
      attempted: false,
      ok: false,
      detail: 'Disparo não solicitado.',
    },
  };

  if (options?.dispatchNow) {
    const db = readDatabase();
    const destGroup = (db.groups || []).find((g) => g.isDestination);

    if (settings.weeklyReportWhatsapp) {
      const isoNow = now.toISOString();
      const reportJob: PublicationJob = {
        id: `weekly-rep-${Date.now()}`,
        userId,
        originType: 'fila',
        targetJid: destGroup?.groupJid || 'status@broadcast',
        targetName: destGroup?.name || 'Relatório Semanal Automático',
        messageText: reportMessageText,
        mediaType: 'none',
        originalUrl: 'https://radardeofertas.com.br/estatisticas',
        cleanUrl: 'https://radardeofertas.com.br/estatisticas',
        affiliateUrl: appendChannelSrcParam('https://radardeofertas.com.br/estatisticas', 'whatsapp'),
        linkVerified: true,
        status: 'agendado',
        scheduledFor: isoNow,
        attempts: 0,
        maxAttempts: 3,
        createdAt: isoNow,
        updatedAt: isoNow,
      };
      await savePublicationJob(reportJob);
      channelsDispatched.whatsapp = {
        attempted: true,
        ok: true,
        detail: `Relatório semanal enfileirado no motor do WhatsApp (${reportJob.targetName}).`,
      };
    }

    const targetEmail = (options.emailOverride ?? settings.weeklyReportEmail ?? '').trim();
    channelsDispatched.email = await sendWeeklyReportEmailIfConfigured({
      toEmail: targetEmail,
      subject: `📊 Relatório Semanal Radar de Ofertas (${periodLabel})`,
      textBody: reportMessageText.replace(/\*/g, '').replace(/_/g, ''),
    });

    await saveIntelligenceSettings(userId, {
      lastWeeklyReportSentAt: now.toISOString(),
    });

    await updateBackgroundJobStatus(userId, 'weekly_report', {
      lastStatus: 'ok',
      lastError: null,
      itemsProcessed: 1,
    });
  }

  return {
    periodLabel,
    currentWeekClicks,
    previousWeekClicks,
    clicksDiffPct,
    clicksComparisonText,
    currentWeekSalesCount,
    currentWeekSalesValue,
    bestOffer,
    reportMessageText,
    channelsDispatched,
    generatedAt: now.toISOString(),
  };
}

// ============================================================================
// 6. EQUIPE (DONO E COLABORADOR) E MÚLTIPLOS CANAIS (ULTIMATE)
// ============================================================================

export async function listTeamAndChannels(userId: string = ADMIN_UUID): Promise<{
  members: TeamMemberRecord[];
  channels: WorkspaceChannelRecord[];
}> {
  let members = readLocalFile<TeamMemberRecord[]>(LOCAL_TEAM_FILE, []).filter(
    (m) => !m.workspaceOwnerId || m.workspaceOwnerId === userId
  );

  // Garantir que o titular (Dono) exista por padrão para o usuário único atual
  if (!members.some((m) => m.role === 'dono')) {
    const defaultOwner: TeamMemberRecord = {
      id: `owner-${userId.slice(0, 8)}`,
      workspaceOwnerId: userId,
      name: 'Administrador Principal (Titular)',
      email: 'titular@radardeofertas.com.br',
      role: 'dono',
      permissions: {
        canPostOffers: true,
        canApproveRadar: true,
        canManageConnections: true,
        canViewMetrics: true,
      },
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    members = [defaultOwner, ...members];
    const allMembers = readLocalFile<TeamMemberRecord[]>(LOCAL_TEAM_FILE, []);
    writeLocalFile(LOCAL_TEAM_FILE, [defaultOwner, ...allMembers]);
  }

  const channels = readLocalFile<WorkspaceChannelRecord[]>(LOCAL_CHANNELS_FILE, []).filter(
    (c) => !c.userId || c.userId === userId
  );

  return { members, channels };
}

export async function upsertTeamMember(
  userId: string,
  input: {
    id?: string;
    name: string;
    email: string;
    role: 'dono' | 'colaborador';
    permissions?: Partial<TeamMemberPermissions>;
  }
): Promise<TeamMemberRecord> {
  const allMembers = readLocalFile<TeamMemberRecord[]>(LOCAL_TEAM_FILE, []);
  const cleanEmail = input.email.trim().toLowerCase();
  const isOwner = input.role === 'dono';

  const permissions: TeamMemberPermissions = isOwner
    ? {
        canPostOffers: true,
        canApproveRadar: true,
        canManageConnections: true,
        canViewMetrics: true,
      }
    : {
        canPostOffers: input.permissions?.canPostOffers ?? true,
        canApproveRadar: input.permissions?.canApproveRadar ?? true,
        canManageConnections: input.permissions?.canManageConnections ?? false,
        canViewMetrics: input.permissions?.canViewMetrics ?? true,
      };

  const existingIdx = allMembers.findIndex(
    (m) =>
      m.workspaceOwnerId === userId &&
      ((input.id && m.id === input.id) || m.email.toLowerCase() === cleanEmail)
  );

  let record: TeamMemberRecord;
  if (existingIdx >= 0) {
    record = {
      ...allMembers[existingIdx],
      name: input.name.trim(),
      email: cleanEmail,
      role: input.role,
      permissions,
    };
    allMembers[existingIdx] = record;
  } else {
    record = {
      id: crypto.randomUUID(),
      workspaceOwnerId: userId,
      name: input.name.trim(),
      email: cleanEmail,
      role: input.role,
      permissions,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    allMembers.push(record);
  }

  writeLocalFile(LOCAL_TEAM_FILE, allMembers);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('team_members').upsert(
        {
          id: record.id,
          workspace_owner_id: userId,
          name: record.name,
          email: record.email,
          role: record.role,
          permissions: record.permissions,
          status: record.status,
          created_at: record.createdAt,
        },
        { onConflict: 'workspace_owner_id,email' }
      );
    } catch {}
  }

  return record;
}

export async function removeTeamMember(userId: string, memberId: string): Promise<boolean> {
  const allMembers = readLocalFile<TeamMemberRecord[]>(LOCAL_TEAM_FILE, []);
  const target = allMembers.find((m) => m.id === memberId && m.workspaceOwnerId === userId);
  if (!target || target.role === 'dono') {
    return false; // Nunca remover o titular dono da conta
  }

  const kept = allMembers.filter((m) => !(m.id === memberId && m.workspaceOwnerId === userId));
  writeLocalFile(LOCAL_TEAM_FILE, kept);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase
        .from('team_members')
        .delete()
        .eq('id', memberId)
        .eq('workspace_owner_id', userId);
    } catch {}
  }

  return true;
}

export async function upsertWorkspaceChannel(
  userId: string,
  input: {
    id?: string;
    channelType: 'whatsapp' | 'telegram';
    label: string;
    targetIdentifier: string;
    isDefault?: boolean;
  }
): Promise<WorkspaceChannelRecord> {
  const allChannels = readLocalFile<WorkspaceChannelRecord[]>(LOCAL_CHANNELS_FILE, []);

  if (input.isDefault) {
    for (const c of allChannels) {
      if (c.userId === userId && c.channelType === input.channelType) {
        c.isDefault = false;
      }
    }
  }

  const existingIdx = input.id
    ? allChannels.findIndex((c) => c.id === input.id && c.userId === userId)
    : -1;

  let record: WorkspaceChannelRecord;
  if (existingIdx >= 0) {
    record = {
      ...allChannels[existingIdx],
      channelType: input.channelType,
      label: input.label.trim(),
      targetIdentifier: input.targetIdentifier.trim(),
      isDefault: Boolean(input.isDefault),
    };
    allChannels[existingIdx] = record;
  } else {
    record = {
      id: crypto.randomUUID(),
      userId,
      channelType: input.channelType,
      label: input.label.trim(),
      targetIdentifier: input.targetIdentifier.trim(),
      isDefault: Boolean(input.isDefault),
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    allChannels.push(record);
  }

  writeLocalFile(LOCAL_CHANNELS_FILE, allChannels);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('workspace_channels').upsert({
        id: record.id,
        user_id: userId,
        channel_type: record.channelType,
        label: record.label,
        target_identifier: record.targetIdentifier,
        is_default: record.isDefault,
        is_active: record.isActive,
        created_at: record.createdAt,
      });
    } catch {}
  }

  return record;
}

export async function removeWorkspaceChannel(
  userId: string,
  channelId: string
): Promise<boolean> {
  const allChannels = readLocalFile<WorkspaceChannelRecord[]>(LOCAL_CHANNELS_FILE, []);
  const kept = allChannels.filter((c) => !(c.id === channelId && c.userId === userId));
  writeLocalFile(LOCAL_CHANNELS_FILE, kept);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase
        .from('workspace_channels')
        .delete()
        .eq('id', channelId)
        .eq('user_id', userId);
    } catch {}
  }

  return kept.length !== allChannels.length;
}

// ============================================================================
// 7. MOTOR DE SEGUNDO PLANO UNIFICADO E PAINEL DE STATUS
// ============================================================================

const JOB_DEFINITIONS: Array<{
  key: BackgroundJobKey;
  label: string;
  cadenceDescription: string;
  intervalMinutes: number;
}> = [
  {
    key: 'scheduled_posts',
    label: 'Fila de Envios e Agendamentos (WhatsApp / Telegram)',
    cadenceDescription: 'A cada 1 minuto (respeitando Envio Seguro)',
    intervalMinutes: 1,
  },
  {
    key: 'price_drop_alerts',
    label: 'Monitor de Alertas de Queda de Preço',
    cadenceDescription: 'A cada 30 minutos',
    intervalMinutes: 30,
  },
  {
    key: 'opportunity_radar',
    label: 'Radar de Oportunidades (Fila de Revisão)',
    cadenceDescription: 'A cada 60 minutos (nunca posta sozinho)',
    intervalMinutes: 60,
  },
  {
    key: 'weekly_report',
    label: 'Relatório Semanal Automático (WhatsApp / E-mail)',
    cadenceDescription: 'Semanal (Segundas-feiras às 09:00)',
    intervalMinutes: 7 * 24 * 60,
  },
];

export async function getBackgroundJobsStatus(
  userId: string = ADMIN_UUID
): Promise<BackgroundJobStatusRecord[]> {
  const allStored = readLocalFile<Record<string, BackgroundJobStatusRecord>>(
    LOCAL_BG_STATUS_FILE,
    {}
  );
  const now = new Date();

  return JOB_DEFINITIONS.map((def) => {
    const key = `${userId}::${def.key}`;
    const existing = allStored[key];
    const defaultNext = new Date(now.getTime() + def.intervalMinutes * 60 * 1000).toISOString();

    return {
      userId,
      jobKey: def.key,
      jobLabel: def.label,
      cadenceDescription: def.cadenceDescription,
      lastRunAt: existing?.lastRunAt || null,
      nextRunAt: existing?.nextRunAt || defaultNext,
      lastStatus: existing?.lastStatus || 'idle',
      lastError: existing?.lastError || null,
      itemsProcessed: existing?.itemsProcessed || 0,
      updatedAt: existing?.updatedAt || now.toISOString(),
    };
  });
}

export async function updateBackgroundJobStatus(
  userId: string,
  jobKey: BackgroundJobKey,
  update: {
    lastStatus: 'idle' | 'running' | 'ok' | 'error';
    lastError: string | null;
    itemsProcessed: number;
  }
): Promise<BackgroundJobStatusRecord> {
  const def = JOB_DEFINITIONS.find((d) => d.key === jobKey) || JOB_DEFINITIONS[0];
  const now = new Date();
  const nextRunAt = new Date(now.getTime() + def.intervalMinutes * 60 * 1000).toISOString();

  const record: BackgroundJobStatusRecord = {
    userId,
    jobKey,
    jobLabel: def.label,
    cadenceDescription: def.cadenceDescription,
    lastRunAt: now.toISOString(),
    nextRunAt,
    lastStatus: update.lastStatus,
    lastError: update.lastError,
    itemsProcessed: update.itemsProcessed,
    updatedAt: now.toISOString(),
  };

  const allStored = readLocalFile<Record<string, BackgroundJobStatusRecord>>(
    LOCAL_BG_STATUS_FILE,
    {}
  );
  allStored[`${userId}::${jobKey}`] = record;
  writeLocalFile(LOCAL_BG_STATUS_FILE, allStored);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('background_jobs_status').upsert(
        {
          user_id: userId,
          job_key: jobKey,
          last_run_at: record.lastRunAt,
          next_run_at: record.nextRunAt,
          last_status: record.lastStatus,
          last_error: record.lastError,
          items_processed: record.itemsProcessed,
          updated_at: record.updatedAt,
        },
        { onConflict: 'user_id,job_key' }
      );
    } catch {}
  }

  return record;
}

/**
 * Executa um ciclo unificado do motor de segundo plano reaproveitando `runWorkerCycle`.
 */
export async function runUnifiedBackgroundCycle(
  userId: string = ADMIN_UUID,
  targetJob?: BackgroundJobKey | 'all'
): Promise<{
  ok: boolean;
  statuses: BackgroundJobStatusRecord[];
  summary: string;
}> {
  const runAll = !targetJob || targetJob === 'all';
  const summaryParts: string[] = [];

  // 1. Fila de postagens agendadas / envio seguro
  if (runAll || targetJob === 'scheduled_posts') {
    try {
      const workerRep = await runWorkerCycle();
      const firstErr = workerRep.results.find((r) => !r.success)?.error || null;
      await updateBackgroundJobStatus(userId, 'scheduled_posts', {
        lastStatus: firstErr ? 'error' : 'ok',
        lastError: firstErr,
        itemsProcessed: workerRep.processedCount,
      });
      summaryParts.push(`Fila de envios: ${workerRep.processedCount} processado(s)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateBackgroundJobStatus(userId, 'scheduled_posts', {
        lastStatus: 'error',
        lastError: msg,
        itemsProcessed: 0,
      });
    }
  }

  // 2. Alertas de queda de preço
  if (runAll || targetJob === 'price_drop_alerts') {
    try {
      const alertRes = await evaluateAndTriggerPriceDropAlerts(userId);
      summaryParts.push(
        `Alertas de preço: ${alertRes.checkedCount} verificado(s), ${alertRes.triggeredCount} disparado(s)`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateBackgroundJobStatus(userId, 'price_drop_alerts', {
        lastStatus: 'error',
        lastError: msg,
        itemsProcessed: 0,
      });
    }
  }

  // 3. Radar de oportunidades (fila de revisão)
  if (runAll || targetJob === 'opportunity_radar') {
    try {
      const radarRes = await runOpportunityRadarScan(userId);
      summaryParts.push(
        `Radar de oportunidades: ${radarRes.queuedForReviewCount} nova(s) na fila de revisão`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateBackgroundJobStatus(userId, 'opportunity_radar', {
        lastStatus: 'error',
        lastError: msg,
        itemsProcessed: 0,
      });
    }
  }

  // 4. Relatório semanal (se acionado especificamente)
  if (targetJob === 'weekly_report') {
    try {
      await generateAndSendWeeklyReport(userId, { dispatchNow: true });
      summaryParts.push('Relatório semanal gerado e disparado');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateBackgroundJobStatus(userId, 'weekly_report', {
        lastStatus: 'error',
        lastError: msg,
        itemsProcessed: 0,
      });
    }
  }

  const statuses = await getBackgroundJobsStatus(userId);
  return {
    ok: true,
    statuses,
    summary: summaryParts.join(' · ') || 'Ciclo de segundo plano concluído.',
  };
}
