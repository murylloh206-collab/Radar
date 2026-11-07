'use client';

import React, { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Users,
  Send,
  CheckCircle2,
  MousePointerClick,
  BarChart2,
  ExternalLink,
  ShoppingBag,
  ShieldCheck,
  RefreshCw,
  Upload,
  FlaskConical,
  Calendar,
  DollarSign,
  TrendingUp,
  AlertCircle,
  X,
} from 'lucide-react';
import { usePlan } from '@/components/PlanProvider';
import { PlanGateCard } from '@/components/PlanGateCard';
import { UltimateIntelligenceHub } from '@/components/UltimateIntelligenceHub';

type ClickOrigin = 'whatsapp' | 'telegram' | 'vitrine' | 'card' | 'outro';

interface DashboardData {
  metricsTier: 'impulse' | 'plus' | 'ultimate';
  effectivePlan: 'impulse' | 'plus' | 'ultimate';
  isDevMode: boolean;
  period: {
    range: string;
    startDate: string;
    endDate: string;
    days: number;
  };
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
    whatsappClicks7d: number;
    dailyAverageClicks: number;
  };
  groups: Array<{ name: string; jid: string; participants: number }>;
  marketplaceBreakdown: Record<string, number>;
  timeline: Array<{
    date: string;
    label: string;
    sent: number;
    clicks: number;
    salesCount: number;
    salesValue: number;
  }>;
  topProducts: Array<{ title: string; clicks: number; store: string; link: string }>;
  platformBasic: null | {
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
  };
  ultimateMetrics: null | {
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
    sources: Array<{
      store: string;
      displayName: string;
      isCredsConnected: boolean;
      supportsOfficialSalesApi: boolean;
      supportsCsvImport: boolean;
      sourceDescription: string;
    }>;
    recentSales: Array<{
      id: string;
      externalOrderId: string;
      store: string;
      productTitle: string;
      orderValue: number;
      commissionValue: number;
      quantity: number;
      status: string;
      dataSource: 'api_oficial_shopee' | 'csv_importado';
      saleDate: string;
    }>;
  };
}

const ORIGIN_LABELS: Record<ClickOrigin, { label: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', color: '#20C997' },
  telegram: { label: 'Telegram', color: '#38BDF8' },
  vitrine: { label: 'Vitrine /@slug', color: '#818CF8' },
  card: { label: 'Card (Feed/Story)', color: '#F472B6' },
  outro: { label: 'Direto / Outro', color: '#94A3B8' },
};

