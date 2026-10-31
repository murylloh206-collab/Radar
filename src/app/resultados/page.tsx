'use client';

import React, { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

interface GroupAnalyticsData {
  id: string;
  groupJid: string;
  name: string;
  participantCount: number;
  messagesSent: number;
}

function ResultadosContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get('aba');

  const [activeTab, setActiveTab] = useState<'grupos' | 'vendas'>(() =>
    initialTabParam === 'vendas' ? 'vendas' : 'grupos'
  );
  const [period, setPeriod] = useState('Últimos 7 dias');
  const [groups, setGroups] = useState<GroupAnalyticsData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (initialTabParam === 'vendas') {
      setActiveTab('vendas');
    } else if (initialTabParam === 'grupos') {
      setActiveTab('grupos');
    }
  }, [initialTabParam]);

  useEffect(() => {
    fetch('/api/analytics/groups')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.groups)) {
          setGroups(data.groups);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalSent = useMemo(() => {
    return groups.reduce((acc, g) => acc + (g.messagesSent || 0), 0);
  }, [groups]);

  const activeGroupCount = useMemo(() => {
    return groups.filter((g) => (g.messagesSent || 0) > 0).length;
  }, [groups]);

  const handleSelectTab = (tab: 'grupos' | 'vendas') => {
    setActiveTab(tab);
    router.replace(`/resultados?aba=${tab}`, { scroll: false });
  };

  return (
    <section className="rp-page" aria-label="Resultados">
      {/* Cabeçalho */}
      <div className="rp-head">
        <div>
          <span className="rp-step">Gestão</span>
          <h1>Resultados</h1>
          <p>Entenda a operação dos grupos e o retorno das suas ofertas.</p>
        </div>
        <label className="rp-field">
          Período
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="Últimos 7 dias">Últimos 7 dias</option>
            <option value="Últimos 30 dias">Últimos 30 dias</option>
            <option value="Este mês">Este mês</option>
          </select>
        </label>
      </div>

      {/* Abas */}
      <div data-tab-group="results">
        <div className="rp-tabs" role="tablist" aria-label="Tipo de resultado">
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'grupos'}
            onClick={() => handleSelectTab('grupos')}
          >
            Grupos
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'vendas'}
            onClick={() => handleSelectTab('vendas')}
          >
            Vendas e comissões
          </button>
        </div>

        {/* Aba 1: Grupos */}
        {activeTab === 'grupos' && (
          <div data-panel="grupos" role="tabpanel">
            <div className="rp-three">
              <div className="rp-panel rp-stat">
                <small>Envios confirmados</small>
                <strong>{totalSent}</strong>
                <p className="rp-sub">No período escolhido</p>
              </div>
              <div className="rp-panel rp-stat">
                <small>Grupos com publicação</small>
                <strong>{activeGroupCount}</strong>
                <p className="rp-sub">No período escolhido</p>
              </div>
              <div className="rp-panel rp-stat">
                <small>Envios com falha</small>
                <strong>0</strong>
                <p className="rp-sub">Ver detalhe em Envios</p>
              </div>
            </div>

            <div className="rp-panel rp-section">
              <div className="rp-row">
                <h2>Publicações ao longo da semana</h2>
                <span className="rp-tag">Exemplo</span>
              </div>
              <div
                className="rp-bars"
                role="img"
                aria-label="Dados de envios: segunda 2, terça 4, quarta 3, quinta 5, sexta 4, sábado 4, domingo 2 envios"
              >
                <div className="rp-bar">
                  <span style={{ height: '36%' } as React.CSSProperties} />
                  <b>Seg · 2</b>
                </div>
                <div className="rp-bar">
                  <span style={{ height: '72%' } as React.CSSProperties} />
                  <b>Ter · 4</b>
                </div>
                <div className="rp-bar">
                  <span style={{ height: '54%' } as React.CSSProperties} />
                  <b>Qua · 3</b>
                </div>
                <div className="rp-bar">
                  <span style={{ height: '90%' } as React.CSSProperties} />
                  <b>Qui · 5</b>
                </div>
                <div className="rp-bar">
                  <span style={{ height: '72%' } as React.CSSProperties} />
                  <b>Sex · 4</b>
                </div>
                <div className="rp-bar">
                  <span style={{ height: '72%' } as React.CSSProperties} />
                  <b>Sáb · 4</b>
                </div>
                <div className="rp-bar">
                  <span style={{ height: '36%' } as React.CSSProperties} />
                  <b>Dom · 2</b>
                </div>
              </div>
            </div>

            <div className="rp-panel rp-section">
              <h2>Por grupo</h2>
              {groups.length === 0 ? (
                <div className="rp-panel rp-empty rp-section" style={{ textAlign: 'center', padding: '24px 16px' }}>
                  <p className="rp-sub">Nenhum grupo com histórico de envios registrado até o momento.</p>
                </div>
              ) : (
                groups.map((g) => (
                  <div key={g.id || g.groupJid} className="rp-list-item">
                    <div className="rp-list-copy">
                      <strong>{g.name}</strong>
                      <p>{g.participantCount} participantes</p>
                    </div>
                    <span className="rp-tag">{g.messagesSent || 0} envios</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Aba 2: Vendas e comissões */}
        {activeTab === 'vendas' && (
          <div data-panel="vendas" role="tabpanel">
            <div className="rp-three">
              <div className="rp-panel rp-stat">
                <small>Cliques</small>
                <strong>—</strong>
                <p className="rp-sub">Dados indisponíveis</p>
              </div>
              <div className="rp-panel rp-stat">
                <small>Pedidos</small>
                <strong>—</strong>
                <p className="rp-sub">Dados indisponíveis</p>
              </div>
              <div className="rp-panel rp-stat">
                <small>Comissões</small>
                <strong>—</strong>
                <p className="rp-sub">Dados indisponíveis</p>
              </div>
            </div>

            <div className="rp-panel rp-empty rp-section">
              <h2>Conecte os relatórios da loja</h2>
              <p>
                Cliques, pedidos e comissões aparecem quando a integração disponibilizar esses dados.
              </p>
              <Link
                href="/conexoes?aba=lojas"
                className="rp-btn rp-primary"
                style={{ display: 'inline-block', marginTop: 12 }}
              >
                Gerenciar lojas
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function ResultadosPage() {
  return (
    <Suspense fallback={<div className="rp-page"><p className="rp-sub">Carregando resultados...</p></div>}>
      <ResultadosContent />
    </Suspense>
  );
}

