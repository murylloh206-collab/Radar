import { NextRequest, NextResponse } from 'next/server';
import { isSentToday, startOfTodaySaoPaulo } from '@/lib/server/daily-sent-counter';
import { getDatabase, readDatabase } from '@/lib/server/storage';
import { PublicationJob } from '@/lib/types';
import {
  getUserSubscription,
  isDevEnvironment,
  resolveCurrentUserId,
} from '@/lib/server/plan-guard';
import { planHasFeature } from '@/lib/plans-config';
import {
  ClickOrigin,
  clearTestClicksAndLinks,
  formatStoreDisplayName,
  generateShortCodeForUrl,
  listClickEvents,
  normalizeStoreSlug,
  recordClickEvent,
  registerTrackedLink,
} from '@/lib/server/click-tracker';
import {
  clearTestConvertedSales,
  getStoreSalesSourcesStatus,
  listConvertedSales,
} from '@/lib/server/converted-sales';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const userId = resolveCurrentUserId(req);
    const sub = await getUserSubscription(userId);
    const effectivePlan = sub.effectivePlan;

    const canSeePlatformBasic = planHasFeature(effectivePlan, 'platform_basic_metrics');
    const canSeeFullStoreMetrics = planHasFeature(effectivePlan, 'full_store_metrics');

    const metricsTier: 'impulse' | 'plus' | 'ultimate' = canSeeFullStoreMetrics
      ? 'ultimate'
      : canSeePlatformBasic
      ? 'plus'
      : 'impulse';

    let db;
    try {
      db = await getDatabase();
    } catch {
      db = readDatabase();
    }

    const { searchParams } = new URL(req.url);
    const range = searchParams.get('period') || '7d'; // 'today', '7d', '30d', 'all', 'custom'
    const customStartParam = searchParams.get('startDate');
    const customEndParam = searchParams.get('endDate');

    const now = new Date();
    let periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let periodEnd = now;

    if (range === 'today') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === '7d') {
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (range === 'all') {
      periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (range === 'custom' && customStartParam) {
      const parsedStart = new Date(`${customStartParam}T00:00:00`);
      if (!isNaN(parsedStart.getTime())) periodStart = parsedStart;
      if (customEndParam) {
        const parsedEnd = new Date(`${customEndParam}T23:59:59`);
        if (!isNaN(parsedEnd.getTime())) periodEnd = parsedEnd;
      }
    }

    const periodDays = Math.max(
      1,
      Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000))
    );
    const periodWeeks = Math.max(1, periodDays / 7);
    const periodMonths = Math.max(1, periodDays / 30);

    // 1. Métricas Básicas do WhatsApp (Disponíveis em TODOS os planos: Impulse, Plus e Ultimate)
    const destinationGroups = (db.groups || []).filter((g) => g.isDestination);
    const totalMembers = destinationGroups.reduce((acc, g) => acc + (g.participantCount || 0), 0);
    const groupSummaries = destinationGroups.map((g) => ({
      name: g.name,
      jid: g.groupJid,
      participants: g.participantCount || 0,
    }));

    const jobs: PublicationJob[] = db.jobs || [];
    const periodJobs = jobs.filter((j) => {
      const dt = new Date(j.sentAt || j.createdAt);
      return dt >= periodStart && dt <= periodEnd;
    });

    const totalSent = periodJobs.filter((j) => j.status === 'enviado').length;
    const totalFailed = periodJobs.filter((j) => j.status === 'falha' || j.status === 'quarentena').length;
    const totalAttempted = totalSent + totalFailed;
    const successRate = totalAttempted > 0 ? Math.round((totalSent / totalAttempted) * 100) : 100;

    const startOfToday = startOfTodaySaoPaulo(now);
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(startOfToday.getTime() - (Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', day: 'numeric' }).format(now)) - 1) * 24 * 60 * 60 * 1000);

    const sentToday = jobs.filter((j) => isSentToday(j, now)).length;
    const sentWeek = jobs.filter(
      (j) => j.status === 'enviado' && new Date(j.sentAt || j.createdAt) >= startOfWeek
    ).length;
    const sentMonth = jobs.filter(
      (j) => j.status === 'enviado' && new Date(j.sentAt || j.createdAt) >= startOfMonth
    ).length;
    const totalOffersPostedAllTime = jobs.filter((j) => j.status === 'enviado').length;

    // 2. Consultar eventos reais de cliques (/r/[code])
    const allClicks = await listClickEvents({ userId });
    const clicksLast7DaysList = allClicks.filter(
      (c) => new Date(c.createdAt) >= startOfWeek
    );
    const periodClicksList = allClicks.filter((c) => {
      const dt = new Date(c.createdAt);
      return dt >= periodStart && dt <= periodEnd;
    });

    const whatsappClicks7d = clicksLast7DaysList.filter((c) => c.origin === 'whatsapp').length;
    const whatsappClicksPeriod = periodClicksList.filter((c) => c.origin === 'whatsapp').length;

    // Série temporal dos últimos 7 dias
    const timelineDays: Array<{
      date: string;
      label: string;
      sent: number;
      clicks: number;
      salesCount: number;
      salesValue: number;
    }> = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const isoDate = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });

      const daySent = jobs.filter((j) => {
        if (j.status !== 'enviado') return false;
        const jobDate = (j.sentAt || j.createdAt || '').slice(0, 10);
        return jobDate === isoDate;
      }).length;

      const dayClicks = allClicks.filter((c) => {
        if (metricsTier === 'impulse' && c.origin !== 'whatsapp') return false;
        return c.createdAt.slice(0, 10) === isoDate;
      }).length;

      timelineDays.push({
        date: isoDate,
        label: dayLabel,
        sent: daySent,
        clicks: dayClicks,
        salesCount: 0,
        salesValue: 0,
      });
    }

    // 3. Métricas Básicas da Plataforma (Liberadas apenas para Plus e Ultimate)
    let platformBasic: null | {
      totalClicksAllTime: number;
      totalOffersPosted: number;
      clicksLast7Days: number;
      clicksInPeriod: number;
      dailyAverageClicks: number;
      clicksByOrigin: Record<ClickOrigin, number>;
      recentClicks: Array<{
        id: string;
        code: string;
        productTitle: string;
        store: string;
        origin: ClickOrigin;
        destinationUrl: string;
        createdAt: string;
      }>;
    } = null;

    if (canSeePlatformBasic) {
      const clicksByOrigin: Record<ClickOrigin, number> = {
        whatsapp: 0,
        telegram: 0,
        vitrine: 0,
        card: 0,
        outro: 0,
      };
      periodClicksList.forEach((c) => {
        clicksByOrigin[c.origin] = (clicksByOrigin[c.origin] || 0) + 1;
      });

      platformBasic = {
        totalClicksAllTime: allClicks.length,
        totalOffersPosted: totalOffersPostedAllTime,
        clicksLast7Days: clicksLast7DaysList.length,
        clicksInPeriod: periodClicksList.length,
        dailyAverageClicks: Number((periodClicksList.length / periodDays).toFixed(1)),
        clicksByOrigin,
        recentClicks: periodClicksList.slice(0, 12).map((c) => ({
          id: c.id,
          code: c.code,
          productTitle: c.productTitle,
          store: formatStoreDisplayName(c.store),
          origin: c.origin,
          destinationUrl: c.destinationUrl,
          createdAt: c.createdAt,
        })),
      };
    }

    // Top produtos por cliques
    const productClicksMap = new Map<
      string,
      { title: string; clicks: number; store: string; link: string }
    >();
    const relevantClicksForTop = canSeePlatformBasic
      ? periodClicksList
      : periodClicksList.filter((c) => c.origin === 'whatsapp');

    for (const c of relevantClicksForTop) {
      const key = `${c.store}::${c.productTitle}`;
      const existing = productClicksMap.get(key);
      if (existing) {
        existing.clicks += 1;
      } else {
        productClicksMap.set(key, {
          title: c.productTitle,
          clicks: 1,
          store: formatStoreDisplayName(c.store),
          link: c.destinationUrl,
        });
      }
    }

    const topProducts = Array.from(productClicksMap.values())
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 6);

    // Distribuição de postagens por marketplace
    const marketplaceBreakdown: Record<string, number> = {
      'Mercado Livre': 0,
      Shopee: 0,
      Amazon: 0,
      Netshoes: 0,
      Magalu: 0,
    };

    periodJobs.forEach((j) => {
      if (j.status === 'enviado') {
        const mp = formatStoreDisplayName(normalizeStoreSlug(undefined, j.affiliateUrl || j.cleanUrl || j.messageText));
        if (marketplaceBreakdown[mp] !== undefined) {
          marketplaceBreakdown[mp]++;
        } else {
          marketplaceBreakdown['Outros'] = (marketplaceBreakdown['Outros'] || 0) + 1;
        }
      }
    });

    // 4. Métricas Avançadas por Loja e Vendas Convertidas (Exclusivo ULTIMATE — validado no servidor)
    let ultimateMetrics: null | {
      periodDays: number;
      totals: {
        clicks: number;
        dailyAvgClicks: number;
        weeklyAvgClicks: number;
        monthlyAvgClicks: number;
        salesCount: number;
        totalOrderValue: number;
        totalCommissionValue: number;
        dailyAvgSalesCount: number;
        weeklyAvgSalesCount: number;
        monthlyAvgSalesCount: number;
        dailyAvgSalesValue: number;
        weeklyAvgSalesValue: number;
        monthlyAvgSalesValue: number;
      };
      byStore: Array<{
        storeSlug: string;
        storeName: string;
        isCredsConnected: boolean;
        sourceDescription: string;
        activeDataSources: string[];
        clicks: number;
        dailyAvgClicks: number;
        weeklyAvgClicks: number;
        monthlyAvgClicks: number;
        salesCount: number;
        totalOrderValue: number;
        totalCommissionValue: number;
        dailyAvgSalesValue: number;
        weeklyAvgSalesValue: number;
        monthlyAvgSalesValue: number;
      }>;
      sources: Awaited<ReturnType<typeof getStoreSalesSourcesStatus>>;
      recentSales: Awaited<ReturnType<typeof listConvertedSales>>;
    } = null;

    if (canSeeFullStoreMetrics) {
      const [periodSales, sources] = await Promise.all([
        listConvertedSales({ userId, startDate: periodStart, endDate: periodEnd }),
        getStoreSalesSourcesStatus(userId),
      ]);

      // Preencher vendas na timeline de 7 dias
      for (const s of periodSales) {
        const dStr = s.saleDate.slice(0, 10);
        const dayItem = timelineDays.find((d) => d.date === dStr);
        if (dayItem) {
          dayItem.salesCount += s.quantity || 1;
          dayItem.salesValue = Number((dayItem.salesValue + s.orderValue).toFixed(2));
        }
      }

      const totalOrderValue = Number(
        periodSales.reduce((acc, s) => acc + (s.orderValue || 0), 0).toFixed(2)
      );
      const totalCommissionValue = Number(
        periodSales.reduce((acc, s) => acc + (s.commissionValue || 0), 0).toFixed(2)
      );
      const totalSalesCount = periodSales.length;
      const totalClicksCount = periodClicksList.length;

      const storeSlugs = ['shopee', 'mercadolivre', 'amazon', 'netshoes', 'magalu'];
      const byStore = storeSlugs.map((slug) => {
        const stClicks = periodClicksList.filter((c) => c.store === slug).length;
        const stSales = periodSales.filter((s) => s.store === slug);
        const stOrderVal = Number(
          stSales.reduce((acc, s) => acc + (s.orderValue || 0), 0).toFixed(2)
        );
        const stCommVal = Number(
          stSales.reduce((acc, s) => acc + (s.commissionValue || 0), 0).toFixed(2)
        );
        const srcInfo = sources.find((src) => src.store === slug);
        const activeDataSources = Array.from(new Set(stSales.map((s) => s.dataSource)));

        return {
          storeSlug: slug,
          storeName: formatStoreDisplayName(slug),
          isCredsConnected: Boolean(srcInfo?.isCredsConnected),
          sourceDescription: srcInfo?.sourceDescription || 'Importação de CSV',
          activeDataSources,
          clicks: stClicks,
          dailyAvgClicks: Number((stClicks / periodDays).toFixed(1)),
          weeklyAvgClicks: Number((stClicks / periodWeeks).toFixed(1)),
          monthlyAvgClicks: Number((stClicks / periodMonths).toFixed(1)),
          salesCount: stSales.length,
          totalOrderValue: stOrderVal,
          totalCommissionValue: stCommVal,
          dailyAvgSalesValue: Number((stOrderVal / periodDays).toFixed(2)),
          weeklyAvgSalesValue: Number((stOrderVal / periodWeeks).toFixed(2)),
          monthlyAvgSalesValue: Number((stOrderVal / periodMonths).toFixed(2)),
        };
      });

      ultimateMetrics = {
        periodDays,
        totals: {
          clicks: totalClicksCount,
          dailyAvgClicks: Number((totalClicksCount / periodDays).toFixed(1)),
          weeklyAvgClicks: Number((totalClicksCount / periodWeeks).toFixed(1)),
          monthlyAvgClicks: Number((totalClicksCount / periodMonths).toFixed(1)),
          salesCount: totalSalesCount,
          totalOrderValue,
          totalCommissionValue,
          dailyAvgSalesCount: Number((totalSalesCount / periodDays).toFixed(1)),
          weeklyAvgSalesCount: Number((totalSalesCount / periodWeeks).toFixed(1)),
          monthlyAvgSalesCount: Number((totalSalesCount / periodMonths).toFixed(1)),
          dailyAvgSalesValue: Number((totalOrderValue / periodDays).toFixed(2)),
          weeklyAvgSalesValue: Number((totalOrderValue / periodWeeks).toFixed(2)),
          monthlyAvgSalesValue: Number((totalOrderValue / periodMonths).toFixed(2)),
        },
        byStore,
        sources,
        recentSales: periodSales.slice(0, 25),
      };
    }

    const visibleTotalClicks = canSeePlatformBasic ? periodClicksList.length : whatsappClicksPeriod;

    return NextResponse.json({
      ok: true,
      metricsTier,
      effectivePlan,
      isDevMode: isDevEnvironment(),
      period: {
        range,
        startDate: periodStart.toISOString().slice(0, 10),
        endDate: periodEnd.toISOString().slice(0, 10),
        days: periodDays,
      },
      summary: {
        totalMembers,
        destinationGroupsCount: destinationGroups.length,
        totalSent,
        totalFailed,
        successRate,
        sentToday,
        sentWeek,
        sentMonth,
        totalClicks: visibleTotalClicks,
        whatsappClicks7d,
        dailyAverageClicks: Number((visibleTotalClicks / periodDays).toFixed(1)),
      },
      groups: groupSummaries,
      marketplaceBreakdown,
      timeline: timelineDays,
      topProducts,
      platformBasic,
      ultimateMetrics,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg || 'Falha ao processar estatísticas.' }, { status: 500 });
  }
}