function formatBRL(val: number): string {
  return (val || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function EstatisticasContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { subscription } = usePlan();
  const initialPeriod = searchParams.get('period') || '7d';

  const [period, setPeriod] = useState<string>(initialPeriod);
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Simulador de Cliques /r/[code]
  const [simStore, setSimStore] = useState<string>('shopee');
  const [simOrigin, setSimOrigin] = useState<ClickOrigin>('whatsapp');
  const [simTitle, setSimTitle] = useState<string>('Fritadeira Elétrica Air Fryer 4L');
  const [simulating, setSimulating] = useState(false);
  const [lastRedirectUrl, setLastRedirectUrl] = useState<string | null>(null);

  // Sincronização Shopee & Modal de Importação CSV (Ultimate)
  const [syncingShopee, setSyncingShopee] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvStore, setCsvStore] = useState<string>('mercadolivre');
  const [csvText, setCsvText] = useState<string>('');
  const [isTestCsv, setIsTestCsv] = useState<boolean>(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [clearingTest, setClearingTest] = useState(false);

  const loadMetrics = async (
    selectedPeriod: string,
    isSilent = false,
    startOverride?: string,
    endOverride?: string
  ) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const qs = new URLSearchParams({ period: selectedPeriod });
      if (selectedPeriod === 'custom') {
        qs.set('startDate', startOverride || customStartDate);
        qs.set('endDate', endOverride || customEndDate);
      }
      const res = await fetch(`/api/analytics/dashboard?${qs.toString()}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setData(json);
      }
    } catch {
      // Falha silenciosa de rede
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Recarrega automaticamente quando o período muda OU quando o usuário troca o plano no seletor de teste
  useEffect(() => {
    loadMetrics(period);
  }, [period, subscription.plano]);

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    router.replace(`/estatisticas?period=${newPeriod}`, { scroll: false });
  };

  const handleSimulateClick = async () => {
    setSimulating(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/analytics/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate_click',
          store: simStore,
          origin: simOrigin,
          productTitle: simTitle.trim() || 'Produto em Oferta',
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setLastRedirectUrl(json.redirectUrl || null);
        setFeedback(json.message);
        await loadMetrics(period, true);
      } else {
        setFeedback(json.error || 'Falha ao simular clique.');
      }
    } catch {
      setFeedback('Erro de conexão ao registrar clique de teste.');
    } finally {
      setSimulating(false);
    }
  };

  const handleClearTestData = async () => {
    setClearingTest(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/analytics/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_test_data' }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setLastRedirectUrl(null);
        setFeedback(json.message);
        await loadMetrics(period, true);
      } else {
        setFeedback(json.error || 'Falha ao apagar dados de teste.');
      }
    } catch {
      setFeedback('Erro ao apagar dados de teste.');
    } finally {
      setClearingTest(false);
    }
  };

  const handleSyncShopeeSales = async () => {
    setSyncingShopee(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/analytics/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_shopee', daysBack: 30 }),
      });
      const json = await res.json();
      setFeedback(json.message || json.error || 'Sincronização concluída.');
      await loadMetrics(period, true);
    } catch {
      setFeedback('Erro ao sincronizar com a API Oficial da Shopee.');
    } finally {
      setSyncingShopee(false);
    }
  };

  const handleImportCsv = async () => {
    if (!csvText.trim()) {
      setFeedback('Cole ou carregue o conteúdo do arquivo CSV antes de importar.');
      return;
    }
    setImportingCsv(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/analytics/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import_csv',
          store: csvStore,
          csvText,
          isTest: isTestCsv,
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setShowCsvModal(false);
        setCsvText('');
        setIsTestCsv(false);
        setFeedback(json.message);
        await loadMetrics(period, true);
      } else {
        setFeedback(json.error || 'Falha ao importar CSV.');
      }
    } catch {
      setFeedback('Erro de rede ao importar relatório CSV.');
    } finally {
      setImportingCsv(false);
    }
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setIsTestCsv(false);
        setCsvText(reader.result);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const maxTimelineClicks = useMemo(() => {
    if (!data?.timeline?.length) return 5;
    const max = Math.max(...data.timeline.map((t) => Math.max(t.clicks, t.sent)));
    return max > 0 ? max : 5;
  }, [data]);

  const maxTimelineSalesVal = useMemo(() => {
    if (!data?.timeline?.length) return 100;
    const max = Math.max(...data.timeline.map((t) => t.salesValue || 0));
    return max > 0 ? max : 100;
  }, [data]);

  return (
    <section
      className="rp-page"
      aria-label="Estatísticas do Radar de Ofertas"
      style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60 }}
    >
      {/* Cabeçalho */}
      <header
        className="rp-head"
        style={{
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <span
            className="rp-step"
            style={{ color: '#1CCAF2', fontWeight: 700, fontSize: 12, letterSpacing: 0.5 }}
          >
            RADAR DE OFERTAS / ESTATÍSTICAS ({(data?.effectivePlan || subscription.plano).toUpperCase()})
          </span>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              margin: '4px 0 6px',
              color: '#F8FBFF',
              letterSpacing: '-0.03em',
            }}
          >
            Desempenho, Cliques e Vendas por Plano
          </h1>
          <p className="rp-sub" style={{ margin: 0, fontSize: 13, color: '#8EADC7' }}>
            {data?.metricsTier === 'impulse' &&
              'Plano Impulse: visualizando métricas básicas do WhatsApp.'}
            {data?.metricsTier === 'plus' &&
              'Plano Plus: visualizando métricas básicas da plataforma (total de cliques, ofertas postadas, cliques 7d e origens) + WhatsApp.'}
            {data?.metricsTier === 'ultimate' &&
              'Plano Ultimate: métricas completas por loja cadastrada, vendas convertidas (API Oficial Shopee + CSV), médias diária/semanal/mensal e filtro de datas.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
              <option value="all">Últimos 90 dias</option>
              {data?.metricsTier === 'ultimate' && (
                <option value="custom">📅 Filtro de datas personalizado (Ultimate)</option>
              )}
            </select>
          </label>
        </div>
      </header>

      {/* Filtro de Datas Personalizado (Exclusivo Ultimate) */}
      {period === 'custom' && data?.metricsTier === 'ultimate' && (
        <div
          style={{
            background: '#091526',
            border: '1px solid #1CCAF2',
            borderRadius: 12,
            padding: 14,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <Calendar className="w-4 h-4 text-[#1CCAF2]" />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#F8FBFF' }}>
            Intervalo de datas:
          </span>
          <label style={{ fontSize: 12, color: '#8EADC7', display: 'flex', alignItems: 'center', gap: 6 }}>
            De:
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              style={{
                background: '#040C1A',
                border: '1px solid #1C2E46',
                borderRadius: 6,
                padding: '4px 8px',
                color: '#F8FBFF',
              }}
            />
          </label>
          <label style={{ fontSize: 12, color: '#8EADC7', display: 'flex', alignItems: 'center', gap: 6 }}>
            Até:
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              style={{
                background: '#040C1A',
                border: '1px solid #1C2E46',
                borderRadius: 6,
                padding: '4px 8px',
                color: '#F8FBFF',
              }}
            />
          </label>
          <button
            type="button"
            className="rp-btn rp-primary"
            onClick={() => loadMetrics('custom', false, customStartDate, customEndDate)}
            style={{ padding: '6px 14px', fontSize: 12 }}
          >
            Aplicar filtro
          </button>
        </div>
      )}

      {feedback && (
        <div
          className="rp-panel rp-section"
          style={{
            borderColor: '#1CCAF2',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <p style={{ margin: 0 }}>{feedback}</p>
          {lastRedirectUrl && (
            <a
              href={lastRedirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rp-btn"
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              Testar redirecionamento real {lastRedirectUrl.split('?')[0]} ↗
            </a>
          )}
        </div>
      )}

      {/* SIMULADOR DE CLIQUES DE TESTE (/r/[code]) — EXCLUSIVO EM DESENVOLVIMENTO (NODE_ENV !== 'production') */}
      {data?.isDevMode && (
        <div
          style={{
            background: 'rgba(28, 202, 242, 0.06)',
            border: '1px dashed rgba(28, 202, 242, 0.4)',
            borderRadius: 14,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FlaskConical className="w-5 h-5 text-[#1CCAF2]" />
              <div>
                <strong style={{ fontSize: 14, color: '#F8FBFF', display: 'block' }}>
                  Gerador de Cliques de Teste no Redirecionador (/r/[code]) · Modo Dev
                </strong>
                <span style={{ fontSize: 12, color: '#8EADC7' }}>
                  Todo clique e venda de exemplo gerado aqui é marcado com <code>is_test = true</code> e automaticamente excluído em produção.
                </span>
              </div>
            </div>

            <button
              type="button"
              className="rp-btn rp-quiet"
              disabled={clearingTest}
              onClick={handleClearTestData}
              style={{
                borderColor: 'rgba(239, 68, 68, 0.45)',
                color: '#FCA5A5',
                fontSize: 12,
                padding: '6px 12px',
              }}
            >
              {clearingTest ? 'Apagando...' : '🗑️ Apagar dados de teste'}
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
              marginTop: 12,
              alignItems: 'end',
            }}
          >
            <label className="rp-field" style={{ margin: 0 }}>
              Loja do clique
              <select value={simStore} onChange={(e) => setSimStore(e.target.value)}>
                <option value="shopee">Shopee</option>
                <option value="mercadolivre">Mercado Livre</option>
                <option value="amazon">Amazon</option>
                <option value="netshoes">Netshoes</option>
                <option value="magalu">Magalu</option>
              </select>
            </label>

            <label className="rp-field" style={{ margin: 0 }}>
              Origem do clique
              <select
                value={simOrigin}
                onChange={(e) => setSimOrigin(e.target.value as ClickOrigin)}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
                <option value="vitrine">Vitrine Pública (/@slug)</option>
                <option value="card">Card de Imagem (Feed/Story)</option>
                <option value="outro">Outro / Direto</option>
              </select>
            </label>

            <label className="rp-field" style={{ margin: 0 }}>
              Nome do produto
              <input
                type="text"
                value={simTitle}
                onChange={(e) => setSimTitle(e.target.value)}
                placeholder="Ex: Fone Bluetooth"
              />
            </label>

            <button
              type="button"
              className="rp-btn rp-primary"
              disabled={simulating}
              onClick={handleSimulateClick}
              style={{ height: 40 }}
            >
              {simulating ? 'Registrando...' : '+ Gerar Clique em /r/[code]'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================
          CAMADA 1: MÉTRICAS BÁSICAS DO WHATSAPP (IMPULSE, PLUS E ULTIMATE)
      ======================================================================== */}
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#F8FBFF', margin: '0 0 12px' }}>
          📱 Métricas Básicas do WhatsApp (Disponível em todos os planos)
        </h2>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: 16,
          marginBottom: 28,
        }}
      >
        <div style={{ background: '#091526', border: '1px solid #18283D', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>Integrantes no WhatsApp</span>
            <Users className="w-4 h-4 text-[#1CCAF2]" />
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#F8FBFF' }}>
            {loading ? '…' : (data?.summary.totalMembers || 0).toLocaleString('pt-BR')}
          </div>
          <div style={{ fontSize: 11, color: '#20C997', marginTop: 6 }}>
            {data?.summary.destinationGroupsCount || 0} grupo(s) de destino ativo(s)
          </div>
        </div>

        <div style={{ background: '#091526', border: '1px solid #18283D', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>Ofertas Postadas (WhatsApp)</span>
            <Send className="w-4 h-4 text-[#20C997]" />
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#F8FBFF' }}>
            {loading ? '…' : (data?.summary.totalSent || 0).toLocaleString('pt-BR')}
          </div>
          <div style={{ fontSize: 11, color: '#8EADC7', marginTop: 6 }}>
            Hoje: <strong style={{ color: '#F8FBFF' }}>{data?.summary.sentToday || 0}</strong> · 7 dias:{' '}
            <strong style={{ color: '#F8FBFF' }}>{data?.summary.sentWeek || 0}</strong>
          </div>
        </div>

        <div style={{ background: '#091526', border: '1px solid #18283D', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>Taxa de Entrega WhatsApp</span>
            <CheckCircle2 className="w-4 h-4 text-[#F59E0B]" />
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#F8FBFF' }}>
            {loading ? '…' : `${data?.summary.successRate ?? 100}%`}
          </div>
          <div style={{ fontSize: 11, color: '#8EADC7', marginTop: 6 }}>
            {data?.summary.totalFailed
              ? `${data.summary.totalFailed} falha(s) no período`
              : 'Nenhuma falha de envio'}
          </div>
        </div>

        <div style={{ background: '#091526', border: '1px solid #18283D', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>Cliques vindos do WhatsApp (7d)</span>
            <MousePointerClick className="w-4 h-4 text-[#1CCAF2]" />
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#F8FBFF' }}>
            {loading ? '…' : (data?.summary.whatsappClicks7d || 0).toLocaleString('pt-BR')}
          </div>
          <div style={{ fontSize: 11, color: '#8EADC7', marginTop: 6 }}>
            Rastreados via <code style={{ color: '#1CCAF2' }}>/r/[code]?src=whatsapp</code>
          </div>
        </div>
      </div>

      {/* ========================================================================
          CAMADA 2: MÉTRICAS BÁSICAS DA PLATAFORMA (PLUS E ULTIMATE)
      ======================================================================== */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#F8FBFF', margin: '0 0 12px' }}>
          🌐 Métricas Básicas da Plataforma (Plus e Ultimate)
        </h2>

        <PlanGateCard
          feature="platform_basic_metrics"
          requiredPlan="plus"
          title="Métricas da Plataforma e Origem dos Cliques (Plus e Ultimate)"
          description="Veja o total geral de cliques da plataforma, ofertas postadas, cliques dos últimos 7 dias e de qual canal cada clique veio (WhatsApp, Telegram, Vitrine /@slug ou Cards). Faça upgrade para o Plus."
        >
          {data?.platformBasic && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 16,
                }}
              >
                <div style={{ background: '#091526', border: '1px solid #1C314B', borderRadius: 14, padding: 18 }}>
                  <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>
                    Total de Cliques na Plataforma
                  </span>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#1CCAF2', marginTop: 6 }}>
                    {data.platformBasic.totalClicksAllTime.toLocaleString('pt-BR')}
                  </div>
                  <span style={{ fontSize: 11, color: '#8EADC7' }}>
                    Todos os canais somados (/r/[code])
                  </span>
                </div>

                <div style={{ background: '#091526', border: '1px solid #1C314B', borderRadius: 14, padding: 18 }}>
                  <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>
                    Ofertas Postadas (Total)
                  </span>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#20C997', marginTop: 6 }}>
                    {data.platformBasic.totalOffersPosted.toLocaleString('pt-BR')}
                  </div>
                  <span style={{ fontSize: 11, color: '#8EADC7' }}>
                    Publicações enviadas pela plataforma
                  </span>
                </div>

                <div style={{ background: '#091526', border: '1px solid #1C314B', borderRadius: 14, padding: 18 }}>
                  <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>
                    Cliques nos Últimos 7 Dias
                  </span>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#F8FBFF', marginTop: 6 }}>
                    {data.platformBasic.clicksLast7Days.toLocaleString('pt-BR')}
                  </div>
                  <span style={{ fontSize: 11, color: '#8EADC7' }}>
                    Média de {data.platformBasic.dailyAverageClicks} cliques/dia no período
                  </span>
                </div>
              </div>

              {/* Distribuição por Origem (WhatsApp, Telegram, Vitrine /@slug, Card, Outro) */}
              <div style={{ background: '#091526', border: '1px solid #18283D', borderRadius: 14, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#F8FBFF', margin: '0 0 12px' }}>
                  Cliques por Canal de Origem (/r/[code])
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: 12,
                  }}
                >
                  {(Object.keys(ORIGIN_LABELS) as ClickOrigin[]).map((orig) => {
                    const count = data.platformBasic?.clicksByOrigin[orig] || 0;
                    const info = ORIGIN_LABELS[orig];
                    return (
                      <div
                        key={orig}
                        style={{
                          background: '#050E1C',
                          border: '1px solid #18283D',
                          borderRadius: 10,
                          padding: 12,
                        }}
                      >
                        <span style={{ fontSize: 11, color: info.color, fontWeight: 700 }}>
                          {info.label}
                        </span>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#F8FBFF', marginTop: 4 }}>
                          {count}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Últimos Cliques Rastreados */}
                {data.platformBasic.recentClicks.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: '#8EADC7', margin: '0 0 8px' }}>
                      Últimos cliques registrados (Data, Loja, Produto e Origem)
                    </h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #18283D', color: '#8EADC7', textAlign: 'left' }}>
                            <th style={{ padding: '8px 6px' }}>Data / Hora</th>
                            <th style={{ padding: '8px 6px' }}>Código</th>
                            <th style={{ padding: '8px 6px' }}>Produto</th>
                            <th style={{ padding: '8px 6px' }}>Loja</th>
                            <th style={{ padding: '8px 6px' }}>Origem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.platformBasic.recentClicks.slice(0, 8).map((c) => (
                            <tr key={c.id} style={{ borderBottom: '1px solid #0F1E33', color: '#E2E8F0' }}>
                              <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                                {new Date(c.createdAt).toLocaleString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: '#1CCAF2' }}>
                                /r/{c.code}
                              </td>
                              <td style={{ padding: '8px 6px', fontWeight: 600 }}>{c.productTitle}</td>
                              <td style={{ padding: '8px 6px' }}>{c.store}</td>
                              <td style={{ padding: '8px 6px' }}>
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    background: 'rgba(255,255,255,0.06)',
                                    color: ORIGIN_LABELS[c.origin]?.color || '#94A3B8',
                                  }}
                                >
                                  {ORIGIN_LABELS[c.origin]?.label || c.origin}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </PlanGateCard>
      </div>

      {/* ========================================================================
          CAMADA 3: MÉTRICAS COMPLETAS POR LOJA + VENDAS CONVERTIDAS (ULTIMATE)
      ======================================================================== */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#F8FBFF', margin: 0 }}>
            🏆 Cliques, Vendas Convertidas e Médias por Loja (Exclusivo Ultimate)
          </h2>

          {data?.metricsTier === 'ultimate' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="rp-btn"
                disabled={syncingShopee}
                onClick={handleSyncShopeeSales}
                style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingShopee ? 'animate-spin' : ''}`} />
                {syncingShopee ? 'Consultando Shopee API...' : 'Sincronizar Vendas Shopee (API Oficial)'}
              </button>

              <button
                type="button"
                className="rp-btn rp-primary"
                onClick={() => setShowCsvModal(true)}
                style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Upload className="w-3.5 h-3.5" />
                Importar Relatório de Vendas (CSV)
              </button>
            </div>
          )}
        </div>

        <PlanGateCard
          feature="full_store_metrics"
          requiredPlan="ultimate"
          title="Relatório Completo de Cliques, Vendas Convertidas e Médias por Loja (Ultimate)"
          description="Desbloqueie vendas convertidas com valor total e comissão (via API Oficial da Shopee e importação de relatórios CSV), médias diária, semanal e mensal, separação por cada loja cadastrada mais total geral, gráficos de receita e filtro de datas."
        >
          {data?.ultimateMetrics && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Cards de Total Geral + Médias Diária, Semanal e Mensal */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: 16,
                }}
              >
                <div style={{ background: '#091526', border: '1px solid #1E3A5F', borderRadius: 14, padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>
                      Total Geral de Cliques (Período)
                    </span>
                    <TrendingUp className="w-4 h-4 text-[#1CCAF2]" />
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: '#F8FBFF', margin: '8px 0' }}>
                    {data.ultimateMetrics.totals.clicks.toLocaleString('pt-BR')}
                  </div>
                  <div style={{ fontSize: 11, color: '#8EADC7', lineHeight: 1.5 }}>
                    Média Diária: <strong style={{ color: '#1CCAF2' }}>{data.ultimateMetrics.totals.dailyAvgClicks}</strong> ·
                    Semanal: <strong style={{ color: '#1CCAF2' }}>{data.ultimateMetrics.totals.weeklyAvgClicks}</strong> ·
                    Mensal: <strong style={{ color: '#1CCAF2' }}>{data.ultimateMetrics.totals.monthlyAvgClicks}</strong>
                  </div>
                </div>

                <div style={{ background: '#091526', border: '1px solid #1E3A5F', borderRadius: 14, padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>
                      Vendas Convertidas (Quantidade)
                    </span>
                    <ShoppingBag className="w-4 h-4 text-[#20C997]" />
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: '#20C997', margin: '8px 0' }}>
                    {data.ultimateMetrics.totals.salesCount.toLocaleString('pt-BR')}
                  </div>
                  <div style={{ fontSize: 11, color: '#8EADC7', lineHeight: 1.5 }}>
                    Média Diária: <strong style={{ color: '#F8FBFF' }}>{data.ultimateMetrics.totals.dailyAvgSalesCount}</strong> ·
                    Semanal: <strong style={{ color: '#F8FBFF' }}>{data.ultimateMetrics.totals.weeklyAvgSalesCount}</strong> ·
                    Mensal: <strong style={{ color: '#F8FBFF' }}>{data.ultimateMetrics.totals.monthlyAvgSalesCount}</strong>
                  </div>
                </div>

                <div style={{ background: '#091526', border: '1px solid #1E3A5F', borderRadius: 14, padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>
                      Valor Total Vendido (GMV)
                    </span>
                    <DollarSign className="w-4 h-4 text-[#F59E0B]" />
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#F8FBFF', margin: '8px 0' }}>
                    {formatBRL(data.ultimateMetrics.totals.totalOrderValue)}
                  </div>
                  <div style={{ fontSize: 11, color: '#8EADC7', lineHeight: 1.5 }}>
                    Média Diária: <strong style={{ color: '#F59E0B' }}>{formatBRL(data.ultimateMetrics.totals.dailyAvgSalesValue)}</strong> ·
                    Semanal: <strong style={{ color: '#F59E0B' }}>{formatBRL(data.ultimateMetrics.totals.weeklyAvgSalesValue)}</strong> ·
                    Mensal: <strong style={{ color: '#F59E0B' }}>{formatBRL(data.ultimateMetrics.totals.monthlyAvgSalesValue)}</strong>
                  </div>
                </div>

                <div style={{ background: '#091526', border: '1px solid #1E3A5F', borderRadius: 14, padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>
                      Comissões Afiliado Confirmadas
                    </span>
                    <ShieldCheck className="w-4 h-4 text-[#20C997]" />
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#20C997', margin: '8px 0' }}>
                    {formatBRL(data.ultimateMetrics.totals.totalCommissionValue)}
                  </div>
                  <div style={{ fontSize: 11, color: '#8EADC7', lineHeight: 1.5 }}>
                    Dados reais (API Oficial Shopee + Relatórios CSV importados)
                  </div>
                </div>
              </div>

              {/* Gráficos Lado a Lado: Cliques Diários vs. Valor de Vendas Convertidas */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: 18,
                }}
              >
                <div style={{ background: '#091526', border: '1px solid #18283D', borderRadius: 14, padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#F8FBFF', margin: '0 0 14px' }}>
                    📊 Evolução de Cliques e Disparos (Últimos 7 dias)
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 140, paddingTop: 10 }}>
                    {data.timeline.map((t) => {
                      const clickHeightPct = Math.max(6, Math.round((t.clicks / maxTimelineClicks) * 100));
                      return (
                        <div
                          key={t.date}
                          style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                            height: '100%',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#1CCAF2', fontWeight: 700 }}>
                            {t.clicks}
                          </span>
                          <div
                            title={`${t.label}: ${t.clicks} clique(s), ${t.sent} envio(s)`}
                            style={{
                              width: '100%',
                              maxWidth: 34,
                              height: `${clickHeightPct}%`,
                              background: 'linear-gradient(180deg, #1CCAF2 0%, #0879DF 100%)',
                              borderRadius: '6px 6px 2px 2px',
                            }}
                          />
                          <span style={{ fontSize: 10, color: '#8EADC7' }}>{t.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ background: '#091526', border: '1px solid #18283D', borderRadius: 14, padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#F8FBFF', margin: '0 0 14px' }}>
                    💰 Valor de Vendas Convertidas por Dia (Últimos 7 dias)
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 140, paddingTop: 10 }}>
                    {data.timeline.map((t) => {
                      const valHeightPct = Math.max(
                        6,
                        Math.round(((t.salesValue || 0) / maxTimelineSalesVal) * 100)
                      );
                      return (
                        <div
                          key={t.date}
                          style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                            height: '100%',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <span style={{ fontSize: 10, color: '#20C997', fontWeight: 700 }}>
                            {t.salesValue > 0 ? `R$${Math.round(t.salesValue)}` : '0'}
                          </span>
                          <div
                            title={`${t.label}: ${t.salesCount} venda(s) — ${formatBRL(t.salesValue)}`}
                            style={{
                              width: '100%',
                              maxWidth: 34,
                              height: `${valHeightPct}%`,
                              background:
                                t.salesValue > 0
                                  ? 'linear-gradient(180deg, #20C997 0%, #0D9488 100%)'
                                  : '#162436',
                              borderRadius: '6px 6px 2px 2px',
                            }}
                          />
                          <span style={{ fontSize: 10, color: '#8EADC7' }}>{t.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Tabela Separada por Loja Cadastrada + Total Geral */}
              <div style={{ background: '#091526', border: '1px solid #18283D', borderRadius: 14, padding: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F8FBFF', margin: '0 0 6px' }}>
                  Desempenho Separado por Loja Cadastrada + Total Geral
                </h3>
                <p style={{ margin: '0 0 14px', fontSize: 12, color: '#8EADC7' }}>
                  Cada loja indica transparentemente a origem dos seus dados (API Oficial Shopee ou Importação de Relatório CSV).
                </p>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #18283D', color: '#8EADC7', textAlign: 'left' }}>
                        <th style={{ padding: '10px 8px' }}>Loja</th>
                        <th style={{ padding: '10px 8px' }}>Fonte dos Dados</th>
                        <th style={{ padding: '10px 8px' }}>Cliques (Total)</th>
                        <th style={{ padding: '10px 8px' }}>Média Cliques (D / S / M)</th>
                        <th style={{ padding: '10px 8px' }}>Vendas</th>
                        <th style={{ padding: '10px 8px' }}>Valor Vendido</th>
                        <th style={{ padding: '10px 8px' }}>Comissão</th>
                        <th style={{ padding: '10px 8px' }}>Média Valor (Dia / Sem / Mês)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ultimateMetrics.byStore.map((st) => (
                        <tr key={st.storeSlug} style={{ borderBottom: '1px solid #112236', color: '#F8FBFF' }}>
                          <td style={{ padding: '10px 8px', fontWeight: 700 }}>
                            {st.storeName}
                            {st.isCredsConnected ? (
                              <span
                                style={{
                                  marginLeft: 6,
                                  fontSize: 10,
                                  padding: '1px 6px',
                                  borderRadius: 999,
                                  background: 'rgba(32, 201, 151, 0.15)',
                                  color: '#20C997',
                                }}
                              >
                                Conectada
                              </span>
                            ) : (
                              <Link
                                href="/conexoes"
                                style={{
                                  marginLeft: 6,
                                  fontSize: 10,
                                  color: '#F59E0B',
                                  textDecoration: 'underline',
                                }}
                              >
                                Conectar
                              </Link>
                            )}
                          </td>
                          <td style={{ padding: '10px 8px', fontSize: 11, color: '#94A3B8' }}>
                            {st.activeDataSources.includes('api_oficial_shopee') && (
                              <span className="rp-tag rp-good" style={{ marginRight: 4 }}>
                                API Oficial Shopee
                              </span>
                            )}
                            {st.activeDataSources.includes('csv_importado') && (
                              <span className="rp-tag" style={{ marginRight: 4 }}>
                                CSV Importado
                              </span>
                            )}
                            {st.activeDataSources.length === 0 && (
                              <span>{st.sourceDescription}</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 8px', fontWeight: 700, color: '#1CCAF2' }}>
                            {st.clicks}
                          </td>
                          <td style={{ padding: '10px 8px', color: '#CBD5E1' }}>
                            {st.dailyAvgClicks} / {st.weeklyAvgClicks} / {st.monthlyAvgClicks}
                          </td>
                          <td style={{ padding: '10px 8px', fontWeight: 700 }}>
                            {st.salesCount}
                          </td>
                          <td style={{ padding: '10px 8px', fontWeight: 700 }}>
                            {formatBRL(st.totalOrderValue)}
                          </td>
                          <td style={{ padding: '10px 8px', fontWeight: 700, color: '#20C997' }}>
                            {formatBRL(st.totalCommissionValue)}
                          </td>
                          <td style={{ padding: '10px 8px', color: '#CBD5E1', fontSize: 11 }}>
                            {formatBRL(st.dailyAvgSalesValue)} / {formatBRL(st.weeklyAvgSalesValue)} /{' '}
                            {formatBRL(st.monthlyAvgSalesValue)}
                          </td>
                        </tr>
                      ))}

                      {/* Linha de Total Geral */}
                      <tr
                        style={{
                          background: 'rgba(28, 202, 242, 0.08)',
                          borderTop: '2px solid #1CCAF2',
                          color: '#F8FBFF',
                          fontWeight: 800,
                        }}
                      >
                        <td style={{ padding: '12px 8px' }}>TOTAL GERAL</td>
                        <td style={{ padding: '12px 8px', fontSize: 11, color: '#1CCAF2' }}>
                          Todas as lojas consolidadas
                        </td>
                        <td style={{ padding: '12px 8px', color: '#1CCAF2' }}>
                          {data.ultimateMetrics.totals.clicks}
                        </td>
                        <td style={{ padding: '12px 8px' }}>
                          {data.ultimateMetrics.totals.dailyAvgClicks} /{' '}
                          {data.ultimateMetrics.totals.weeklyAvgClicks} /{' '}
                          {data.ultimateMetrics.totals.monthlyAvgClicks}
                        </td>
                        <td style={{ padding: '12px 8px', color: '#20C997' }}>
                          {data.ultimateMetrics.totals.salesCount}
                        </td>
                        <td style={{ padding: '12px 8px' }}>
                          {formatBRL(data.ultimateMetrics.totals.totalOrderValue)}
                        </td>
                        <td style={{ padding: '12px 8px', color: '#20C997' }}>
                          {formatBRL(data.ultimateMetrics.totals.totalCommissionValue)}
                        </td>
                        <td style={{ padding: '12px 8px', fontSize: 11 }}>
                          {formatBRL(data.ultimateMetrics.totals.dailyAvgSalesValue)} /{' '}
                          {formatBRL(data.ultimateMetrics.totals.weeklyAvgSalesValue)} /{' '}
                          {formatBRL(data.ultimateMetrics.totals.monthlyAvgSalesValue)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Estado vazio honesto quando nenhuma venda convertida foi sincronizada/importada ainda */}
                {data.ultimateMetrics.totals.salesCount === 0 && (
                  <div
                    style={{
                      marginTop: 16,
                      padding: 16,
                      borderRadius: 12,
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <AlertCircle className="w-5 h-5 text-[#F59E0B]" />
                      <div>
                        <strong style={{ fontSize: 13, color: '#FDE68A', display: 'block' }}>
                          Nenhuma venda convertida registrada neste período (dados 100% reais, sem números falsos)
                        </strong>
                        <span style={{ fontSize: 12, color: '#CBD5E1' }}>
                          Conecte sua conta de afiliado da Shopee em Conexões para puxar vendas via API Oficial ou clique em &quot;Importar Relatório de Vendas (CSV)&quot; para importar vendas do Mercado Livre, Amazon ou Shopee.
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link href="/conexoes" className="rp-btn" style={{ fontSize: 12 }}>
                        Conectar conta de afiliado
                      </Link>
                      <button
                        type="button"
                        className="rp-btn rp-primary"
                        onClick={() => setShowCsvModal(true)}
                        style={{ fontSize: 12 }}
                      >
                        Importar CSV agora
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </PlanGateCard>
      </div>

      {/* Relatório Semanal Automático, Equipe & Status dos Trabalhos em Segundo Plano */}
      <UltimateIntelligenceHub mode="operations" />

      {/* Modal de Importação de Relatório CSV (Fecha ao clicar fora) */}
      {showCsvModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !importingCsv) setShowCsvModal(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 8, 19, 0.78)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#091526',
              border: '1px solid #1C2E46',
              borderRadius: 16,
              maxWidth: 600,
              width: '100%',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 11, color: '#1CCAF2', fontWeight: 700 }}>
                  IMPORTAÇÃO DE CONVERSÕES REAIS (CSV)
                </span>
                <h3 style={{ margin: '2px 0 0', fontSize: 18, color: '#F8FBFF' }}>
                  Importar Relatório de Vendas de Afiliado
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                style={{ background: 'none', border: 'none', color: '#8EADC7', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 12, color: '#8EADC7' }}>
              Importe o arquivo CSV exportado do painel de afiliados do Mercado Livre, Amazon Associados, Shopee ou Netshoes. Cada venda será identificada como <strong>Fonte: CSV Importado</strong>.
            </p>

            <div className="rp-grid">
              <label className="rp-field">
                Loja do relatório
                <select value={csvStore} onChange={(e) => setCsvStore(e.target.value)}>
                  <option value="mercadolivre">Mercado Livre</option>
                  <option value="shopee">Shopee</option>
                  <option value="amazon">Amazon</option>
                  <option value="netshoes">Netshoes</option>
                  <option value="magalu">Magalu</option>
                </select>
              </label>

              <label className="rp-field">
                Selecionar arquivo .CSV
                <input type="file" accept=".csv,text/csv,text/plain" onChange={handleCsvFileUpload} />
              </label>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600 }}>
                  Conteúdo CSV (cabeçalho: pedido, produto, valor, comissao, data):
                </span>
                {data?.isDevMode && (
                  <button
                    type="button"
                    className="rp-btn rp-quiet"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => {
                      const todayIso = new Date().toISOString().slice(0, 10);
                      setIsTestCsv(true);
                      setCsvText(
                        `pedido,produto,valor,comissao,quantidade,data\nPED-TEST-1001,Fritadeira Air Fryer 4L,299.90,23.99,1,${todayIso}\nPED-TEST-1002,Fone Bluetooth Sem Fio TWS,129.90,12.99,1,${todayIso}`
                      );
                    }}
                  >
                    Preencher CSV de exemplo para teste (Dev)
                  </button>
                )}
              </div>
              <textarea
                rows={6}
                value={csvText}
                onChange={(e) => {
                  setIsTestCsv(false);
                  setCsvText(e.target.value);
                }}
                placeholder="pedido,produto,valor,comissao,quantidade,data&#10;MLB-901,Cafeteira Expresso,349.90,27.99,1,2026-11-06"
                style={{
                  width: '100%',
                  background: '#040C1A',
                  border: '1px solid #18283D',
                  borderRadius: 10,
                  padding: 12,
                  color: '#F8FBFF',
                  fontFamily: 'monospace',
                  fontSize: 12,
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="rp-btn rp-quiet"
                onClick={() => setShowCsvModal(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rp-btn rp-primary"
                disabled={importingCsv}
                onClick={handleImportCsv}
              >
                {importingCsv ? 'Importando...' : 'Importar Vendas CSV'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function EstatisticasPage() {
  return (
    <Suspense
      fallback={
        <div className="rp-page">
          <p className="rp-sub">Carregando estatísticas...</p>
        </div>
      }
    >
      <EstatisticasContent />
    </Suspense>
  );
}
