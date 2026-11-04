'use client';

import React, { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Users,
  Send,
  CheckCircle2,
  MousePointerClick,
  TrendingUp,
  BarChart2,
  ExternalLink,
  ShoppingBag,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

interface DashboardData {
  summary: {
    totalMembers: number;
    destinationGroupsCount: number;
    totalSent: number;
    totalFailed: number;
    successRate: number;
    sentToday: number;
    sentWeek: number;
    sentMonth: number;
    totalClicks: number;
    dailyAverageClicks: number;
  };
  groups: Array<{ name: string; jid: string; participants: number }>;
  marketplaceBreakdown: Record<string, number>;
  timeline: Array<{ date: string; label: string; sent: number; clicks: number }>;
  topProducts: Array<{ title: string; clicks: number; store: string; link: string }>;
}

function EstatisticasContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPeriod = searchParams.get('period') || '7d';

  const [period, setPeriod] = useState<string>(initialPeriod);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const loadMetrics = async (selectedPeriod: string, isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await fetch(`/api/analytics/dashboard?period=${selectedPeriod}`, { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.ok) {
        setData(json);
      }
    } catch (e) {
      console.warn('Falha ao carregar dashboard de estatísticas:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMetrics(period);
  }, [period]);

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    router.replace(`/estatisticas?period=${newPeriod}`, { scroll: false });
  };

  const maxTimelineSent = useMemo(() => {
    if (!data?.timeline?.length) return 10;
    const max = Math.max(...data.timeline.map((t) => t.sent));
    return max > 0 ? max : 10;
  }, [data]);

  const totalMarketplaceCount = useMemo(() => {
    if (!data?.marketplaceBreakdown) return 1;
    const sum = Object.values(data.marketplaceBreakdown).reduce((a, b) => a + b, 0);
    return sum > 0 ? sum : 1;
  }, [data]);

  const handleCopyLink = async (url: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopiedLink(url);
      }
    } catch {}
    setTimeout(() => setCopiedLink(null), 2500);
  };

  return (
    <section className="rp-page" aria-label="Estatísticas do Radar de Ofertas" style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60 }}>
      {/* Cabeçalho */}
      <header className="rp-head" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <span className="rp-step" style={{ color: '#1CCAF2', fontWeight: 700, fontSize: 12, letterSpacing: 0.5 }}>
            RADAR DE OFERTAS / ESTATÍSTICAS
          </span>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px', color: '#F8FBFF', letterSpacing: '-0.03em' }}>
            Desempenho e Métricas
          </h1>
          <p className="rp-sub" style={{ margin: 0, fontSize: 13, color: '#8EADC7' }}>
            Acompanhe audiência, entregas no WhatsApp, taxa de conversão e desempenho dos links de afiliados.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => loadMetrics(period, true)}
            disabled={refreshing || loading}
            style={{
              background: '#0D1B31',
              border: '1px solid #1C2E46',
              borderRadius: 8,
              padding: '7px 12px',
              color: '#8EADC7',
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>

          <label className="rp-field" style={{ margin: 0 }}>
            <select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              style={{
                background: '#061225',
                border: '1px solid #1C2E46',
                borderRadius: 8,
                padding: '7px 14px',
                color: '#F8FBFF',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <option value="today">Hoje</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="all">Todo o histórico</option>
            </select>
          </label>
        </div>
      </header>

      {/* Cards de Indicadores Principais (KPIs) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* KPI 1: Integrantes no WhatsApp */}
        <div
          style={{
            background: '#091526',
            border: '1px solid #18283D',
            borderRadius: 14,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>Integrantes no WhatsApp</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(28, 202, 242, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1CCAF2' }}>
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#F8FBFF', lineHeight: 1.1 }}>
              {loading ? '…' : (data?.summary.totalMembers || 0).toLocaleString('pt-BR')}
            </div>
            <div style={{ fontSize: 11, color: '#20C997', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{data?.summary.destinationGroupsCount || 0} grupo(s) conectado(s)</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Ofertas Enviadas */}
        <div
          style={{
            background: '#091526',
            border: '1px solid #18283D',
            borderRadius: 14,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>Ofertas Enviadas</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(32, 201, 151, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#20C997' }}>
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#F8FBFF', lineHeight: 1.1 }}>
              {loading ? '…' : (data?.summary.totalSent || 0).toLocaleString('pt-BR')}
            </div>
            <div style={{ fontSize: 11, color: '#8EADC7', marginTop: 6 }}>
              Hoje: <strong style={{ color: '#F8FBFF' }}>{data?.summary.sentToday || 0}</strong> • Esta semana: <strong style={{ color: '#F8FBFF' }}>{data?.summary.sentWeek || 0}</strong>
            </div>
          </div>
        </div>

        {/* KPI 3: Taxa de Entrega / Sucesso */}
        <div
          style={{
            background: '#091526',
            border: '1px solid #18283D',
            borderRadius: 14,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>Taxa de Sucesso</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F59E0B' }}>
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#F8FBFF', lineHeight: 1.1 }}>
              {loading ? '…' : `${data?.summary.successRate || 100}%`}
            </div>
            <div style={{ fontSize: 11, color: '#8EADC7', marginTop: 6 }}>
              {data?.summary.totalFailed ? `${data.summary.totalFailed} falha(s) registrada(s)` : 'Nenhuma falha de entrega'}
            </div>
          </div>
        </div>

        {/* KPI 4: Cliques Rastreados */}
        <div
          style={{
            background: '#091526',
            border: '1px solid #18283D',
            borderRadius: 14,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>Cliques Rastreados</span>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(28, 202, 242, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1CCAF2' }}>
              <MousePointerClick className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#F8FBFF', lineHeight: 1.1 }}>
              {loading ? '…' : (data?.summary.totalClicks || 0).toLocaleString('pt-BR')}
            </div>
            <div style={{ fontSize: 11, color: '#8EADC7', marginTop: 6 }}>
              Média: <strong style={{ color: '#1CCAF2' }}>{data?.summary.dailyAverageClicks || 0}</strong> cliques/dia (/r/[code])
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos Interativos em SVG (Envios por Dia + Marketplaces) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 24 }}>
        {/* Gráfico 1: Histórico de Envios por Dia */}
        <div style={{ background: '#091526', border: '1px solid #18283D', borderRadius: 14, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#F8FBFF' }}>Volume de Envios Diários</h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8EADC7' }}>Últimos 7 dias de operação automatizada</p>
            </div>
            <span style={{ fontSize: 11, color: '#1CCAF2', fontWeight: 700, background: 'rgba(28, 202, 242, 0.1)', padding: '3px 8px', borderRadius: 6 }}>
              Disparos WhatsApp
            </span>
          </div>

          {/* SVG Bar Chart */}
          <div style={{ width: '100%', height: 180, position: 'relative' }}>
            <svg width="100%" height="100%" viewBox="0 0 460 160" preserveAspectRatio="none">
              <defs>
                <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#1CCAF2" />
                  <stop offset="100%" stop-color="#0879DF" stop-opacity="0.8" />
                </linearGradient>
              </defs>

              {/* Linhas de grade sutis */}
              <line x1="0" y1="40" x2="460" y2="40" stroke="#162537" stroke-dasharray="3 3" />
              <line x1="0" y1="80" x2="460" y2="80" stroke="#162537" stroke-dasharray="3 3" />
              <line x1="0" y1="120" x2="460" y2="120" stroke="#162537" stroke-dasharray="3 3" />

              {/* Barras dinâmicas */}
              {data?.timeline?.map((item, idx) => {
                const totalBars = data.timeline.length;
                const colWidth = 460 / totalBars;
                const barWidth = 32;
                const barX = idx * colWidth + (colWidth - barWidth) / 2;
                const barHeight = maxTimelineSent > 0 ? (item.sent / maxTimelineSent) * 110 : 4;
                const barY = 135 - barHeight;

                return (
                  <g key={item.date}>
                    <rect
                      x={barX}
                      y={barY}
                      width={barWidth}
                      height={Math.max(4, barHeight)}
                      rx="6"
                      fill="url(#barGrad)"
                    />
                    {item.sent > 0 && (
                      <text
                        x={barX + barWidth / 2}
                        y={barY - 6}
                        fill="#F8FBFF"
                        fontSize="11"
                        fontWeight="700"
                        textAnchor="middle"
                      >
                        {item.sent}
                      </text>
                    )}
                    <text
                      x={barX + barWidth / 2}
                      y="152"
                      fill="#8EADC7"
                      fontSize="10"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {item.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Gráfico 2: Desempenho por Marketplace */}
        <div style={{ background: '#091526', border: '1px solid #18283D', borderRadius: 14, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#F8FBFF' }}>Distribuição por Marketplace</h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8EADC7' }}>Participação de cada loja no período</p>
            </div>
            <ShoppingBag className="w-4 h-4 text-slate-400" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { name: 'Mercado Livre', color: '#FFE600', key: 'Mercado Livre' },
              { name: 'Shopee', color: '#FF5722', key: 'Shopee' },
              { name: 'Amazon', color: '#FF9900', key: 'Amazon' },
              { name: 'Netshoes', color: '#C084FC', key: 'Netshoes' },
              { name: 'Magalu', color: '#0086FF', key: 'Magalu' },
            ].map((mp) => {
              const count = data?.marketplaceBreakdown?.[mp.key] || 0;
              const pct = Math.round((count / totalMarketplaceCount) * 100);

              return (
                <div key={mp.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: '#F8FBFF', fontWeight: 600 }}>{mp.name}</span>
                    <span style={{ color: '#8EADC7' }}>
                      <strong style={{ color: '#F8FBFF' }}>{count}</strong> ({pct}%)
                    </span>
                  </div>
                  <div style={{ width: '100%', height: 8, background: '#040C1A', borderRadius: 4, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.max(2, pct)}%`,
                        height: '100%',
                        background: mp.color,
                        borderRadius: 4,
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabela de Produtos com Maior Engajamento */}
      <div style={{ background: '#091526', border: '1px solid #18283D', borderRadius: 14, padding: 22, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#F8FBFF' }}>Produtos Mais Acessados / Disparados</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8EADC7' }}>Ranking de produtos de alta conversão</p>
          </div>
          <TrendingUp className="w-4 h-4 text-cyan-400" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <p className="rp-sub" style={{ textAlign: 'center', padding: '24px 0' }}>Consultando produtos...</p>
          ) : !data?.topProducts?.length ? (
            <p className="rp-sub" style={{ textAlign: 'center', padding: '24px 0' }}>Nenhum produto registrado no período.</p>
          ) : (
            data.topProducts.map((prod, i) => (
              <div
                key={i}
                style={{
                  background: '#061225',
                  border: '1px solid #142335',
                  borderRadius: 10,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 220 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#1CCAF2', width: 20 }}>#{i + 1}</span>
                  <div>
                    <strong style={{ fontSize: 13, color: '#F8FBFF', display: 'block', lineHeight: 1.3 }}>
                      {prod.title}
                    </strong>
                    <span style={{ fontSize: 11, color: '#8EADC7', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      {prod.store}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#20C997' }}>
                      {prod.clicks} cliques
                    </span>
                  </div>

                  {prod.link && (
                    <button
                      type="button"
                      onClick={() => handleCopyLink(prod.link)}
                      style={{
                        background: copiedLink === prod.link ? '#20C997' : '#0D1B31',
                        color: copiedLink === prod.link ? '#040C1A' : '#1CCAF2',
                        border: '1px solid rgba(28, 202, 242, 0.35)',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {copiedLink === prod.link ? '✓ Copiado!' : 'Copiar'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Seção de Grupos Conectados e Audiência */}
      <div style={{ background: '#091526', border: '1px solid #18283D', borderRadius: 14, padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#F8FBFF' }}>Grupos de Destino Conectados</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8EADC7' }}>Audiência confirmada em tempo real pela Evolution API</p>
          </div>
          <Link href="/conexoes?aba=whatsapp" style={{ fontSize: 12, color: '#1CCAF2', fontWeight: 600, textDecoration: 'none' }}>
            Gerenciar grupos →
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {!data?.groups?.length ? (
            <p className="rp-sub" style={{ padding: '16px 0' }}>Nenhum grupo de destino marcado nas configurações.</p>
          ) : (
            data.groups.map((grp) => (
              <div
                key={grp.jid}
                style={{
                  background: '#061225',
                  border: '1px solid #142335',
                  borderRadius: 10,
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong style={{ fontSize: 13, color: '#F8FBFF', display: 'block' }}>{grp.name}</strong>
                  <span style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace' }}>
                    {grp.jid.split('@')[0]}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#1CCAF2' }}>
                    {grp.participants.toLocaleString('pt-BR')}
                  </span>
                  <span style={{ fontSize: 11, color: '#8EADC7', display: 'block' }}>membros</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export default function EstatisticasPage() {
  return (
    <Suspense fallback={<div className="rp-page"><p className="rp-sub">Carregando estatísticas...</p></div>}>
      <EstatisticasContent />
    </Suspense>
  );
}