/**
 * Gerador e limpeza de dados de teste em `/r/[code]` — EXCLUSIVO EM DESENVOLVIMENTO (NODE_ENV !== 'production').
 */
export async function POST(req: NextRequest) {
  try {
    if (!isDevEnvironment()) {
      return NextResponse.json(
        {
          ok: false,
          error: 'O gerador e a limpeza de dados de teste estão desabilitados em ambiente de produção.',
        },
        { status: 403 }
      );
    }

    const userId = resolveCurrentUserId(req);
    const body = await req.json().catch(() => ({}));

    if (body.action === 'clear_test_data') {
      const [{ deletedClicks, deletedLinks }, deletedSales] = await Promise.all([
        clearTestClicksAndLinks(userId),
        clearTestConvertedSales(userId),
      ]);
      return NextResponse.json({
        ok: true,
        deletedClicks,
        deletedLinks,
        deletedSales,
        message: `Dados de teste removidos com sucesso (${deletedClicks} clique(s), ${deletedLinks} link(s) e ${deletedSales} venda(s) de teste apagados).`,
      });
    }

    if (body.action === 'simulate_click') {
      const store = normalizeStoreSlug(body.store || 'shopee');
      const origin = (['whatsapp', 'telegram', 'vitrine', 'card', 'outro'].includes(body.origin)
        ? body.origin
        : 'whatsapp') as ClickOrigin;
      const productTitle = String(
        body.productTitle || `Oferta de Teste (${formatStoreDisplayName(store)})`
      ).trim();
      const destinationUrl =
        body.destinationUrl ||
        (store === 'mercadolivre'
          ? 'https://www.mercadolivre.com.br/social/radardeofertas'
          : store === 'amazon'
          ? 'https://www.amazon.com.br/?tag=radardeofertas-20'
          : 'https://s.shopee.com.br/radardeofertas');

      const code = generateShortCodeForUrl(`${destinationUrl}#${productTitle}`, origin);

      await registerTrackedLink({
        userId,
        code,
        destinationUrl,
        store,
        productTitle,
        originDefault: origin,
        isTest: true,
      });

      const event = await recordClickEvent({
        userId,
        code,
        destinationUrl,
        store,
        productTitle,
        origin,
        userAgent: 'RadarTestSimulator/1.0',
        referer: `/estatisticas?simulacao=${origin}`,
        isTest: true,
      });

      return NextResponse.json({
        ok: true,
        event,
        redirectUrl: `/r/${code}?src=${origin}&store=${store}&title=${encodeURIComponent(productTitle)}`,
        message: `Clique de teste (is_test=true) registrado em /r/${code} (${formatStoreDisplayName(store)} · Origem: ${origin.toUpperCase()})!`,
      });
    }

    return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
