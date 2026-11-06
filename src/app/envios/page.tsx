'use client';

import React, { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PublicationJob, WhatsAppGroup, ListCampaign } from '@/lib/types';
import { PlanGateCard } from '@/components/PlanGateCard';

function EnviosContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get('aba');

  const parseTab = (val: string | null) => {
    if (val === 'agenda') return 'agenda';
    if (val === 'campanhas') return 'campanhas';
    if (val === 'historico') return 'historico';
    return 'revisao';
  };

  const [activeTab, setActiveTab] = useState<'revisao' | 'agenda' | 'campanhas' | 'historico'>(
    () => parseTab(initialTabParam)
  );

  useEffect(() => {
    if (initialTabParam) {
      setActiveTab(parseTab(initialTabParam));
    }
  }, [initialTabParam]);

  const [jobs, setJobs] = useState<PublicationJob[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [campaigns, setCampaigns] = useState<ListCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<'all' | 'agendada' | 'enviada' | 'falhou'>('all');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [searchHistory, setSearchHistory] = useState('');
  const [storeHistoryFilter, setStoreHistoryFilter] = useState<'all' | 'mercadolivre' | 'shopee' | 'amazon' | 'netshoes'>('all');
  const [copiedAffiliateId, setCopiedAffiliateId] = useState<string | null>(null);
  const [inspectingJob, setInspectingJob] = useState<PublicationJob | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Modais
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);

  // Campos do agendamento
  const [scheduleDest, setScheduleDest] = useState('');
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [scheduleText, setScheduleText] = useState('');
  const [scheduling, setScheduling] = useState(false);

  // Campos da campanha
  const [campaignName, setCampaignName] = useState('Campanha de Ofertas');
  const [campaignDest, setCampaignDest] = useState('');
  const [campaignInterval, setCampaignInterval] = useState('30');
  const [savingCampaign, setSavingCampaign] = useState(false);

  // Carregar dados de rascunho transportados de "Criar conteúdo" se existirem
  useEffect(() => {
    try {
      const draft = sessionStorage.getItem('radar_transport_draft');
      if (draft) {
        const parsed = JSON.parse(draft);
        if (parsed.text) setScheduleText(parsed.text);
        if (parsed.targetJid) setScheduleDest(parsed.targetJid);
        // Limpar após leitura para não reusar indevidamente
        sessionStorage.removeItem('radar_transport_draft');
      }
    } catch {}
  }, []);

  const loadData = async () => {
    setLoading(true);
    setApiError(null);
    try {
      const [resJobs, resGroups, resAuto] = await Promise.all([
        fetch('/api/copier/jobs'),
        fetch('/api/whatsapp/groups'),
        fetch('/api/automation'),
      ]);

      const dataJobs = await resJobs.json().catch(() => ({}));
      const dataGroups = await resGroups.json().catch(() => ({}));
      const dataAuto = await resAuto.json().catch(() => ({}));

      if (!resJobs.ok || !dataJobs.ok) {
        setApiError(dataJobs.error || 'Falha ao consultar publicações no servidor.');
      } else if (Array.isArray(dataJobs.jobs)) {
        setJobs(dataJobs.jobs);
      }

      if (dataGroups.ok && Array.isArray(dataGroups.groups)) {
        setGroups(dataGroups.groups);
        if (dataGroups.groups.length > 0) {
          if (!scheduleDest) setScheduleDest(dataGroups.groups[0].groupJid);
          if (!campaignDest) setCampaignDest(dataGroups.groups[0].groupJid);
        }
      }

      if (dataAuto.ok && Array.isArray(dataAuto.listCampaigns)) {
        setCampaigns(dataAuto.listCampaigns);
      }
    } catch (e: any) {
      setApiError('Erro de conexão ao carregar dados de envios: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectTab = (tab: 'revisao' | 'agenda' | 'campanhas' | 'historico') => {
    setActiveTab(tab);
    router.replace(`/envios?aba=${tab}`, { scroll: false });
  };

  // Itens em revisão
  const pendingJobs = useMemo(() => {
    return jobs.filter((j) => j.status === 'aguardando_aprovacao' || j.status === 'rascunho');
  }, [jobs]);

  // Itens agendados
  const scheduledJobs = useMemo(() => {
    return jobs.filter((j) => j.status === 'agendado');
  }, [jobs]);

  // Fila completa de agendamentos com status (agendada, enviada, falhou)
  const queueJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (queueFilter === 'agendada') return j.status === 'agendado';
      if (queueFilter === 'enviada') return j.status === 'enviado';
      if (queueFilter === 'falhou') return j.status === 'falha' || j.status === 'quarentena';
      return j.status === 'agendado' || j.status === 'enviado' || j.status === 'falha' || j.status === 'quarentena';
    });
  }, [jobs, queueFilter]);

  const detectJobStore = (j: PublicationJob): 'mercadolivre' | 'shopee' | 'amazon' | 'netshoes' | 'magalu' | 'outro' => {
    const raw = `${j.affiliateUrl || ''} ${j.cleanUrl || ''} ${j.originalUrl || ''} ${j.messageText || ''}`.toLowerCase();
    if (raw.includes('mercadolivre') || raw.includes('meli.la')) return 'mercadolivre';
    if (raw.includes('shopee') || raw.includes('shope.ee')) return 'shopee';
    if (raw.includes('amazon') || raw.includes('amzn.to') || raw.includes('a.co')) return 'amazon';
    if (raw.includes('netshoes') || raw.includes('linksynergy') || raw.includes('zattini')) return 'netshoes';
    if (raw.includes('magalu') || raw.includes('magazineluiza')) return 'magalu';
    return 'outro';
  };

  const extractPriceFromJob = (text: string) => {
    const porMatch = text.match(/POR(?:\s+APENAS)?:\s*(R\$\s*[\d.,]+)/i) || text.match(/(?:R\$\s*[\d.,]+)/i);
    const deMatch = text.match(/DE:\s*(R\$\s*[\d.,]+)/i);
    return {
      current: porMatch ? porMatch[1] : undefined,
      original: deMatch ? deMatch[1] : undefined,
    };
  };

  const handleCopyAffiliate = async (url: string, id: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        setCopiedAffiliateId(id);
      }
    } catch {}
    setTimeout(() => setCopiedAffiliateId(null), 2500);
  };

  const handleRetryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    try {
      const res = await fetch('/api/copier/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry', jobId }),
      });
      const data = await res.json();
      if (data.ok) {
        setNotice('Oferta reenviada para disparo imediato!');
        await loadData();
      } else {
        setNotice(data.error || 'Falha ao reenviar publicação.');
      }
    } catch {
      setNotice('Erro de rede ao reenviar publicação.');
    } finally {
      setRetryingJobId(null);
    }
  };

  // Histórico com filtros e pesquisa
  const filteredHistoryJobs = useMemo(() => {
    return jobs.filter((j) => {
      // 1. Status
      if (historyFilter === 'sent' && j.status !== 'enviado') return false;
      if (historyFilter === 'failed' && j.status !== 'falha' && j.status !== 'quarentena') return false;
      if (historyFilter === 'all' && j.status !== 'enviado' && j.status !== 'falha' && j.status !== 'quarentena' && j.status !== 'cancelado') return false;

      // 2. Marketplace
      if (storeHistoryFilter !== 'all') {
        const store = detectJobStore(j);
        if (store !== storeHistoryFilter) return false;
      }

      // 3. Pesquisa por texto
      if (searchHistory.trim()) {
        const q = searchHistory.toLowerCase().trim();
        const titleMatch = (j.targetName || '').toLowerCase().includes(q);
        const msgMatch = (j.messageText || '').toLowerCase().includes(q);
        const linkMatch = (j.affiliateUrl || '').toLowerCase().includes(q);
        if (!titleMatch && !msgMatch && !linkMatch) return false;
      }

      return true;
    });
  }, [jobs, historyFilter, storeHistoryFilter, searchHistory]);

  // Aprovar publicação
  const handleApprove = async (jobId: string) => {
    try {
      const res = await fetch('/api/copier/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', jobId }),
      });
      const data = await res.json();
      if (data.ok) {
        setNotice('Oferta aprovada com sucesso! Enviada para a fila de disparo.');
        await loadData();
      } else {
        setNotice(data.error || 'Falha ao aprovar oferta no servidor.');
      }
    } catch {
      setNotice('Erro de conexão ao aprovar publicação.');
    }
  };

  // Cancelar publicação agendada
  const handleCancelJob = async (jobId: string) => {
    try {
      const res = await fetch('/api/copier/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', jobId }),
      });
      const data = await res.json();
      if (data.ok) {
        setNotice('Publicação cancelada com sucesso.');
        await loadData();
      } else {
        setNotice(data.error || 'Falha ao cancelar publicação.');
      }
    } catch {
      setNotice('Erro ao conectar com o servidor.');
    }
  };

  // Confirmação Real de Agendamento
  const handleConfirmSchedule = async () => {
    if (!scheduleDest) {
      setNotice('Selecione o grupo de destino para o agendamento.');
      return;
    }
    if (!scheduleDateTime) {
      setNotice('Informe a data e o horário desejados para o envio.');
      return;
    }

    setScheduling(true);
    setNotice(null);

    const targetGroup = groups.find((g) => g.groupJid === scheduleDest);
    const finalMessage = scheduleText.trim() || 'Oferta agendada';

    try {
      const res = await fetch('/api/copier/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          jobData: {
            originType: 'manual',
            targetJid: scheduleDest,
            targetName: targetGroup?.name || scheduleDest,
            messageText: finalMessage,
            scheduledFor: new Date(scheduleDateTime).toISOString(),
            status: 'agendado',
          },
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setShowScheduleDialog(false);
        setScheduleText('');
        setNotice('Publicação agendada e persistida no servidor com sucesso!');
        await loadData();
      } else {
        setNotice(data.error || 'Falha ao agendar publicação no servidor.');
      }
    } catch {
      setNotice('Erro de rede ao confirmar agendamento.');
    } finally {
      setScheduling(false);
    }
  };

  // Confirmação Real de Criação/Edição de Campanha
  const handleConfirmCampaign = async () => {
    if (!campaignName.trim()) {
      setNotice('Informe um nome para a campanha.');
      return;
    }
    if (!campaignDest) {
      setNotice('Selecione o grupo de destino da campanha.');
      return;
    }

    setSavingCampaign(true);
    setNotice(null);

    try {
      const res = await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_list',
          listData: {
            name: campaignName.trim(),
            targetJids: [campaignDest],
            intervalMinutes: parseInt(campaignInterval, 10) || 30,
            status: 'ativa',
            items: [],
          },
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setShowCampaignDialog(false);
        setNotice('Campanha salva e confirmada no servidor!');
        await loadData();
      } else {
        setNotice(data.error || 'Falha ao salvar campanha.');
      }
    } catch {
      setNotice('Erro de conexão ao salvar campanha.');
    } finally {
      setSavingCampaign(false);
    }
  };

  // Alternar estado da campanha (Ativar / Pausar)
  const handleToggleCampaign = async (campaign: ListCampaign) => {
    const nextStatus = campaign.status === 'ativa' ? 'pausada' : 'ativa';
    try {
      const res = await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_list',
          listData: {
            ...campaign,
            status: nextStatus,
          },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setNotice(`Campanha ${nextStatus === 'ativa' ? 'ativada' : 'pausada'} com sucesso!`);
        await loadData();
      } else {
        setNotice(data.error || 'Não foi possível alterar o estado da campanha.');
      }
    } catch {
      setNotice('Erro ao atualizar status da campanha.');
    }
  };

  return (
    <section className="rp-page" aria-label="Envios">
      {/* Cabeçalho */}
      <div className="rp-head">
        <div>
          <span className="rp-step">Publicação</span>
          <h1>Envios</h1>
          <p>Da revisão à publicação, acompanhe tudo no mesmo lugar.</p>
        </div>
        <Link href="/criar-conteudo" className="rp-btn rp-primary">
          Criar conteúdo
        </Link>
      </div>

      {apiError && (
        <div className="rp-panel rp-section rp-warn" style={{ borderColor: '#e05353' }}>
          <p>{apiError}</p>
        </div>
      )}

      {notice && (
        <div className="rp-panel rp-section" style={{ borderColor: '#39bee6' }}>
          <p>{notice}</p>
        </div>
      )}

      {/* Abas */}
      <div data-tab-group="delivery">
        <div className="rp-tabs" role="tablist" aria-label="Etapa do envio">
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'revisao'}
            onClick={() => handleSelectTab('revisao')}
          >
            Revisão {pendingJobs.length > 0 ? `· ${pendingJobs.length}` : '· 0'}
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'agenda'}
            onClick={() => handleSelectTab('agenda')}
          >
            Agenda {scheduledJobs.length > 0 ? `· ${scheduledJobs.length}` : ''}
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'campanhas'}
            onClick={() => handleSelectTab('campanhas')}
          >
            Campanhas {campaigns.length > 0 ? `· ${campaigns.length}` : ''}
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'historico'}
            onClick={() => handleSelectTab('historico')}
          >
            Histórico
          </button>
        </div>

        {/* Aba 1: Revisão */}
        {activeTab === 'revisao' && (
          <div data-panel="revisao" role="tabpanel">
            <div className="rp-panel">
              <div className="rp-row">
                <h2>Ofertas para conferir</h2>
                <span className="rp-tag">Revisão manual</span>
              </div>

              <div className="rp-list">
                {loading ? (
                  <p className="rp-sub" style={{ padding: '24px 0', textAlign: 'center' }}>
                    Consultando fila de revisão no servidor...
                  </p>
                ) : pendingJobs.length === 0 ? (
                  <div className="rp-panel rp-empty rp-section" style={{ textAlign: 'center', padding: '36px 16px' }}>
                    <p className="rp-sub">Nenhuma oferta aguardando revisão manual no momento.</p>
                    <Link
                      href="/criar-conteudo"
                      className="rp-btn rp-primary"
                      style={{ display: 'inline-block', marginTop: 12 }}
                    >
                      Criar nova publicação
                    </Link>
                  </div>
                ) : (
                  pendingJobs.map((j) => (
                    <div key={j.id} className="rp-list-item">
                      {j.mediaUrl ? (
                        <div style={{ position: 'relative', width: 68, height: 68, flexShrink: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid #364049', background: '#1c2227' }}>
                          <img
                            src={j.mediaUrl}
                            alt={j.targetName || 'Foto do produto'}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="rp-product-photo rp-p1" role="img" aria-label={j.targetName} />
                      )}
                      <div className="rp-list-copy">
                        <strong>{j.targetName || 'Oferta em revisão'}</strong>
                        <p>{j.messageText.slice(0, 80)}...</p>
                        <span className={`rp-tag ${j.affiliateUrl ? 'rp-good' : 'rp-warn'}`}>
                          {j.affiliateUrl ? 'Link gerado' : 'Link ausente ou pendente'}
                        </span>
                      </div>
                      <div className="rp-actions">
                        <Link href={`/criar-conteudo?aba=oferta-link`} className="rp-btn">
                          Editar
                        </Link>
                        <button
                          className="rp-btn rp-primary"
                          type="button"
                          onClick={() => handleApprove(j.id)}
                        >
                          Aprovar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <p className="rp-sub rp-section">
              A aprovação considera os destinos, o conteúdo e a confirmação do link de afiliado.
            </p>
          </div>
        )}

        {/* Aba 2: Agenda e Fila */}
        {activeTab === 'agenda' && (
          <div data-panel="agenda" role="tabpanel">
            <PlanGateCard
              feature="post_scheduling"
              requiredPlan="plus"
              title="Agendamento de Postagens com Fila e Status"
              description="Programe ofertas para horários estratégicos com fila automática, Envio Seguro no WhatsApp e acompanhamento em tempo real (Agendada, Enviada, Falhou). Recurso exclusivo dos planos Plus e Ultimate."
            >
              <div className="rp-panel">
                <div className="rp-row" style={{ flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h2>Fila de Agendamento e Status</h2>
                    <p className="rp-sub">
                      Horário de Brasília · Envio Seguro ativo (respeita intervalo entre mensagens e limite por hora)
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Link href="/conexoes?aba=marca" className="rp-btn rp-quiet" style={{ fontSize: 12 }}>
                      🛡️ Configurar Envio Seguro
                    </Link>
                    <button
                      className="rp-btn rp-primary"
                      type="button"
                      onClick={() => setShowScheduleDialog(true)}
                    >
                      + Agendar postagem
                    </button>
                  </div>
                </div>

                {/* Filtros de status da fila: Todos, Agendada, Enviada, Falhou */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, marginBottom: 14 }}>
                  {[
                    { key: 'all', label: `Todas na fila (${jobs.filter((j) => ['agendado', 'enviado', 'falha', 'quarentena'].includes(j.status)).length})` },
                    { key: 'agendada', label: `⏳ Agendada (${jobs.filter((j) => j.status === 'agendado').length})` },
                    { key: 'enviada', label: `✅ Enviada (${jobs.filter((j) => j.status === 'enviado').length})` },
                    { key: 'falhou', label: `⚠️ Falhou (${jobs.filter((j) => j.status === 'falha' || j.status === 'quarentena').length})` },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setQueueFilter(tab.key as any)}
                      style={{
                        background: queueFilter === tab.key ? '#1CCAF2' : '#0B1728',
                        color: queueFilter === tab.key ? '#040C1A' : '#8EADC7',
                        border: queueFilter === tab.key ? '1px solid #1CCAF2' : '1px solid #1C2E46',
                        borderRadius: 999,
                        padding: '5px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="rp-list">
                  {loading ? (
                    <p className="rp-sub" style={{ padding: '24px 0', textAlign: 'center' }}>
                      Consultando fila de agendamentos...
                    </p>
                  ) : queueJobs.length === 0 ? (
                    <div className="rp-panel rp-empty rp-section" style={{ textAlign: 'center', padding: '36px 16px' }}>
                      <p className="rp-sub">Nenhuma postagem encontrada neste filtro da fila.</p>
                      <button
                        className="rp-btn rp-primary"
                        type="button"
                        style={{ marginTop: 12 }}
                        onClick={() => setShowScheduleDialog(true)}
                      >
                        Agendar agora
                      </button>
                    </div>
                  ) : (
                    queueJobs.map((j) => {
                      const statusBadge =
                        j.status === 'agendado'
                          ? { label: '⏳ Agendada', cls: 'rp-warn' }
                          : j.status === 'enviado'
                          ? { label: '✅ Enviada', cls: 'rp-good' }
                          : { label: '⚠️ Falhou', cls: 'rp-bad' };
                      return (
                        <div key={j.id} className="rp-list-item" style={{ flexWrap: 'wrap', gap: 10 }}>
                          {j.mediaUrl && (
                            <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #364049', background: '#1c2227' }}>
                              <img
                                src={j.mediaUrl}
                                alt={j.targetName || 'Foto do produto'}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          <span className={`rp-tag ${statusBadge.cls}`}>{statusBadge.label}</span>
                          <span className="rp-tag">
                            {j.scheduledFor
                              ? new Date(j.scheduledFor).toLocaleString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Programado'}
                          </span>
                          <div className="rp-list-copy">
                            <strong>{j.targetName || 'Oferta'}</strong>
                            <p>{j.messageText.slice(0, 80)}...</p>
                            {j.errorDetails && (
                              <small style={{ color: '#FCA5A5', display: 'block', marginTop: 2 }}>
                                Motivo: {j.errorDetails}
                              </small>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {j.status === 'agendado' && (
                              <>
                                <button
                                  className="rp-btn rp-primary"
                                  type="button"
                                  onClick={() => handleApprove(j.id)}
                                >
                                  Disparar agora
                                </button>
                                <button
                                  className="rp-btn rp-quiet"
                                  type="button"
                                  onClick={() => handleCancelJob(j.id)}
                                >
                                  Cancelar
                                </button>
                              </>
                            )}
                            {(j.status === 'falha' || j.status === 'quarentena') && (
                              <button
                                className="rp-btn rp-primary"
                                type="button"
                                disabled={retryingJobId === j.id}
                                onClick={() => handleRetryJob(j.id)}
                              >
                                {retryingJobId === j.id ? 'Reenviando...' : 'Tentar novamente'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </PlanGateCard>
          </div>
        )}

        {/* Aba 3: Campanhas */}
        {activeTab === 'campanhas' && (
          <div data-panel="campanhas" role="tabpanel">
            <div className="rp-panel">
              <div className="rp-row">
                <h2>Campanhas em sequência</h2>
                <button
                  className="rp-btn rp-primary"
                  type="button"
                  onClick={() => setShowCampaignDialog(true)}
                >
                  Nova campanha
                </button>
              </div>

              {loading ? (
                <p className="rp-sub" style={{ padding: '24px 0', textAlign: 'center' }}>
                  Carregando campanhas...
                </p>
              ) : campaigns.length === 0 ? (
                <div className="rp-panel rp-empty rp-section" style={{ textAlign: 'center', padding: '36px 16px' }}>
                  <p className="rp-sub">Nenhuma campanha em lote cadastrada ainda.</p>
                  <button
                    className="rp-btn rp-primary"
                    type="button"
                    style={{ marginTop: 12 }}
                    onClick={() => setShowCampaignDialog(true)}
                  >
                    Criar primeira campanha
                  </button>
                </div>
              ) : (
                campaigns.map((c) => {
                  const isActive = c.status === 'ativa';
                  return (
                    <div key={c.id} className="rp-section" style={{ borderBottom: '1px solid #363c41', paddingBottom: 16 }}>
                      <div className="rp-list-item" style={{ padding: '12px 0' }}>
                        <div className="rp-list-copy">
                          <strong>{c.name}</strong>
                          <p>
                            Intervalo: {c.intervalMinutes} min · Itens: {c.totalItems || 0}
                          </p>
                        </div>
                        <span
                          className={`rp-tag ${isActive ? 'rp-good' : 'rp-warn'}`}
                        >
                          {isActive ? 'Ativa' : 'Pausada'}
                        </span>
                      </div>

                      <div className="rp-actions">
                        <button
                          className="rp-btn"
                          type="button"
                          onClick={() => {
                            setCampaignName(c.name);
                            if (c.targetJids?.[0]) setCampaignDest(c.targetJids[0]);
                            setCampaignInterval(String(c.intervalMinutes || 30));
                            setShowCampaignDialog(true);
                          }}
                        >
                          Editar campanha
                        </button>
                        <button
                          className={`rp-btn ${isActive ? '' : 'rp-primary'}`}
                          type="button"
                          onClick={() => handleToggleCampaign(c)}
                        >
                          {isActive ? 'Pausar campanha' : 'Ativar campanha'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Aba 4: Histórico */}
        {activeTab === 'historico' && (
          <div data-panel="historico" role="tabpanel">
            <div className="rp-panel" style={{ padding: 20 }}>
              <div className="rp-row" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Histórico de publicações</h2>
                  <p className="rp-sub" style={{ margin: '4px 0 0', fontSize: 12 }}>
                    Registro detalhado dos envios, links de afiliados publicados e status da entrega.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Busca por texto */}
                  <input
                    type="text"
                    placeholder="Buscar produto, loja ou link..."
                    value={searchHistory}
                    onChange={(e) => setSearchHistory(e.target.value)}
                    style={{
                      background: '#061225',
                      border: '1px solid #1c2b3e',
                      borderRadius: 8,
                      padding: '6px 12px',
                      color: '#F8FBFF',
                      fontSize: 13,
                      minWidth: 220,
                    }}
                  />

                  {/* Filtro de Status */}
                  <select
                    id="rp-history-filter"
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value as 'all' | 'sent' | 'failed')}
                    style={{
                      background: '#061225',
                      border: '1px solid #1c2b3e',
                      borderRadius: 8,
                      padding: '6px 10px',
                      color: '#F8FBFF',
                      fontSize: 13,
                    }}
                  >
                    <option value="all">Todos os status</option>
                    <option value="sent">Apenas enviados</option>
                    <option value="failed">Apenas falhas</option>
                  </select>
                </div>
              </div>

              {/* Filtro rápido por Marketplace */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #182738' }}>
                {[
                  { key: 'all', label: 'Todos os canais' },
                  { key: 'mercadolivre', label: 'Mercado Livre' },
                  { key: 'shopee', label: 'Shopee' },
                  { key: 'amazon', label: 'Amazon' },
                  { key: 'netshoes', label: 'Netshoes' },
                ].map((st) => (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => setStoreHistoryFilter(st.key as any)}
                    style={{
                      background: storeHistoryFilter === st.key ? '#1CCAF2' : '#0B1728',
                      color: storeHistoryFilter === st.key ? '#040C1A' : '#8EADC7',
                      border: storeHistoryFilter === st.key ? '1px solid #1CCAF2' : '1px solid #1C2E46',
                      borderRadius: 20,
                      padding: '4px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              <div className="rp-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {loading ? (
                  <p className="rp-sub" style={{ padding: '32px 0', textAlign: 'center' }}>
                    Consultando histórico de publicações no servidor...
                  </p>
                ) : filteredHistoryJobs.length === 0 ? (
                  <div className="rp-panel rp-empty rp-section" style={{ textAlign: 'center', padding: '40px 16px' }}>
                    <p className="rp-sub">Nenhum envio registrado com os filtros e busca informados.</p>
                  </div>
                ) : (
                  filteredHistoryJobs.map((j) => {
                    const store = detectJobStore(j);
                    const prices = extractPriceFromJob(j.messageText || '');
                    const isSuccess = j.status === 'enviado';
                    const isFailed = j.status === 'falha' || j.status === 'quarentena';
                    const targetGroup = groups.find((g) => g.groupJid === j.targetJid);
                    const groupLabel = targetGroup ? targetGroup.name : (j.targetJid.includes('@') ? j.targetJid.split('@')[0] : 'Grupo WhatsApp');

                    const storeColors: Record<string, { bg: string; text: string; border: string }> = {
                      mercadolivre: { bg: '#292500', text: '#FFE600', border: 'rgba(255, 230, 0, 0.4)' },
                      shopee: { bg: '#291008', text: '#FF5722', border: 'rgba(255, 87, 34, 0.4)' },
                      amazon: { bg: '#291800', text: '#FF9900', border: 'rgba(255, 153, 0, 0.4)' },
                      netshoes: { bg: '#23082E', text: '#C084FC', border: 'rgba(192, 132, 252, 0.4)' },
                      magalu: { bg: '#081D33', text: '#0086FF', border: 'rgba(0, 134, 255, 0.4)' },
                      outro: { bg: '#0D1B31', text: '#1CCAF2', border: 'rgba(28, 202, 242, 0.3)' },
                    };

                    const sc = storeColors[store] || storeColors.outro;

                    return (
                      <div
                        key={j.id}
                        style={{
                          background: '#091526',
                          border: '1px solid #18283D',
                          borderRadius: 12,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                          transition: 'border-color 0.2s',
                        }}
                      >
                        {/* Linha superior: Marketplace + Grupo + Data + Status */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span
                              style={{
                                background: sc.bg,
                                color: sc.text,
                                border: `1px solid ${sc.border}`,
                                borderRadius: 6,
                                padding: '2px 8px',
                                fontSize: 11,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                              }}
                            >
                              {store}
                            </span>
                            <span style={{ fontSize: 12, color: '#8EADC7', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              👥 {groupLabel}
                            </span>
                            <span style={{ fontSize: 12, color: '#627D98' }}>•</span>
                            <span style={{ fontSize: 12, color: '#8EADC7' }}>
                              {j.sentAt
                                ? new Date(j.sentAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                                : j.createdAt
                                ? new Date(j.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                                : 'Registrado'}
                            </span>
                          </div>

                          <div>
                            {isSuccess ? (
                              <span
                                style={{
                                  background: 'rgba(32, 201, 151, 0.12)',
                                  color: '#20C997',
                                  border: '1px solid rgba(32, 201, 151, 0.35)',
                                  borderRadius: 20,
                                  padding: '3px 10px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                ✓ Enviado com sucesso
                              </span>
                            ) : isFailed ? (
                              <span
                                style={{
                                  background: 'rgba(239, 68, 68, 0.12)',
                                  color: '#F87171',
                                  border: '1px solid rgba(239, 68, 68, 0.35)',
                                  borderRadius: 20,
                                  padding: '3px 10px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                ✕ Falha no envio
                              </span>
                            ) : (
                              <span
                                style={{
                                  background: 'rgba(100, 116, 139, 0.12)',
                                  color: '#94A3B8',
                                  border: '1px solid rgba(100, 116, 139, 0.35)',
                                  borderRadius: 20,
                                  padding: '3px 10px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                {j.status}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Linha intermediária: Foto + Título + Preços + Link Afiliado */}
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          {j.mediaUrl ? (
                            <div
                              style={{
                                width: 72,
                                height: 72,
                                flexShrink: 0,
                                borderRadius: 10,
                                overflow: 'hidden',
                                border: '1px solid #1E344F',
                                background: '#FFFFFF',
                              }}
                            >
                              <img
                                src={j.mediaUrl}
                                alt={j.targetName || 'Foto do produto'}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            </div>
                          ) : (
                            <div
                              style={{
                                width: 72,
                                height: 72,
                                flexShrink: 0,
                                borderRadius: 10,
                                border: '1px solid #1E344F',
                                background: '#0D1B31',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#1CCAF2',
                                fontSize: 24,
                              }}
                            >
                              🎯
                            </div>
                          )}

                          <div style={{ flex: 1, minWidth: 240 }}>
                            <strong style={{ fontSize: 14, color: '#F8FBFF', display: 'block', lineHeight: 1.4, marginBottom: 4 }}>
                              {j.targetName || 'Oferta enviada ao WhatsApp'}
                            </strong>

                            {/* Preços */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
                              {prices.original && (
                                <span style={{ fontSize: 12, color: '#64748B', textDecoration: 'line-through' }}>
                                  De {prices.original}
                                </span>
                              )}
                              {prices.current ? (
                                <span style={{ fontSize: 14, color: '#1CCAF2', fontWeight: 800 }}>
                                  Por {prices.current}
                                </span>
                              ) : (
                                <span style={{ fontSize: 12, color: '#8EADC7' }}>Preço na oferta</span>
                              )}
                            </div>

                            {/* Link Afiliado com botão de copiar */}
                            {j.affiliateUrl ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span
                                  style={{
                                    fontFamily: 'monospace',
                                    fontSize: 11,
                                    background: '#040C1A',
                                    border: '1px solid #18283D',
                                    borderRadius: 6,
                                    padding: '3px 8px',
                                    color: '#8EADC7',
                                    maxWidth: 320,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={j.affiliateUrl}
                                >
                                  {j.affiliateUrl}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyAffiliate(j.affiliateUrl, j.id)}
                                  style={{
                                    background: copiedAffiliateId === j.id ? '#20C997' : '#0D213B',
                                    color: copiedAffiliateId === j.id ? '#040C1A' : '#1CCAF2',
                                    border: '1px solid rgba(28, 202, 242, 0.35)',
                                    borderRadius: 6,
                                    padding: '3px 10px',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  {copiedAffiliateId === j.id ? '✓ Copiado!' : 'Copiar link'}
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: '#F59E0B' }}>Link afiliado não registrado</span>
                            )}
                          </div>

                          {/* Botões de Ação na Direita */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'center' }}>
                            <button
                              type="button"
                              onClick={() => setInspectingJob(j)}
                              style={{
                                background: '#0D1B31',
                                border: '1px solid #1C2E46',
                                borderRadius: 8,
                                padding: '6px 12px',
                                color: '#F8FBFF',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Ver mensagem
                            </button>

                            {isFailed && (
                              <button
                                type="button"
                                disabled={retryingJobId === j.id}
                                onClick={() => handleRetryJob(j.id)}
                                style={{
                                  background: '#1CCAF2',
                                  border: 'none',
                                  borderRadius: 8,
                                  padding: '6px 12px',
                                  color: '#040C1A',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                {retryingJobId === j.id ? 'Reenviando...' : 'Reenviar'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Motivo do erro se falhou */}
                        {isFailed && j.errorDetails && (
                          <div
                            style={{
                              background: 'rgba(239, 68, 68, 0.08)',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              borderRadius: 8,
                              padding: '8px 12px',
                              fontSize: 12,
                              color: '#FCA5A5',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <span>⚠️</span>
                            <span>
                              <strong>Motivo:</strong> {j.errorDetails}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Diálogo de Agendamento (fecha ao clicar fora) */}
      {showScheduleDialog && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !scheduling) setShowScheduleDialog(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 8, 19, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <dialog
            className="rp-dialog"
            open
            style={{ display: 'block', position: 'relative', margin: 0, maxWidth: 520, width: '100%' }}
          >
            <div className="rp-row">
              <h2>Agendar publicação</h2>
              <button
                className="rp-btn"
                type="button"
                onClick={() => setShowScheduleDialog(false)}
              >
                ×
              </button>
            </div>

            <label className="rp-field">
              Destino
              <select
                value={scheduleDest}
                onChange={(e) => setScheduleDest(e.target.value)}
              >
                {groups.map((g) => (
                  <option key={g.groupJid} value={g.groupJid}>
                    {g.name}
                  </option>
                ))}
                {groups.length === 0 && (
                  <option value="" disabled>
                    Nenhum grupo sincronizado
                  </option>
                )}
              </select>
            </label>

            <label className="rp-field">
              Mensagem
              <textarea
                rows={3}
                value={scheduleText}
                placeholder="Digite ou revise o texto da mensagem a enviar..."
                onChange={(e) => setScheduleText(e.target.value)}
              />
            </label>

            <label className="rp-field">
              Data e horário
              <input
                type="datetime-local"
                value={scheduleDateTime}
                onChange={(e) => setScheduleDateTime(e.target.value)}
              />
            </label>

            <p className="rp-sub rp-section">
              Horário de Brasília. O link e a permissão do destino são conferidos antes do envio.
            </p>

            <div className="rp-footer">
              <button
                className="rp-btn rp-primary"
                type="button"
                disabled={scheduling}
                onClick={handleConfirmSchedule}
              >
                {scheduling ? 'Salvando no servidor...' : 'Confirmar agendamento'}
              </button>
            </div>
          </dialog>
        </div>
      )}

      {/* Diálogo de Campanha (fecha ao clicar fora) */}
      {showCampaignDialog && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingCampaign) setShowCampaignDialog(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 8, 19, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <dialog
            className="rp-dialog"
            open
            style={{ display: 'block', position: 'relative', margin: 0, maxWidth: 520, width: '100%' }}
          >
            <div className="rp-row">
              <h2>Campanha de ofertas</h2>
              <button
                className="rp-btn"
                type="button"
                onClick={() => setShowCampaignDialog(false)}
              >
                ×
              </button>
            </div>

            <label className="rp-field">
              Nome da campanha
              <input
                value={campaignName}
                placeholder="Ex: Achadinhos de Casa & Decoração"
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </label>

            <label className="rp-field">
              Destino
              <select
                value={campaignDest}
                onChange={(e) => setCampaignDest(e.target.value)}
              >
                {groups.map((g) => (
                  <option key={g.groupJid} value={g.groupJid}>
                    {g.name}
                  </option>
                ))}
                {groups.length === 0 && (
                  <option value="" disabled>
                    Nenhum grupo sincronizado
                  </option>
                )}
              </select>
            </label>

            <label className="rp-field">
              Intervalo entre publicações (minutos)
              <input
                type="number"
                value={campaignInterval}
                min="1"
                onChange={(e) => setCampaignInterval(e.target.value)}
              />
            </label>

            <div className="rp-footer">
              <button
                className="rp-btn rp-primary"
                type="button"
                disabled={savingCampaign}
                onClick={handleConfirmCampaign}
              >
                {savingCampaign ? 'Salvando no servidor...' : 'Salvar campanha'}
              </button>
            </div>
          </dialog>
        </div>
      )}

      {/* Modal de Inspeção da Mensagem Publicada */}
      {inspectingJob && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInspectingJob(null);
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
              maxWidth: 580,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 11, color: '#1CCAF2', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Detalhes do Envio
                </span>
                <h3 style={{ margin: '2px 0 0', fontSize: 17, color: '#F8FBFF', fontWeight: 700 }}>
                  {inspectingJob.targetName || 'Mensagem WhatsApp'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingJob(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#8EADC7',
                  fontSize: 20,
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                ✕
              </button>
            </div>

            {inspectingJob.mediaUrl && (
              <div style={{ width: '100%', maxHeight: 240, overflow: 'hidden', borderRadius: 10, background: '#FFFFFF', display: 'flex', justifyContent: 'center' }}>
                <img
                  src={inspectingJob.mediaUrl}
                  alt="Produto"
                  style={{ maxHeight: 240, objectFit: 'contain' }}
                />
              </div>
            )}

            <div>
              <span style={{ fontSize: 12, color: '#8EADC7', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Texto publicado no WhatsApp:
              </span>
              <pre
                style={{
                  background: '#040C1A',
                  border: '1px solid #18283D',
                  borderRadius: 10,
                  padding: 14,
                  color: '#E2E8F0',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'inherit',
                  margin: 0,
                }}
              >
                {inspectingJob.messageText}
              </pre>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 8 }}>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inspectingJob.messageText);
                    setNotice('Mensagem copiada para a área de transferência!');
                  } catch {}
                }}
                style={{
                  background: '#0D213B',
                  border: '1px solid rgba(28, 202, 242, 0.4)',
                  borderRadius: 8,
                  padding: '8px 16px',
                  color: '#1CCAF2',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Copiar mensagem inteira
              </button>

              <button
                type="button"
                onClick={() => setInspectingJob(null)}
                style={{
                  background: '#1CCAF2',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 18px',
                  color: '#040C1A',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function EnviosPage() {
  return (
    <Suspense fallback={<div className="rp-page"><p className="rp-sub">Carregando envios...</p></div>}>
      <EnviosContent />
    </Suspense>
  );
}
