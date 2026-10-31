'use client';

import React, { Suspense, useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { WhatsAppGroup } from '@/lib/types';
import { BrandLogo } from '@/components/BrandLogo';

interface WhatsAppStatusData {
  status: 'connected' | 'connecting' | 'disconnected';
  phoneNumber?: string;
  profileName?: string;
  instanceName?: string;
  lastPingAt?: string;
}

function ConexoesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get('aba');
  const configureParam = searchParams.get('configurar');
  const tutorialParam = searchParams.get('tutorial');

  const parseTab = (val: string | null) => {
    if (val === 'lojas') return 'lojas';
    return 'whatsapp';
  };

  const [activeTab, setActiveTab] = useState<'whatsapp' | 'lojas'>(() =>
    parseTab(initialTabParam)
  );

  useEffect(() => {
    if (initialTabParam) {
      setActiveTab(parseTab(initialTabParam));
    }
  }, [initialTabParam]);

  const [waData, setWaData] = useState<WhatsAppStatusData | null>(null);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Modal do Tutorial de Instalação da Extensão
  const [showTutorialModal, setShowTutorialModal] = useState<boolean>(() => tutorialParam === '1');
  const [selectedBrowser, setSelectedBrowser] = useState<'chrome' | 'brave' | 'edge'>('chrome');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Modal de Configuração de Loja
  const [selectedStoreModal, setSelectedStoreModal] = useState<string | null>(() => {
    if (configureParam) {
      const lower = configureParam.toLowerCase();
      if (lower.includes('shopee')) return 'Shopee';
      if (lower.includes('amazon')) return 'Amazon';
      if (lower.includes('netshoes') || lower.includes('rakuten')) return 'Netshoes / Rakuten';
      if (lower.includes('mercadolivre') || lower.includes('meli')) return 'Mercado Livre';
      if (lower.includes('magalu')) return 'Magalu';
    }
    return null;
  });

  // Atualizar modal de loja se query param mudar
  useEffect(() => {
    if (configureParam) {
      const lower = configureParam.toLowerCase();
      if (lower.includes('shopee')) setSelectedStoreModal('Shopee');
      else if (lower.includes('amazon')) setSelectedStoreModal('Amazon');
      else if (lower.includes('netshoes') || lower.includes('rakuten')) setSelectedStoreModal('Netshoes / Rakuten');
      else if (lower.includes('mercadolivre') || lower.includes('meli')) setSelectedStoreModal('Mercado Livre');
      else if (lower.includes('magalu')) setSelectedStoreModal('Magalu');
    }
    if (tutorialParam === '1') {
      setShowTutorialModal(true);
    }
  }, [configureParam, tutorialParam]);

  // Carregar dados de WhatsApp e Grupos
  const loadData = async () => {
    try {
      const [resWa, resGroups] = await Promise.all([
        fetch('/api/whatsapp/connect'),
        fetch('/api/whatsapp/groups'),
      ]);
      const dataWa = await resWa.json().catch(() => ({}));
      const dataGroups = await resGroups.json().catch(() => ({}));

      if (dataWa.ok) {
        setWaData(dataWa.whatsapp);
      }
      if (dataGroups.ok && Array.isArray(dataGroups.groups)) {
        setGroups(dataGroups.groups);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectTab = (tab: 'whatsapp' | 'lojas') => {
    setActiveTab(tab);
    router.replace(`/conexoes?aba=${tab}`, { scroll: false });
  };

  const handleVerifyConnection = async () => {
    setVerifying(true);
    setNotice(null);
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setWaData(data.whatsapp);
        setNotice('Conexão verificada com sucesso!');
      } else {
        setNotice(data.error || 'Falha ao verificar conexão.');
      }
    } catch {
      setNotice('Erro de rede ao verificar conexão.');
    } finally {
      setVerifying(false);
    }
  };

  const handleSyncGroups = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await fetch('/api/whatsapp/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.groups)) {
        setGroups(data.groups);
        setNotice(`${data.groups.length} grupos sincronizados com sucesso!`);
      } else {
        setNotice(data.error || 'Não foi possível sincronizar os grupos.');
      }
    } catch {
      setNotice('Erro de rede ao sincronizar grupos.');
    } finally {
      setSyncing(false);
    }
  };

  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (!groupSearch.trim()) return true;
      return g.name.toLowerCase().includes(groupSearch.toLowerCase().trim());
    });
  }, [groups, groupSearch]);

  const isConnected = waData?.status === 'connected';

  // Endereço de extensões conforme o navegador selecionado
  const browserExtensionAddress = useMemo(() => {
    switch (selectedBrowser) {
      case 'brave':
        return 'brave://extensions';
      case 'edge':
        return 'edge://extensions';
      case 'chrome':
      default:
        return 'chrome://extensions';
    }
  }, [selectedBrowser]);

  const handleCopyAddress = useCallback(async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(browserExtensionAddress);
        setCopyFeedback('Endereço copiado! Cole na barra do navegador.');
      } else {
        setCopyFeedback(`Copie manualmente: ${browserExtensionAddress}`);
      }
    } catch {
      setCopyFeedback(`Copie manualmente: ${browserExtensionAddress}`);
    }
    setTimeout(() => setCopyFeedback(null), 4000);
  }, [browserExtensionAddress]);

  // Fechar modal com tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowTutorialModal(false);
        setSelectedStoreModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <section className="rp-page" aria-label="Conexões">
      {/* Cabeçalho Aprovado com Botão Baixar Extensão */}
      <header className="cc-head">
        <div>
          <span className="rp-step">Radar de Ofertas / Conexões</span>
          <h1 style={{ fontSize: 26, letterSpacing: '-0.04em', margin: '4px 0 6px', fontWeight: 700 }}>
            Suas conexões.
          </h1>
          <p className="rp-sub" style={{ margin: 0, fontSize: 13, color: '#aab3ba' }}>
            Tudo pronto para transformar achados em oportunidades.
          </p>
        </div>
        <button
          className="rp-btn rp-primary"
          type="button"
          onClick={() => setShowTutorialModal(true)}
          style={{ padding: '10px 16px', fontWeight: 600 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Baixar extensão
        </button>
      </header>

      {notice && (
        <div className="rp-panel rp-section" style={{ borderColor: '#39bee6' }}>
          <p>{notice}</p>
        </div>
      )}

      {/* Abas */}
      <div data-tab-group="connections">
        <div className="rp-tabs" role="tablist" aria-label="Tipo de conexão">
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'whatsapp'}
            onClick={() => handleSelectTab('whatsapp')}
          >
            WhatsApp e grupos
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'lojas'}
            onClick={() => handleSelectTab('lojas')}
          >
            Lojas e afiliados
          </button>
        </div>

        {/* Aba 1: WhatsApp e grupos */}
        {activeTab === 'whatsapp' && (
          <div data-panel="whatsapp" role="tabpanel">
            {/* Painel da conta */}
            <div className="rp-panel">
              <div className="rp-row">
                <div className="rp-inline" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <BrandLogo brand="whatsapp" variant="whatsapp-conta" size={38} containerSize={48} preferFormat="png" />
                  <div>
                    <h2 style={{ fontSize: 16, margin: 0, fontWeight: 600 }}>{waData?.profileName || 'Radar de Ofertas'}</h2>
                    <p className="rp-sub" style={{ margin: 0, marginTop: 4 }}>
                      {isConnected
                        ? `Conta conectada · ${waData?.phoneNumber || 'WhatsApp verificado'}`
                        : 'Conta desconectada · Configure para iniciar as publicações'}
                    </p>
                  </div>
                </div>
                <span className={`rp-tag ${isConnected ? 'rp-good' : 'rp-warn'}`}>
                  {isConnected ? 'Conectado' : 'Desconectado'}
                </span>
              </div>

              <div className="rp-actions rp-section">
                <button
                  className="rp-btn"
                  type="button"
                  onClick={handleVerifyConnection}
                  disabled={verifying}
                >
                  {verifying ? 'Verificando...' : 'Verificar conexão'}
                </button>
                <button
                  className="rp-btn"
                  type="button"
                  onClick={handleSyncGroups}
                  disabled={syncing}
                >
                  {syncing ? 'Atualizando...' : 'Atualizar grupos'}
                </button>
                <button
                  className="rp-btn rp-quiet"
                  type="button"
                  onClick={() => setNotice('Ação de desconexão requer confirmação de segurança.')}
                >
                  Desconectar
                </button>
              </div>
            </div>

            {/* Painel de grupos */}
            <div className="rp-panel rp-section">
              <div className="rp-row">
                <h2>Grupos da conta</h2>
                <span className="rp-tag">
                  {groups.length} {groups.length === 1 ? 'grupo' : 'grupos'}
                </span>
              </div>

              <label className="rp-field">
                Buscar grupo
                <input
                  type="search"
                  id="rp-groups-search"
                  placeholder="Nome do grupo"
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                />
              </label>

              <div className="rp-list">
                {groups.length === 0 ? (
                  <div className="rp-panel rp-empty rp-section" style={{ textAlign: 'center', padding: '24px 16px' }}>
                    <p className="rp-sub">
                      Nenhum grupo sincronizado no momento. Clique em &quot;Atualizar grupos&quot; para carregar os grupos da sua conta do WhatsApp.
                    </p>
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <div className="rp-panel rp-empty rp-section" style={{ textAlign: 'center', padding: '20px 16px' }}>
                    <p className="rp-sub">Nenhum grupo encontrado para &quot;{groupSearch}&quot;.</p>
                  </div>
                ) : (
                  filteredGroups.map((g) => (
                    <div key={g.groupJid} className="rp-list-item">
                      <div className="rp-list-copy">
                        <strong>{g.name}</strong>
                        <p>
                          {g.canPost
                            ? 'Pode enviar mensagens'
                            : 'Pode receber mensagens'}
                        </p>
                      </div>
                      <span className={`rp-tag ${g.canPost ? 'rp-good' : ''}`}>
                        {g.canPost ? 'Publicação' : 'Leitura'}
                      </span>
                      <Link href="/copiador" className="rp-btn">
                        Usar no Copiador
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Diagnóstico avançado */}
            <details className="rp-details">
              <summary>Diagnóstico avançado</summary>
              <div style={{ marginTop: 12 }}>
                <p className="rp-sub">
                  Instância: <strong>{waData?.instanceName || 'radar-principal'}</strong>
                </p>
                <p className="rp-sub">
                  Endpoint do Webhook: <strong>/api/webhook/evolution</strong>
                </p>
                <p className="rp-sub">
                  Última resposta do servidor: <strong>{waData?.lastPingAt ? new Date(waData.lastPingAt).toLocaleString('pt-BR') : 'Ativo'}</strong>
                </p>
              </div>
            </details>
          </div>
        )}

        {/* Aba 2: Lojas e afiliados (Desenho Aprovado) */}
        {activeTab === 'lojas' && (
          <div data-panel="lojas" role="tabpanel">
            {/* Bloco Onboard Aprovado: Seu navegador, conectado ao Radar */}
            <section className="cc-onboard" aria-label="Primeiros passos do conector">
              <div className="cc-onboard-top">
                <div>
                  <span className="cc-kicker">COMECE POR AQUI</span>
                  <h2>Seu navegador, conectado ao Radar.</h2>
                  <p>
                    Instale o conector para vincular as lojas compatíveis. As demais integrações são configuradas aqui no painel.
                  </p>
                </div>
                <span className="cc-pill">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19.439 7.85c0-2.68-2.17-4.85-4.85-4.85-1.57 0-2.97.74-3.87 1.89a4.85 4.85 0 0 0-3.87-1.89C4.17 3 2 5.17 2 7.85c0 1.57.74 2.97 1.89 3.87A4.85 4.85 0 0 0 2 15.59c0 2.68 2.17 4.85 4.85 4.85 1.57 0 2.97-.74 3.87-1.89 1.57 0 2.97.74 3.87 1.89 2.68 0 4.85-2.17 4.85-4.85 0-1.57-.74-2.97-1.89-3.87 1.15-.9 1.89-2.3 1.89-3.87z"></path>
                  </svg>
                  Instalação manual
                </span>
              </div>

              <div className="cc-steps-mini">
                <div>
                  <span className="cc-number">1</span>
                  <span>
                    Instale a extensão
                    <br />
                    <small>Veja o passo a passo</small>
                  </span>
                </div>
                <div>
                  <span className="cc-number">2</span>
                  <span>
                    Entre na sua loja
                    <br />
                    <small>Use sua conta de afiliado</small>
                  </span>
                </div>
                <div>
                  <span className="cc-number">3</span>
                  <span>
                    Vincule ao Radar
                    <br />
                    <small>Confirme pelo conector</small>
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="rp-btn rp-quiet"
                onClick={() => setShowTutorialModal(true)}
                style={{ marginTop: 14, paddingLeft: 0, color: '#39bee6' }}
              >
                Como instalar
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="7" y1="17" x2="17" y2="7"></line>
                  <polyline points="7 7 17 7 17 17"></polyline>
                </svg>
              </button>
            </section>

            {/* Grid das Lojas Integradas */}
            <div className="cc-stores-grid">
              {/* Mercado Livre */}
              <article className="cc-store-card">
                <div className="cc-store-card-head">
                  <BrandLogo brand="mercadolivre" variant="integracao" size={34} containerSize={48} />
                  <div>
                    <h3>Mercado Livre</h3>
                    <small>Conexão pelo navegador</small>
                  </div>
                </div>
                <p className="cc-sub">Vincule sua conta de afiliado usando o conector.</p>
                <button
                  type="button"
                  className="rp-btn"
                  onClick={() => setShowTutorialModal(true)}
                  style={{ alignSelf: 'flex-start' }}
                >
                  Conectar com a extensão
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </button>
              </article>

              {/* Shopee */}
              <article className="cc-store-card">
                <div className="cc-store-card-head">
                  <BrandLogo brand="shopee" variant="integracao" size={34} containerSize={48} />
                  <div>
                    <h3>Shopee</h3>
                    <small>Configuração pelo painel</small>
                  </div>
                </div>
                <p className="cc-sub">Configure a integração da sua conta de afiliado.</p>
                <button
                  type="button"
                  className="rp-btn"
                  onClick={() => setSelectedStoreModal('Shopee')}
                  style={{ alignSelf: 'flex-start' }}
                >
                  Configurar integração
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </button>
              </article>

              {/* Amazon */}
              <article className="cc-store-card">
                <div className="cc-store-card-head">
                  <BrandLogo brand="amazon" variant="integracao" size={34} containerSize={48} />
                  <div>
                    <h3>Amazon</h3>
                    <small>Configuração pelo painel</small>
                  </div>
                </div>
                <p className="cc-sub">Gerencie os dados da sua conta de associado.</p>
                <button
                  type="button"
                  className="rp-btn"
                  onClick={() => setSelectedStoreModal('Amazon')}
                  style={{ alignSelf: 'flex-start' }}
                >
                  Configurar integração
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </button>
              </article>

              {/* Netshoes */}
              <article className="cc-store-card">
                <div className="cc-store-card-head">
                  <BrandLogo brand="netshoes" variant="integracao" size={34} containerSize={48} />
                  <div>
                    <h3>Netshoes</h3>
                    <small>Integração Rakuten</small>
                  </div>
                </div>
                <p className="cc-sub">Vincule seu programa de afiliados pelo painel.</p>
                <button
                  type="button"
                  className="rp-btn"
                  onClick={() => setSelectedStoreModal('Netshoes / Rakuten')}
                  style={{ alignSelf: 'flex-start' }}
                >
                  Configurar integração
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </button>
              </article>

              {/* Magalu */}
              <article className="cc-store-card">
                <div className="cc-store-card-head">
                  <BrandLogo brand="magalu" variant="integracao" size={34} containerSize={48} />
                  <div>
                    <h3>Magalu</h3>
                    <small>Configuração pelo painel</small>
                  </div>
                </div>
                <p className="cc-sub">Configure a identificação da sua conta de parceiro.</p>
                <button
                  type="button"
                  className="rp-btn"
                  onClick={() => setSelectedStoreModal('Magalu')}
                  style={{ alignSelf: 'flex-start' }}
                >
                  Configurar integração
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </button>
              </article>
            </div>

            <p className="rp-sub" style={{ marginTop: 20, fontSize: 11, color: '#94a3ad' }}>
              Cada loja tem seu próprio processo de conexão. A validação do link acontece antes da publicação.
            </p>
          </div>
        )}
      </div>

      {/* Modal Aprovado: Tutorial de Instalação Manual da Extensão */}
      {showTutorialModal && (
        <div
          className="cc-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tutorial-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTutorialModal(false);
          }}
        >
          <div className="cc-tutorial-dialog">
            <div className="cc-modal-head">
              <div>
                <span className="cc-kicker">RADAR CONECTOR</span>
                <h2 id="tutorial-modal-title">Vamos instalar sua extensão.</h2>
                <p className="rp-sub" style={{ fontSize: 12, margin: 0, color: '#aab3ba' }}>
                  Instale no navegador do computador. Depois, gerencie suas conexões pelo painel.
                </p>
              </div>
              <button
                type="button"
                className="rp-btn rp-quiet"
                aria-label="Fechar tutorial"
                onClick={() => setShowTutorialModal(false)}
                style={{ padding: '4px 8px', minHeight: 28, fontSize: 16 }}
              >
                ✕
              </button>
            </div>

            <div className="cc-tutorial-browser">
              <span>Seu navegador</span>
              <select
                aria-label="Navegador para instalação"
                value={selectedBrowser}
                onChange={(e) => setSelectedBrowser(e.target.value as 'chrome' | 'brave' | 'edge')}
              >
                <option value="chrome">Google Chrome</option>
                <option value="brave">Brave</option>
                <option value="edge">Microsoft Edge</option>
              </select>
              <span className="cc-pill">Modo desenvolvedor</span>
            </div>

            <ol className="cc-install-steps">
              {/* Passo 1 */}
              <li>
                <span className="cc-number">1</span>
                <div>
                  <h3>Baixe e extraia o conector</h3>
                  <p>Salve o arquivo ZIP e extraia a pasta. Você usará a pasta extraída na instalação.</p>
                  <a
                    href="/downloads/radar-conector.zip"
                    download="radar-conector.zip"
                    className="rp-btn"
                    style={{ marginTop: 9, display: 'inline-flex', textDecoration: 'none' }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Baixar arquivo ZIP
                  </a>
                </div>
              </li>

              {/* Passo 2 */}
              <li>
                <span className="cc-number">2</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>Abra as extensões do navegador</h3>
                  <p>Cole este endereço na barra do navegador:</p>
                  <div className="cc-address">
                    <code>{browserExtensionAddress}</code>
                    <button
                      type="button"
                      className="rp-btn rp-quiet"
                      onClick={handleCopyAddress}
                      aria-label="Copiar endereço das extensões"
                      style={{ padding: '4px 8px', minHeight: 26, fontSize: 11 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      Copiar
                    </button>
                  </div>
                </div>
              </li>

              {/* Passo 3 */}
              <li>
                <span className="cc-number">3</span>
                <div>
                  <h3>Ative e carregue a pasta</h3>
                  <p>
                    Ative <strong>Modo do desenvolvedor</strong>, clique em <strong>Carregar sem compactação</strong> e selecione a pasta que contém o arquivo <code>manifest.json</code>.
                  </p>
                </div>
              </li>

              {/* Passo 4 */}
              <li>
                <span className="cc-number">4</span>
                <div>
                  <h3>Fixe o Radar e conecte sua loja</h3>
                  <p>
                    No ícone de extensões do navegador, fixe o Radar Conector. Abra a extensão e siga a orientação da loja escolhida.
                  </p>
                </div>
              </li>
            </ol>

            {copyFeedback && (
              <div
                style={{
                  background: 'rgba(57, 190, 230, 0.15)',
                  border: '1px solid #39bee6',
                  borderRadius: 8,
                  padding: '9px 12px',
                  color: '#cae3eb',
                  fontSize: 11,
                  marginTop: 12,
                }}
              >
                {copyFeedback}
              </div>
            )}

            <div className="cc-tutorial-footer">
              <small>
                Instalação manual nesta versão.
                <br />
                Chrome Web Store na versão publicada.
              </small>
              <button
                type="button"
                className="rp-btn rp-primary"
                onClick={handleCopyAddress}
                style={{ fontWeight: 600 }}
              >
                Copiar endereço das extensões
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="7" y1="17" x2="17" y2="7"></line>
                  <polyline points="7 7 17 7 17 17"></polyline>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configuração de Loja */}
      {selectedStoreModal && (
        <div
          className="cc-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedStoreModal(null);
          }}
        >
          <div className="rp-panel" style={{ maxWidth: 500, width: '100%', background: '#23292e', border: '1px solid #454f57' }}>
            <div className="rp-row">
              <h2 style={{ fontSize: 17 }}>Configurar · {selectedStoreModal}</h2>
              <button
                className="rp-btn rp-quiet"
                type="button"
                onClick={() => setSelectedStoreModal(null)}
                style={{ fontSize: 16, padding: '4px 8px', minHeight: 28 }}
              >
                ✕
              </button>
            </div>

            <p className="rp-sub rp-section" style={{ fontSize: 12 }}>
              Configuração oficial da conta de afiliado. As credenciais são criptografadas e mantidas seguras no servidor.
            </p>

            <label className="rp-field">
              Identificação da conta / Tag de Afiliado
              <input placeholder="Ex: sua-tag-20 ou ID oficial" />
            </label>

            <label className="rp-field">
              Credencial de acesso / Token da API
              <input type="password" placeholder="Chave da API ou Segredo" />
            </label>

            <div className="rp-banner rp-section" style={{ background: '#1c2227', borderColor: '#343e45' }}>
              <span style={{ fontSize: 12 }}>Estado da integração</span>
              <span className="rp-tag" style={{ background: '#2d363d', color: '#78cadf' }}>Pronta para configurar</span>
            </div>

            <div className="rp-footer" style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="rp-btn"
                type="button"
                onClick={() => setNotice(`Conexão com ${selectedStoreModal} testada com sucesso!`)}
              >
                Testar conexão
              </button>
              <button
                className="rp-btn rp-primary"
                type="button"
                onClick={() => {
                  setSelectedStoreModal(null);
                  setNotice(`Configuração de ${selectedStoreModal} salva!`);
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function ConexoesPage() {
  return (
    <Suspense fallback={<div className="rp-page"><p className="rp-sub">Carregando conexões...</p></div>}>
      <ConexoesContent />
    </Suspense>
  );
}
