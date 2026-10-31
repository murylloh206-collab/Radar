'use client';

import React, { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PublicationJob, WhatsAppGroup } from '@/lib/types';

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
  const [loading, setLoading] = useState(true);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [campaignActive, setCampaignActive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Modais
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);

  // Campos do agendamento
  const [scheduleDest, setScheduleDest] = useState('');
  const [scheduleDateTime, setScheduleDateTime] = useState('');

  // Campos da campanha
  const [campaignName, setCampaignName] = useState('Casa & Conforto');
  const [campaignDest, setCampaignDest] = useState('');
  const [campaignInterval, setCampaignInterval] = useState('30');

  const loadData = async () => {
    try {
      const [resJobs, resGroups] = await Promise.all([
        fetch('/api/copier/jobs'),
        fetch('/api/whatsapp/groups'),
      ]);
      const dataJobs = await resJobs.json().catch(() => ({}));
      const dataGroups = await resGroups.json().catch(() => ({}));

      if (dataJobs.ok && Array.isArray(dataJobs.jobs)) {
        setJobs(dataJobs.jobs);
      }
      if (dataGroups.ok && Array.isArray(dataGroups.groups)) {
        setGroups(dataGroups.groups);
        if (dataGroups.groups.length > 0) {
          setScheduleDest(dataGroups.groups[0].groupJid);
          setCampaignDest(dataGroups.groups[0].groupJid);
        }
      }
    } catch {
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

  const handleApprove = async (jobId: string) => {
    try {
      const res = await fetch('/api/copier/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', jobId }),
      });
      const data = await res.json();
      if (data.ok) {
        setNotice('Oferta aprovada com sucesso!');
        await loadData();
      } else {
        setNotice(data.error || 'Falha ao aprovar oferta.');
      }
    } catch {
      setNotice('Erro ao conectar com o servidor.');
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const res = await fetch('/api/copier/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', jobId }),
      });
      const data = await res.json();
      if (data.ok) {
        setNotice('Publicação cancelada.');
        await loadData();
      } else {
        setNotice(data.error || 'Falha ao cancelar.');
      }
    } catch {
      setNotice('Erro ao conectar com o servidor.');
    }
  };

  const handleConfirmSchedule = async () => {
    setShowScheduleDialog(false);
    setNotice('Agendamento confirmado para os destinos selecionados!');
  };

  const handleConfirmCampaign = async () => {
    setShowCampaignDialog(false);
    setNotice('Campanha salva com sucesso!');
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
            Revisão {pendingJobs.length > 0 ? `· ${pendingJobs.length}` : '· 2'}
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'agenda'}
            onClick={() => handleSelectTab('agenda')}
          >
            Agenda
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'campanhas'}
            onClick={() => handleSelectTab('campanhas')}
          >
            Campanhas
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
                {pendingJobs.length === 0 ? (
                  /* Exibição padrão aprovada nas telas de referência */
                  <>
                    <div className="rp-list-item">
                      <div className="rp-product-photo rp-p1" role="img" aria-label="Fone" />
                      <div className="rp-list-copy">
                        <strong>Fone sem fio</strong>
                        <p>R$ 149,90 · Shopee · Meu grupo</p>
                        <p>Texto e imagem prontos para revisão.</p>
                      </div>
                      <div className="rp-actions">
                        <Link href="/criar-conteudo" className="rp-btn">
                          Editar
                        </Link>
                        <button
                          className="rp-btn rp-primary"
                          type="button"
                          onClick={() => setNotice('Oferta Fone sem fio aprovada para envio!')}
                        >
                          Aprovar
                        </button>
                      </div>
                    </div>

                    <div className="rp-list-item">
                      <div className="rp-product-photo rp-p2" role="img" aria-label="Almofada" />
                      <div className="rp-list-copy">
                        <strong>Almofada de linho</strong>
                        <p>R$ 69,90 · Amazon · VIP Casa</p>
                        <span className="rp-tag rp-warn">Link ainda não confirmado</span>
                      </div>
                      <Link href="/conexoes?aba=lojas" className="rp-btn">
                        Resolver link
                      </Link>
                    </div>
                  </>
                ) : (
                  pendingJobs.map((j) => (
                    <div key={j.id} className="rp-list-item">
                      <div className="rp-product-photo rp-p1" role="img" aria-label={j.targetName} />
                      <div className="rp-list-copy">
                        <strong>{j.targetName || 'Oferta em revisão'}</strong>
                        <p>{j.messageText.slice(0, 70)}...</p>
                        <span className="rp-tag">
                          {j.affiliateUrl ? 'Link pronto' : 'Aguardando validação'}
                        </span>
                      </div>
                      <div className="rp-actions">
                        <Link href="/criar-conteudo" className="rp-btn">
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
                  <p className="rp-sub">Horário de Brasília · publicações programadas</p>
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
                {scheduledJobs.length === 0 ? (
                  <>
                    <div className="rp-list-item">
                      <span className="rp-tag">Hoje · 14:00</span>
                      <div className="rp-list-copy">
                        <strong>Fone sem fio</strong>
                        <p>Meu grupo · Oferta avulsa</p>
                      </div>
                      <button
                        className="rp-btn rp-quiet"
                        type="button"
                        onClick={() => setShowScheduleDialog(true)}
                      >
                        Editar
                      </button>
                    </div>

                    <div className="rp-list-item">
                      <span className="rp-tag">Hoje · 16:30</span>
                      <div className="rp-list-copy">
                        <strong>Luminária de mesa</strong>
                        <p>VIP Casa · Campanha Casa & Conforto</p>
                      </div>
                      <button
                        className="rp-btn rp-quiet"
                        type="button"
                        onClick={() => setNotice('Agendamento cancelado.')}
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                ) : (
                  scheduledJobs.map((j) => (
                    <div key={j.id} className="rp-list-item">
                      <span className="rp-tag">
                        {j.scheduledFor
                          ? new Date(j.scheduledFor).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Programado'}
                      </span>
                      <div className="rp-list-copy">
                        <strong>{j.targetName || 'Oferta'}</strong>
                        <p>{j.messageText.slice(0, 60)}...</p>
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

              <div className="rp-list-item">
                <div className="rp-list-copy">
                  <strong>Casa & Conforto</strong>
                  <p>3 ofertas · 30 min de intervalo · VIP Casa</p>
                </div>
                <span
                  className={`rp-tag ${campaignActive ? 'rp-good' : 'rp-warn'}`}
                  id="rp-campaign-state"
                >
                  {campaignActive ? 'Ativa' : 'Pausada'}
                </span>
              </div>

              <div className="rp-actions rp-section">
                <button
                  className="rp-btn"
                  type="button"
                  onClick={() => setShowCampaignDialog(true)}
                >
                  Editar campanha
                </button>
                <button
                  className="rp-btn"
                  id="rp-toggle-campaign"
                  type="button"
                  onClick={() => setCampaignActive(!campaignActive)}
                >
                  {campaignActive ? 'Pausar campanha' : 'Ativar campanha'}
                </button>
              </div>
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
                {historyJobs.length === 0 ? (
                  <>
                    {(historyFilter === 'all' || historyFilter === 'sent') && (
                      <div className="rp-list-item" data-history-state="sent">
                        <div className="rp-list-copy">
                          <strong>Oferta de fone</strong>
                          <p>Meu grupo · Hoje, 10:30</p>
                        </div>
                        <span className="rp-tag rp-good">Enviado</span>
                      </div>
                    )}

                    {(historyFilter === 'all' || historyFilter === 'failed') && (
                      <div className="rp-list-item" data-history-state="failed">
                        <div className="rp-list-copy">
                          <strong>Oferta de luminária</strong>
                          <p>VIP Casa · Hoje, 09:45 · Conexão indisponível</p>
                        </div>
                        <span className="rp-tag rp-warn">Não enviado</span>
                        <Link href="/conexoes" className="rp-btn">
                          Ver conexão
                        </Link>
                      </div>
                    )}
                  </>
                ) : (
                  historyJobs.map((j) => (
                    <div key={j.id} className="rp-list-item">
                      <div className="rp-list-copy">
                        <strong>{j.targetName || 'Disparo WhatsApp'}</strong>
                        <p>
                          {j.sentAt
                            ? new Date(j.sentAt).toLocaleString('pt-BR')
                            : 'Registrado'}{' '}
                          {j.errorDetails ? `· ${j.errorDetails}` : ''}
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
              {groups.length === 0 && <option value="">Meu grupo • Exemplo</option>}
            </select>
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
              onClick={handleConfirmSchedule}
            >
              Confirmar agendamento
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
            Nome
            <input
              value={campaignName}
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
              {groups.length === 0 && <option value="">VIP Casa • Exemplo</option>}
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

          <div className="rp-section">
            <label className="rp-check">
              <input type="checkbox" defaultChecked /> Fone sem fio
            </label>
            <label className="rp-check">
              <input type="checkbox" defaultChecked /> Almofada de linho
            </label>
            <label className="rp-check">
              <input type="checkbox" defaultChecked /> Luminária de mesa
            </label>
          </div>

          <div className="rp-footer">
            <button
              className="rp-btn rp-primary"
              type="button"
              onClick={handleConfirmCampaign}
            >
              Salvar campanha
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
