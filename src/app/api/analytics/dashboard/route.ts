import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { getDatabase, readDatabase } from '@/lib/server/storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { PublicationJob } from '@/lib/types';

export const dynamic = 'force-dynamic';

function getMarketplaceFromUrl(url: string = ''): string {
  const u = url.toLowerCase();
  if (u.includes('mercadolivre') || u.includes('meli.la')) return 'Mercado Livre';
  if (u.includes('shopee') || u.includes('shope.ee')) return 'Shopee';
  if (u.includes('amazon') || u.includes('amzn.to')) return 'Amazon';
  if (u.includes('netshoes') || u.includes('linksynergy') || u.includes('zattini')) return 'Netshoes';
  if (u.includes('magalu') || u.includes('magazineluiza')) return 'Magalu';
  return 'Outros';
}

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    let db;
    try {
      db = await getDatabase();
    } catch {
      db = readDatabase();
    }

    const { searchParams } = new URL(req.url);
    const range = searchParams.get('period') || '7d'; // 'today', '7d', '30d', 'all'

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // 1. Integrantes de grupos do WhatsApp
    const destinationGroups = (db.groups || []).filter((g) => g.isDestination);
    const totalMembers = destinationGroups.reduce((acc, g) => acc + (g.participantCount || 0), 0);
    const groupSummaries = destinationGroups.map((g) => ({
      name: g.name,
      jid: g.groupJid,
      participants: g.participantCount || 0,
    }));

    // 2. Estatísticas de Envios
    const jobs: PublicationJob[] = db.jobs || [];

    let periodStart = new Date(0);
    if (range === 'today') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === '7d') {
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const periodJobs = jobs.filter((j) => {
      const dt = new Date(j.sentAt || j.createdAt);
      return dt >= periodStart;
    });

    const totalSent = periodJobs.filter((j) => j.status === 'enviado').length;
    const totalFailed = periodJobs.filter((j) => j.status === 'falha' || j.status === 'quarentena').length;
    const totalAttempted = totalSent + totalFailed;
    const successRate = totalAttempted > 0 ? Math.round((totalSent / totalAttempted) * 100) : 100;

    // Métricas por períodos pré-definidos
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const sentToday = jobs.filter((j) => j.status === 'enviado' && new Date(j.sentAt || j.createdAt) >= startOfToday).length;
    const sentWeek = jobs.filter((j) => j.status === 'enviado' && new Date(j.sentAt || j.createdAt) >= startOfWeek).length;
    const sentMonth = jobs.filter((j) => j.status === 'enviado' && new Date(j.sentAt || j.createdAt) >= startOfMonth).length;

    // Distribuição por Marketplace
    const marketplaceCounts: Record<string, number> = {
      'Mercado Livre': 0,
      'Shopee': 0,
      'Amazon': 0,
      'Netshoes': 0,
      'Magalu': 0,
    };

    periodJobs.forEach((j) => {
      if (j.status === 'enviado') {
        const mp = getMarketplaceFromUrl(j.affiliateUrl || j.cleanUrl || j.messageText);
        if (marketplaceCounts[mp] !== undefined) {
          marketplaceCounts[mp]++;
        } else {
          marketplaceCounts['Outros'] = (marketplaceCounts['Outros'] || 0) + 1;
        }
      }
    });

    // 3. Série Temporal dos últimos 7 dias para o gráfico
    const timelineDays: { date: string; label: string; sent: number; clicks: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const isoDate = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });

      const daySent = jobs.filter((j) => {
        if (j.status !== 'enviado') return false;
        const jobDate = (j.sentAt || j.createdAt || '').slice(0, 10);
        return jobDate === isoDate;
      }).length;

      timelineDays.push({
        date: isoDate,
        label: dayLabel,
        sent: daySent,
        clicks: 0, // preenchido via Supabase se disponível
      });
    }

    // 4. Métricas de Cliques (via Supabase se configurado)
    let totalClicks = 0;
    let topProducts: Array<{ title: string; clicks: number; store: string; link: string }> = [];

    if (isSupabaseConfigured && supabase) {
      try {
        const { count, error: errCount } = await supabase
          .from('click_events')
          .select('*', { count: 'exact', head: true });
        if (!errCount && typeof count === 'number') {
          totalClicks = count;
        }

        // Cliques dos últimos 7 dias na série temporal
        const { data: recentClicks } = await supabase
          .from('click_events')
          .select('created_at')
          .gte('created_at', timelineDays[0].date);

        if (recentClicks && Array.isArray(recentClicks)) {
          recentClicks.forEach((c) => {
            const dateStr = (c.created_at || '').slice(0, 10);
            const foundDay = timelineDays.find((d) => d.date === dateStr);
            if (foundDay) {
              foundDay.clicks++;
            }
          });
        }

        // Top produtos com mais cliques
        const { data: topLinks } = await supabase
          .from('tracked_links')
          .select('*')
          .order('clicks_count', { ascending: false })
          .limit(5);

        if (topLinks && Array.isArray(topLinks) && topLinks.length > 0) {
          topProducts = topLinks.map((tl) => ({
            title: tl.product_title || 'Oferta em Destaque',
            clicks: tl.clicks_count || 0,
            store: tl.store || getMarketplaceFromUrl(tl.destination_url),
            link: tl.destination_url,
          }));
        }
      } catch {}
    }

    // Se não há dados no Supabase para top products, compõe com os produtos mais recentes enviados
    if (topProducts.length === 0) {
      const recentJobs = jobs.filter((j) => j.status === 'enviado').slice(0, 5);
      topProducts = recentJobs.map((j) => ({
        title: j.targetName || 'Oferta Publicada',
        clicks: 0,
        store: getMarketplaceFromUrl(j.affiliateUrl),
        link: j.affiliateUrl,
      }));
    }

    const daysCount = range === 'today' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 60;
    const dailyAverageClicks = Math.round((totalClicks / (daysCount || 1)) * 10) / 10;

    return NextResponse.json({
      ok: true,
      summary: {
        totalMembers,
        destinationGroupsCount: destinationGroups.length,
        totalSent,
        totalFailed,
        successRate,
        sentToday,
        sentWeek,
        sentMonth,
        totalClicks,
        dailyAverageClicks,
      },
      groups: groupSummaries,
      marketplaceBreakdown: marketplaceCounts,
      timeline: timelineDays,
      topProducts,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'Falha ao processar estatísticas.' }, { status: 500 });
  }
}
