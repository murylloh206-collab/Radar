'use client';

import React, { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PublicationJob, WhatsAppGroup, ListCampaign } from '@/lib/types';

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
  const [historyFilter, setHistoryFilter] = useState<'all' | 'sent' | 'failed'>('all');
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

  // Histórico
  const historyJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (historyFilter === 'sent') return j.status === 'enviado';
      if (historyFilter === 'failed') return j.status === 'falha' || j.status === 'quarentena';
      return j.status === 'enviado' || j.status === 'falha' || j.status === 'quarentena';
    });
  }, [jobs, historyFilter]);

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
                      <div className="rp-product-photo rp-p1" role="img" aria-label={j.targetName} />
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

        {/* Aba 2: Agenda */}
        {activeTab === 'agenda' && (
          <div data-panel="agenda" role="tabpanel">
            <div className="rp-panel">
              <div className="rp-row">
                <div>
                  <h2>Próximas publicações</h2>
                  <p className="rp-sub">Horário de Brasília · publicações confirmadas no servidor</p>
                </div>
                <button
                  className="rp-btn"
                  type="button"
                  onClick={() => setShowScheduleDialog(true)}
                >
                  Agendar mensagem
                </button>
              </div>

              <div className="rp-list">
                {loading ? (
                  <p className="rp-sub" style={{ padding: '24px 0', textAlign: 'center' }}>
                    Consultando agendamentos...
                  </p>
                ) : scheduledJobs.length === 0 ? (
                  <div className="rp-panel rp-empty rp-section" style={{ textAlign: 'center', padding: '36px 16px' }}>
                    <p className="rp-sub">Nenhuma publicação agendada no momento.</p>
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
                  scheduledJobs.map((j) => (
                    <div key={j.id} className="rp-list-item">
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
                        <p>{j.messageText.slice(0, 70)}...</p>
                      </div>
                      <button
                        className="rp-btn rp-quiet"
                        type="button"
                        onClick={() => handleCancelJob(j.id)}
                      >
                        Cancelar
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
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
            <div className="rp-panel">
              <div className="rp-row">
                <h2>Histórico de publicações</h2>
                <label className="rp-field">
                  Filtrar
                  <select
                    id="rp-history-filter"
                    value={historyFilter}
                    onChange={(e) =>
                      setHistoryFilter(e.target.value as 'all' | 'sent' | 'failed')
                    }
                  >
                    <option value="all">Todos os estados</option>
                    <option value="sent">Enviados</option>
                    <option value="failed">Falhas</option>
                  </select>
                </label>
              </div>

              <div className="rp-list">
                {loading ? (
                  <p className="rp-sub" style={{ padding: '24px 0', textAlign: 'center' }}>
                    Consultando histórico...
                  </p>
                ) : historyJobs.length === 0 ? (
                  <div className="rp-panel rp-empty rp-section" style={{ textAlign: 'center', padding: '36px 16px' }}>
                    <p className="rp-sub">Nenhum envio registrado no histórico com o filtro selecionado.</p>
                  </div>
                ) : (
                  historyJobs.map((j) => (
                    <div key={j.id} className="rp-list-item">
                      <div className="rp-list-copy">
                        <strong>{j.targetName || 'Disparo WhatsApp'}</strong>
                        <p>
                          {j.sentAt
                            ? new Date(j.sentAt).toLocaleString('pt-BR')
                            : 'Registrado'}{' '}
                          {j.errorDetails ? `· Motivo: ${j.errorDetails}` : ''}
                        </p>
                      </div>
                      {j.status === 'enviado' ? (
                        <span className="rp-tag rp-good">Enviado</span>
                      ) : (
                        <>
                          <span className="rp-tag rp-warn">Não enviado</span>
                          <Link href="/conexoes" className="rp-btn">
                            Ver conexão
                          </Link>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Diálogo de Agendamento */}
      {showScheduleDialog && (
        <dialog
          className="rp-dialog"
          open
          style={{ display: 'block', position: 'fixed', inset: 0, margin: 'auto', zIndex: 100 }}
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
      )}

      {/* Diálogo de Campanha */}
      {showCampaignDialog && (
        <dialog
          className="rp-dialog"
          open
          style={{ display: 'block', position: 'fixed', inset: 0, margin: 'auto', zIndex: 100 }}
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
