'use client';

import React, { useEffect, useState } from 'react';
import {
  BellRing,
  Sparkles,
  Radar,
  FileBarChart2,
  Users,
  Cpu,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Trash2,
  Plus,
  Send,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { PlanGateCard } from './PlanGateCard';
import { usePlan } from './PlanProvider';

interface OfferToCopyPayload {
  title: string;
  price: number;
  originalPrice?: number | null;
  storeDisplayName: string;
  affiliateUrl: string;
  imageUrl?: string | null;
  couponText?: string | null;
}

interface Props {
  mode: 'offers' | 'operations';
  onSelectOfferForCopier?: (offer: OfferToCopyPayload) => void;
}

export function UltimateIntelligenceHub({ mode, onSelectOfferForCopier }: Props) {
  const { subscription } = usePlan();
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  // Form states — Alerta de Queda de Preço
  const [alertTitle, setAlertTitle] = useState('');
  const [alertUrl, setAlertUrl] = useState('');
  const [alertStore, setAlertStore] = useState('mercadolivre');
  const [alertCurrentPrice, setAlertCurrentPrice] = useState('');
  const [alertTargetPrice, setAlertTargetPrice] = useState('');
  const [alertChannel, setAlertChannel] = useState<'whatsapp' | 'telegram' | 'both'>('whatsapp');

  // Form states — Radar de Oportunidades
  const [radarMinDropPct, setRadarMinDropPct] = useState<number>(25);
  const [radarFlashDeals, setRadarFlashDeals] = useState<boolean>(true);

  // Form states — Relatório Semanal
  const [reportEmail, setReportEmail] = useState('');
  const [reportWaEnabled, setReportWaEnabled] = useState(true);

  // Form states — Equipe e Múltiplos Canais
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'dono' | 'colaborador'>('colaborador');
  const [permPost, setPermPost] = useState(true);
  const [permRadar, setPermRadar] = useState(true);
  const [permConn, setPermConn] = useState(false);
  const [permMetrics, setPermMetrics] = useState(true);

  const [channelType, setChannelType] = useState<'whatsapp' | 'telegram'>('whatsapp');
  const [channelLabel, setChannelLabel] = useState('');
  const [channelTarget, setChannelTarget] = useState('');

  const loadIntelligenceData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/intelligence', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.ok) {
        setData(json);
        if (json.settings) {
          setRadarMinDropPct(Number(json.settings.radarMinDropPct ?? 25));
          setRadarFlashDeals(Boolean(json.settings.radarIncludeFlashDeals ?? true));
          setReportEmail(json.settings.weeklyReportEmail || '');
          setReportWaEnabled(Boolean(json.settings.weeklyReportWhatsapp ?? true));
        }
      }
    } catch {
      // Silencioso
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIntelligenceData();
  }, [subscription.plano]);

  const runAction = async (actionKey: string, payload: Record<string, unknown>) => {
    setBusyAction(actionKey);
    setFeedback(null);
    try {
      const res = await fetch('/api/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      setFeedback(json.message || json.error || 'Operação concluída.');
      if (res.ok && json.ok) {
        await loadIntelligenceData(true);
      }
      return json;
    } catch {
      setFeedback('Falha de comunicação com o servidor.');
      return { ok: false };
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const cur = Number(String(alertCurrentPrice).replace(',', '.'));
    const tgt = Number(String(alertTargetPrice).replace(',', '.'));
    const res = await runAction('create_alert', {
      action: 'create_alert',
      productTitle: alertTitle,
      productUrl: alertUrl,
      store: alertStore,
      currentPrice: cur > 0 ? cur : tgt,
      targetPrice: tgt,
      notifyChannel: alertChannel,
    });
    if (res?.ok) {
      setAlertTitle('');
      setAlertUrl('');
      setAlertCurrentPrice('');
      setAlertTargetPrice('');
    }
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await runAction('save_team_member', {
      action: 'save_team_member',
      name: memberName,
      email: memberEmail,
      role: memberRole,
      permissions: {
        canPostOffers: permPost,
        canApproveRadar: permRadar,
        canManageConnections: permConn,
        canViewMetrics: permMetrics,
      },
    });
    if (res?.ok) {
      setShowMemberModal(false);
      setMemberName('');
      setMemberEmail('');
    }
  };

  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await runAction('save_workspace_channel', {
      action: 'save_workspace_channel',
      channelType,
      label: channelLabel,
      targetIdentifier: channelTarget,
    });
    if (res?.ok) {
      setChannelLabel('');
      setChannelTarget('');
    }
  };

  // ==========================================================================
  // MODO 1: CENTRAL DE INTELIGÊNCIA DE OFERTAS (/ofertas)
  // ==========================================================================
  if (mode === 'offers') {
    const whatToPost = data?.whatToPost;
    const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
    const reviewQueue = Array.isArray(data?.reviewQueue) ? data.reviewQueue : [];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 24 }}>
        {feedback && (
          <div
            style={{
              background: 'rgba(245, 197, 66, 0.1)',
              border: '1px solid rgba(245, 197, 66, 0.4)',
              borderRadius: 12,
              padding: '12px 16px',
              color: '#ebe6da',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{feedback}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              style={{ background: 'none', border: 'none', color: '#a8a39a', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* 1. O QUE POSTAR HOJE */}
        <PlanGateCard
          feature="what_to_post_today"
          requiredPlan="ultimate"
          title="💡 O que Postar Hoje — Inteligência de Conversão (Ultimate)"
          description="Descubra automaticamente as categorias e ofertas que mais converteram para o seu público e o melhor horário de disparo com base nas suas métricas reais."
        >
          <div
            style={{
              background: '#0b0b0a',
              border: '1px solid #20201f',
              borderRadius: 16,
              padding: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Sparkles className="w-5 h-5 text-[#f5c542]" />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f6f2e8' }}>
                    O que Postar Hoje (Baseado nas suas Métricas Reais)
                  </h3>
                  <span style={{ fontSize: 12, color: '#a8a39a' }}>
                    Sugestões calculadas exclusivamente a partir dos cliques reais em /r/[code], vendas convertidas e disparos da sua conta.
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="rp-btn rp-quiet"
                onClick={() => loadIntelligenceData()}
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Atualizar análise
              </button>
            </div>

            {loading ? (
              <p style={{ fontSize: 13, color: '#a8a39a' }}>Analisando histórico real de cliques e conversões...</p>
            ) : !whatToPost?.hasEnoughData ? (
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px dashed rgba(245, 158, 11, 0.35)',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
                  <strong style={{ fontSize: 13, color: '#FDE68A' }}>
                    Aguardando dados reais suficientes (Sem números inventados)
                  </strong>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: '#ddd8cc', lineHeight: 1.5 }}>
                  {whatToPost?.emptyStateExplanation ||
                    'Publique suas primeiras ofertas ou acumule cliques reais nos links /r/[code] para destravar as sugestões de melhor horário e categorias campeãs.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                    gap: 12,
                  }}
                >
                  {whatToPost.bestPostingHour && (
                    <div style={{ background: '#090908', border: '1px solid #20201f', borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f5c542', fontSize: 11, fontWeight: 700 }}>
                        <Clock className="w-3.5 h-3.5" /> MELHOR HORÁRIO PARA POSTAR HOJE
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#f6f2e8', marginTop: 4 }}>
                        {whatToPost.bestPostingHour.hourLabel}
                      </div>
                      <span style={{ fontSize: 11, color: '#a8a39a' }}>
                        {whatToPost.bestPostingHour.reason}
                      </span>
                    </div>
                  )}

                  <div style={{ background: '#090908', border: '1px solid #20201f', borderRadius: 12, padding: 14 }}>
                    <div style={{ color: '#5fd0a0', fontSize: 11, fontWeight: 700 }}>
                      CATEGORIAS QUE MAIS CONVERTERAM
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      {whatToPost.topCategories.slice(0, 3).map((cat: any) => (
                        <div key={cat.categoryKey} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <strong style={{ color: '#f6f2e8' }}>{cat.categoryLabel}</strong>
                          <span style={{ color: '#a8a39a' }}>{cat.conversionSignal}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {whatToPost.suggestedOffers?.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#ddd8cc' }}>
                      Ofertas recomendadas para postar ou repostar hoje:
                    </h4>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: 10,
                      }}
                    >
                      {whatToPost.suggestedOffers.map((item: any, idx: number) => (
                        <div
                          key={idx}
                          style={{
                            background: '#090908',
                            border: '1px solid #20201f',
                            borderRadius: 12,
                            padding: 12,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <div>
                            <span style={{ fontSize: 10, color: '#f5c542', fontWeight: 700 }}>
                              {item.storeName}
                            </span>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#f6f2e8', marginTop: 2 }}>
                              {item.title}
                            </div>
                            <div style={{ fontSize: 11, color: '#5fd0a0', marginTop: 4 }}>
                              {item.reason}
                            </div>
                          </div>
                          {onSelectOfferForCopier && item.affiliateUrl && (
                            <button
                              type="button"
                              className="rp-btn rp-quiet"
                              style={{ fontSize: 11, padding: '5px 10px', alignSelf: 'flex-start' }}
                              onClick={() =>
                                onSelectOfferForCopier({
                                  title: item.title,
                                  price: item.price || 99.9,
                                  storeDisplayName: item.storeName,
                                  affiliateUrl: item.affiliateUrl,
                                })
                              }
                            >
                              Enviar para o Copiador →
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </PlanGateCard>

        {/* 2. RADAR DE OPORTUNIDADES (NUNCA POSTA SOZINHO — FILA DE REVISÃO) */}
        <PlanGateCard
          feature="opportunity_radar"
          requiredPlan="ultimate"
          title="🎯 Radar de Oportunidades com Fila de Revisão (Ultimate)"
          description="Detecta automaticamente quedas fortes de preço e ofertas relâmpago no catálogo e histórico de 30 dias, colocando na Fila de Revisão para sua aprovação antes de postar."
        >
          <div
            style={{
              background: '#0b0b0a',
              border: '1px solid #20201f',
              borderRadius: 16,
              padding: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Radar className="w-5 h-5 text-[#5fd0a0]" />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f6f2e8' }}>
                      Radar de Oportunidades
                    </h3>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: 'rgba(95, 208, 160, 0.15)',
                        color: '#5fd0a0',
                        border: '1px solid rgba(95, 208, 160, 0.35)',
                      }}
                    >
                      <ShieldCheck className="w-3 h-3 inline mr-1" />
                      NUNCA POSTA SOZINHO · SEMPRE VAI PARA REVISÃO
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: '#a8a39a' }}>
                    Detecta quedas fortes de preço e ofertas relâmpago e aguarda sua revisão antes de qualquer envio.
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, color: '#ddd8cc', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Queda mínima (%):
                  <input
                    type="number"
                    min={5}
                    max={90}
                    value={radarMinDropPct}
                    onChange={(e) => setRadarMinDropPct(Number(e.target.value || 25))}
                    style={{
                      width: 68,
                      background: '#090908',
                      border: '1px solid #20201f',
                      borderRadius: 6,
                      padding: '4px 8px',
                      color: '#f6f2e8',
                    }}
                  />
                </label>

                <button
                  type="button"
                  className="rp-btn rp-quiet"
                  disabled={busyAction === 'save_settings'}
                  onClick={() =>
                    runAction('save_settings', {
                      action: 'save_settings',
                      radarMinDropPct,
                      radarIncludeFlashDeals: radarFlashDeals,
                    })
                  }
                  style={{ fontSize: 12, padding: '6px 12px' }}
                >
                  Salvar limite
                </button>

                <button
                  type="button"
                  className="rp-btn rp-primary"
                  disabled={busyAction === 'scan_radar'}
                  onClick={() =>
                    runAction('scan_radar', {
                      action: 'scan_radar',
                      minDropPct: radarMinDropPct,
                    })
                  }
                  style={{ fontSize: 12, padding: '6px 14px' }}
                >
                  {busyAction === 'scan_radar' ? 'Escaneando...' : '🔍 Escanear Oportunidades Agora'}
                </button>
              </div>
            </div>

            {reviewQueue.length === 0 ? (
              <div
                style={{
                  background: '#090908',
                  border: '1px dashed #20201f',
                  borderRadius: 12,
                  padding: 16,
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#a8a39a',
                }}
              >
                Nenhuma oportunidade pendente na Fila de Revisão no momento. Clique em &quot;Escanear Oportunidades Agora&quot; para buscar quedas de pelo menos {radarMinDropPct}% OFF no catálogo.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <strong style={{ fontSize: 12, color: '#5fd0a0' }}>
                  Fila de Revisão ({reviewQueue.length} oportunidade(s) aguardando sua decisão):
                </strong>
                {reviewQueue.map((job: any) => (
                  <div
                    key={job.id}
                    style={{
                      background: '#090908',
                      border: '1px solid #20201f',
                      borderRadius: 12,
                      padding: 14,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 700 }}>
                        AGUARDANDO REVISÃO HUMANA
                      </span>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f6f2e8', marginTop: 2 }}>
                        {job.targetName}
                      </div>
                      <div style={{ fontSize: 11, color: '#a8a39a', marginTop: 2 }}>
                        Link rastreado: <code>{job.affiliateUrl}</code>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="rp-btn rp-primary"
                        onClick={() =>
                          runAction(`approve-${job.id}`, {
                            action: 'decide_radar_job',
                            jobId: job.id,
                            decision: 'approve',
                          })
                        }
                        style={{ fontSize: 12, padding: '6px 12px' }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> Aprovar para Envio
                      </button>
                      <button
                        type="button"
                        className="rp-btn rp-quiet"
                        onClick={() =>
                          runAction(`reject-${job.id}`, {
                            action: 'decide_radar_job',
                            jobId: job.id,
                            decision: 'reject',
                          })
                        }
                        style={{ fontSize: 12, padding: '6px 12px', color: '#FCA5A5' }}
                      >
                        <XCircle className="w-3.5 h-3.5 inline mr-1" /> Descartar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PlanGateCard>

        {/* 3. ALERTA DE QUEDA DE PREÇO */}
        <PlanGateCard
          feature="price_drop_alert"
          requiredPlan="ultimate"
          title="🔔 Alerta de Queda de Preço (Ultimate)"
          description="Monitore qualquer produto e defina um valor-meta em R$. Quando o preço cair abaixo dele, o sistema avisa automaticamente por WhatsApp ou Telegram."
        >
          <div
            style={{
              background: '#0b0b0a',
              border: '1px solid #20201f',
              borderRadius: 16,
              padding: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BellRing className="w-5 h-5 text-[#F59E0B]" />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f6f2e8' }}>
                    Monitor e Alerta de Queda de Preço
                  </h3>
                  <span style={{ fontSize: 12, color: '#a8a39a' }}>
                    Cadastre um produto e o valor desejado; receba aviso no WhatsApp ou Telegram assim que atingir a meta.
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="rp-btn rp-quiet"
                disabled={busyAction === 'check_alerts'}
                onClick={() => runAction('check_alerts', { action: 'check_alerts' })}
                style={{ fontSize: 12, padding: '6px 12px' }}
              >
                {busyAction === 'check_alerts' ? 'Verificando...' : '⚡ Verificar Preços Agora'}
              </button>
            </div>

            <form
              onSubmit={handleCreateAlert}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: 10,
                alignItems: 'end',
                marginBottom: 16,
              }}
            >
              <label className="rp-field" style={{ margin: 0 }}>
                Produto monitorado
                <input
                  type="text"
                  required
                  value={alertTitle}
                  onChange={(e) => setAlertTitle(e.target.value)}
                  placeholder="Ex: Air Fryer 4L Mondial"
                />
              </label>

              <label className="rp-field" style={{ margin: 0 }}>
                Link do produto
                <input
                  type="url"
                  required
                  value={alertUrl}
                  onChange={(e) => setAlertUrl(e.target.value)}
                  placeholder="https://mercadolivre.com.br/..."
                />
              </label>

              <label className="rp-field" style={{ margin: 0 }}>
                Preço atual (R$)
                <input
                  type="number"
                  step="0.01"
                  value={alertCurrentPrice}
                  onChange={(e) => setAlertCurrentPrice(e.target.value)}
                  placeholder="349.90"
                />
              </label>

              <label className="rp-field" style={{ margin: 0 }}>
                Avisar abaixo de (R$)
                <input
                  type="number"
                  step="0.01"
                  required
                  value={alertTargetPrice}
                  onChange={(e) => setAlertTargetPrice(e.target.value)}
                  placeholder="279.90"
                />
              </label>

              <label className="rp-field" style={{ margin: 0 }}>
                Canal do aviso
                <select
                  value={alertChannel}
                  onChange={(e) => setAlertChannel(e.target.value as any)}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telegram">Telegram</option>
                  <option value="both">WhatsApp + Telegram</option>
                </select>
              </label>

              <button
                type="submit"
                className="rp-btn rp-primary"
                disabled={busyAction === 'create_alert'}
                style={{ height: 40 }}
              >
                + Criar Alerta
              </button>
            </form>

            {alerts.length === 0 ? (
              <div style={{ fontSize: 12, color: '#a8a39a' }}>
                Nenhum alerta de queda de preço ativo. Preencha os campos acima para monitorar seu primeiro produto.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alerts.map((al: any) => (
                  <div
                    key={al.id}
                    style={{
                      background: '#090908',
                      border: '1px solid #20201f',
                      borderRadius: 10,
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: 13, color: '#f6f2e8' }}>{al.productTitle}</strong>
                      <div style={{ fontSize: 11, color: '#a8a39a' }}>
                        Atual: R$ {Number(al.currentPrice).toFixed(2)} ·{' '}
                        <strong style={{ color: '#5fd0a0' }}>
                          Meta: ≤ R$ {Number(al.targetPrice).toFixed(2)}
                        </strong>{' '}
                        · Canal: {String(al.notifyChannel).toUpperCase()} · Status:{' '}
                        <span style={{ color: al.status === 'triggered' ? '#5fd0a0' : '#f5c542' }}>
                          {al.status === 'triggered' ? 'DISPARADO' : 'MONITORANDO'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      {al.status === 'active' && (
                        <button
                          type="button"
                          className="rp-btn rp-quiet"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          onClick={() =>
                            runAction(`trigger-${al.id}`, {
                              action: 'check_alerts',
                              priceOverrides: { [al.id]: Number((al.targetPrice - 1).toFixed(2)) },
                            })
                          }
                        >
                          Testar Queda para R$ {(al.targetPrice - 1).toFixed(2)}
                        </button>
                      )}
                      <button
                        type="button"
                        className="rp-btn rp-quiet"
                        style={{ fontSize: 11, padding: '4px 8px', color: '#FCA5A5' }}
                        onClick={() =>
                          runAction(`del-${al.id}`, { action: 'delete_alert', alertId: al.id })
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PlanGateCard>
      </div>
    );
  }

  // ==========================================================================
  // MODO 2: RELATÓRIO SEMANAL, EQUIPE & PAINEL DE SEGUNDO PLANO (/conexoes e /estatisticas)
  // ==========================================================================
  const weekly = data?.weeklyReportPreview;
  const team = Array.isArray(data?.team) ? data.team : [];
  const channels = Array.isArray(data?.channels) ? data.channels : [];
  const bgStatuses = Array.isArray(data?.backgroundStatus) ? data.backgroundStatus : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 24 }}>
      {feedback && (
        <div
          style={{
            background: 'rgba(245, 197, 66, 0.1)',
            border: '1px solid rgba(245, 197, 66, 0.4)',
            borderRadius: 12,
            padding: '12px 16px',
            color: '#ebe6da',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ background: 'none', border: 'none', color: '#a8a39a', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. RELATÓRIO SEMANAL AUTOMÁTICO */}
      <PlanGateCard
        feature="weekly_report"
        requiredPlan="ultimate"
        title="📊 Relatório Semanal Automático por WhatsApp e E-mail (Ultimate)"
        description="Receba toda semana o resumo automático de cliques, a melhor oferta da semana e o comparativo com a semana anterior direto no WhatsApp e por e-mail."
      >
        <div
          style={{
            background: '#0b0b0a',
            border: '1px solid #20201f',
            borderRadius: 16,
            padding: 20,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FileBarChart2 className="w-5 h-5 text-[#f5c542]" />
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f6f2e8' }}>
                  Relatório Semanal Automático (WhatsApp + E-mail)
                </h3>
                <span style={{ fontSize: 12, color: '#a8a39a' }}>
                  Comparativo automático de 7 dias vs. semana anterior e destaque da oferta mais clicada.
                </span>
              </div>
            </div>

            <button
              type="button"
              className="rp-btn rp-primary"
              disabled={busyAction === 'send_weekly_report'}
              onClick={() =>
                runAction('send_weekly_report', {
                  action: 'send_weekly_report',
                  email: reportEmail,
                })
              }
              style={{ fontSize: 12, padding: '8px 14px' }}
            >
              <Send className="w-3.5 h-3.5 inline mr-1" />
              {busyAction === 'send_weekly_report' ? 'Enviando...' : 'Disparar Relatório Semanal Agora'}
            </button>
          </div>

          {weekly && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div style={{ background: '#090908', border: '1px solid #20201f', borderRadius: 12, padding: 14 }}>
                <span style={{ fontSize: 11, color: '#a8a39a', fontWeight: 700 }}>
                  CLIQUES NA SEMANA ATUAL vs. ANTERIOR
                </span>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#f5c542', marginTop: 4 }}>
                  {weekly.currentWeekClicks} clique(s)
                </div>
                <span style={{ fontSize: 11, color: '#ddd8cc' }}>
                  {weekly.clicksComparisonText}
                </span>
              </div>

              <div style={{ background: '#090908', border: '1px solid #20201f', borderRadius: 12, padding: 14 }}>
                <span style={{ fontSize: 11, color: '#a8a39a', fontWeight: 700 }}>
                  MELHOR OFERTA DA SEMANA
                </span>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#5fd0a0', marginTop: 6 }}>
                  {weekly.bestOffer
                    ? `${weekly.bestOffer.title} (${weekly.bestOffer.clicks} clique(s))`
                    : 'Nenhuma oferta clicada nesta semana'}
                </div>
                <span style={{ fontSize: 11, color: '#a8a39a' }}>
                  Período: {weekly.periodLabel}
                </span>
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'end',
              paddingTop: 10,
              borderTop: '1px solid #20201f',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#f6f2e8' }}>
              <input
                type="checkbox"
                checked={reportWaEnabled}
                onChange={(e) => setReportWaEnabled(e.target.checked)}
              />
              Enviar resumo pelo WhatsApp
            </label>

            <label className="rp-field" style={{ margin: 0, flex: 1, minWidth: 220 }}>
              E-mail para receber o relatório (Resend / SMTP)
              <input
                type="email"
                value={reportEmail}
                onChange={(e) => setReportEmail(e.target.value)}
                placeholder="seuemail@dominio.com.br"
              />
            </label>

            <button
              type="button"
              className="rp-btn rp-quiet"
              onClick={() =>
                runAction('save_report_settings', {
                  action: 'save_settings',
                  weeklyReportWhatsapp: reportWaEnabled,
                  weeklyReportEmail: reportEmail,
                })
              }
              style={{ height: 38, fontSize: 12 }}
            >
              Salvar preferências
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#a8a39a', marginTop: 8 }}>
            Status de E-mail no Servidor:{' '}
            <strong style={{ color: data?.emailEnvConfigured ? '#5fd0a0' : '#F59E0B' }}>
              {data?.emailEnvConfigured
                ? 'RESEND_API_KEY / SMTP detectado e pronto'
                : 'Apenas WhatsApp ativo (adicione RESEND_API_KEY no .env para habilitar envio por e-mail)'}
            </strong>
          </div>
        </div>
      </PlanGateCard>

      {/* 2. EQUIPE (DONO E COLABORADOR) E MÚLTIPLOS CANAIS */}
      <PlanGateCard
        feature="multi_account_team"
        requiredPlan="ultimate"
        title="👥 Equipe (Dono e Colaborador) e Múltiplos Canais (Ultimate)"
        description="Gerencie permissões de colaboradores e cadastre múltiplos grupos de WhatsApp ou canais do Telegram em uma mesma operação."
      >
        <div
          style={{
            background: '#0b0b0a',
            border: '1px solid #20201f',
            borderRadius: 16,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Users className="w-5 h-5 text-[#5fd0a0]" />
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f6f2e8' }}>
                  Gestão de Equipe e Múltiplos Canais
                </h3>
                <span style={{ fontSize: 12, color: '#a8a39a' }}>
                  Papéis de Dono e Colaborador com permissões granulares + múltiplos canais de disparo.
                </span>
              </div>
            </div>

            <button
              type="button"
              className="rp-btn rp-primary"
              onClick={() => setShowMemberModal(true)}
              style={{ fontSize: 12, padding: '6px 12px' }}
            >
              <Plus className="w-3.5 h-3.5 inline mr-1" /> Adicionar Colaborador
            </button>
          </div>

          {/* Lista de membros da equipe */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {team.map((m: any) => (
              <div
                key={m.id}
                style={{
                  background: '#090908',
                  border: '1px solid #20201f',
                  borderRadius: 10,
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 13, color: '#f6f2e8' }}>{m.name}</strong>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: m.role === 'dono' ? 'rgba(245, 197, 66,0.18)' : 'rgba(168, 167, 164,0.18)',
                        color: m.role === 'dono' ? '#f5c542' : '#ddd8cc',
                      }}
                    >
                      {m.role.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#a8a39a', marginTop: 2 }}>
                    {m.email} · Permissões:{' '}
                    {[
                      m.permissions?.canPostOffers ? 'Postar Ofertas' : null,
                      m.permissions?.canApproveRadar ? 'Aprovar Radar' : null,
                      m.permissions?.canManageConnections ? 'Conexões' : null,
                      m.permissions?.canViewMetrics ? 'Métricas' : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                </div>

                {m.role !== 'dono' && (
                  <button
                    type="button"
                    className="rp-btn rp-quiet"
                    style={{ fontSize: 11, padding: '4px 8px', color: '#FCA5A5' }}
                    onClick={() =>
                      runAction(`rm-member-${m.id}`, {
                        action: 'remove_team_member',
                        memberId: m.id,
                      })
                    }
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Cadastro de canais adicionais */}
          <div style={{ borderTop: '1px solid #20201f', paddingTop: 14 }}>
            <strong style={{ fontSize: 13, color: '#f6f2e8', display: 'block', marginBottom: 8 }}>
              Canais Adicionais do Workspace (WhatsApp / Telegram)
            </strong>
            <form
              onSubmit={handleSaveChannel}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
                alignItems: 'end',
                marginBottom: 12,
              }}
            >
              <label className="rp-field" style={{ margin: 0 }}>
                Tipo de Canal
                <select
                  value={channelType}
                  onChange={(e) => setChannelType(e.target.value as any)}
                >
                  <option value="whatsapp">Grupo WhatsApp</option>
                  <option value="telegram">Canal/Grupo Telegram</option>
                </select>
              </label>

              <label className="rp-field" style={{ margin: 0 }}>
                Nome de identificação
                <input
                  type="text"
                  required
                  value={channelLabel}
                  onChange={(e) => setChannelLabel(e.target.value)}
                  placeholder="Ex: Grupo VIP Ofertas #2"
                />
              </label>

              <label className="rp-field" style={{ margin: 0 }}>
                JID do Grupo ou @ChatID
                <input
                  type="text"
                  required
                  value={channelTarget}
                  onChange={(e) => setChannelTarget(e.target.value)}
                  placeholder="Ex: 1203630...@g.us ou @canal"
                />
              </label>

              <button type="submit" className="rp-btn rp-primary" style={{ height: 40 }}>
                + Adicionar Canal
              </button>
            </form>

            {channels.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {channels.map((ch: any) => (
                  <div
                    key={ch.id}
                    style={{
                      background: '#090908',
                      border: '1px solid #20201f',
                      borderRadius: 8,
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 12,
                    }}
                  >
                    <span>
                      <strong style={{ color: '#f5c542' }}>[{ch.channelType.toUpperCase()}]</strong>{' '}
                      <strong style={{ color: '#f6f2e8' }}>{ch.label}</strong> —{' '}
                      <code style={{ color: '#a8a39a' }}>{ch.targetIdentifier}</code>
                    </span>
                    <button
                      type="button"
                      className="rp-btn rp-quiet"
                      style={{ fontSize: 11, padding: '2px 8px', color: '#FCA5A5' }}
                      onClick={() =>
                        runAction(`rm-ch-${ch.id}`, {
                          action: 'remove_workspace_channel',
                          channelId: ch.id,
                        })
                      }
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </PlanGateCard>

      {/* 3. PAINEL DE STATUS DOS TRABALHOS EM SEGUNDO PLANO */}
      <div
        style={{
          background: '#0b0b0a',
          border: '1px solid #20201f',
          borderRadius: 16,
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Cpu className="w-5 h-5 text-[#f5c542]" />
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f6f2e8' }}>
                Status do Motor em Segundo Plano (Última Execução, Próxima e Erros)
              </h3>
              <span style={{ fontSize: 12, color: '#a8a39a' }}>
                Todos os serviços de fundo (Agendamentos, Alertas, Radar e Relatório Semanal) usam o motor unificado de envios.
              </span>
            </div>
          </div>

          <button
            type="button"
            className="rp-btn rp-primary"
            disabled={busyAction === 'run_bg'}
            onClick={() =>
              runAction('run_bg', { action: 'run_background_cycle', jobKey: 'all' })
            }
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            {busyAction === 'run_bg' ? 'Executando ciclo...' : '▶ Executar Ciclo de Segundo Plano Agora'}
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #20201f', color: '#a8a39a', textAlign: 'left' }}>
                <th style={{ padding: '8px 6px' }}>Serviço em Segundo Plano</th>
                <th style={{ padding: '8px 6px' }}>Cadência</th>
                <th style={{ padding: '8px 6px' }}>Última Execução</th>
                <th style={{ padding: '8px 6px' }}>Próxima Execução</th>
                <th style={{ padding: '8px 6px' }}>Status / Erros</th>
              </tr>
            </thead>
            <tbody>
              {bgStatuses.map((st: any) => (
                <tr key={st.jobKey} style={{ borderBottom: '1px solid #23221f', color: '#ebe6da' }}>
                  <td style={{ padding: '10px 6px', fontWeight: 700 }}>{st.jobLabel}</td>
                  <td style={{ padding: '10px 6px', color: '#a8a39a' }}>{st.cadenceDescription}</td>
                  <td style={{ padding: '10px 6px' }}>
                    {st.lastRunAt
                      ? new Date(st.lastRunAt).toLocaleString('pt-BR')
                      : 'Aguardando 1º ciclo'}
                  </td>
                  <td style={{ padding: '10px 6px' }}>
                    {st.nextRunAt ? new Date(st.nextRunAt).toLocaleString('pt-BR') : '—'}
                  </td>
                  <td style={{ padding: '10px 6px' }}>
                    {st.lastStatus === 'error' ? (
                      <span style={{ color: '#FCA5A5', fontWeight: 700 }}>
                        Erro: {st.lastError || 'Falha na última execução'}
                      </span>
                    ) : st.lastStatus === 'ok' ? (
                      <span style={{ color: '#5fd0a0', fontWeight: 700 }}>
                        OK ({st.itemsProcessed} item(ns) processado(s))
                      </span>
                    ) : (
                      <span style={{ color: '#a8a39a' }}>Pronto (Sem erros)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Adicionar Colaborador (Fecha ao clicar fora) */}
      {showMemberModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowMemberModal(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20, 20, 19, 0.78)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <form
            onSubmit={handleSaveMember}
            style={{
              background: '#0b0b0a',
              border: '1px solid #20201f',
              borderRadius: 16,
              maxWidth: 480,
              width: '100%',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 17, color: '#f6f2e8' }}>
                Adicionar Membro à Equipe
              </h3>
              <button
                type="button"
                onClick={() => setShowMemberModal(false)}
                style={{ background: 'none', border: 'none', color: '#a8a39a', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <label className="rp-field">
              Nome completo
              <input
                type="text"
                required
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="Ex: Ana Colaboradora"
              />
            </label>

            <label className="rp-field">
              E-mail
              <input
                type="email"
                required
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="ana@equipe.com.br"
              />
            </label>

            <label className="rp-field">
              Papel na Equipe
              <select
                value={memberRole}
                onChange={(e) => setMemberRole(e.target.value as 'dono' | 'colaborador')}
              >
                <option value="colaborador">Colaborador (Permissões selecionáveis)</option>
                <option value="dono">Dono (Acesso total)</option>
              </select>
            </label>

            {memberRole === 'colaborador' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#ddd8cc' }}>
                <strong>Permissões do Colaborador:</strong>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={permPost} onChange={(e) => setPermPost(e.target.checked)} />
                  Criar e agendar postagens de ofertas
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={permRadar} onChange={(e) => setPermRadar(e.target.checked)} />
                  Aprovar oportunidades do Radar
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={permMetrics} onChange={(e) => setPermMetrics(e.target.checked)} />
                  Visualizar estatísticas e relatórios
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={permConn} onChange={(e) => setPermConn(e.target.checked)} />
                  Alterar conexões de API / WhatsApp
                </label>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <button
                type="button"
                className="rp-btn rp-quiet"
                onClick={() => setShowMemberModal(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="rp-btn rp-primary">
                Salvar Membro
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
