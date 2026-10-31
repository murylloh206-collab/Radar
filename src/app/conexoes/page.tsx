'use client';

import React, { Suspense, useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { WhatsAppGroup, StoreName } from '@/lib/types';
import { SafeVaultStatus } from '@/lib/server/credentials-vault';
import { BrandLogo } from '@/components/BrandLogo';

interface WhatsAppStatusData {
  status: 'connected' | 'connecting' | 'disconnected';
  phoneNumber?: string;
  profileName?: string;
  instanceName?: string;
  lastPingAt?: string;
}

interface StoreConfigForm {
  appId: string;
  appSecret: string;
  affiliateTag: string;
  userToken: string;
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

  // Status real das lojas no cofre
  const [vaultStores, setVaultStores] = useState<SafeVaultStatus[]>([]);

  // Preferência da dica de instalação (persistida no localStorage)
  const [hideGuide, setHideGuide] = useState<boolean>(false);

  // Modal do Tutorial de Instalação da Extensão
  const [showTutorialModal, setShowTutorialModal] = useState<boolean>(() => tutorialParam === '1');
  const [selectedBrowser, setSelectedBrowser] = useState<'chrome' | 'brave' | 'edge'>('chrome');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Modal exclusivo de Escolha de Método do Mercado Livre
  const [showMLMethodModal, setShowMLMethodModal] = useState<boolean>(false);

  // Modal de Configuração Direta da Loja Selecionada
  const [selectedStoreConfig, setSelectedStoreConfig] = useState<StoreName | null>(() => {
    if (configureParam) {
      const lower = configureParam.toLowerCase();
      if (lower.includes('shopee')) return 'shopee';
      if (lower.includes('amazon')) return 'amazon';
      if (lower.includes('netshoes') || lower.includes('rakuten')) return 'netshoes';
      if (lower.includes('mercadolivre') || lower.includes('meli')) return 'mercadolivre';
      if (lower.includes('magalu')) return 'magalu';
    }
    return null;
  });

  // Campos do formulário de configuração direta
  const [configForm, setConfigForm] = useState<StoreConfigForm>({
    appId: '',
    appSecret: '',
    affiliateTag: '',
    userToken: '',
  });

  // Feedback do modal de configuração (status, mensagem e loading)
  const [configLoading, setConfigLoading] = useState<boolean>(false);
  const [configFeedback, setConfigFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Carregar preferência salva no navegador para a dica de instalação
  useEffect(() => {
    try {
      const stored = localStorage.getItem('radar_hide_install_guide');
      if (stored === 'true') {
        setHideGuide(true);
      }
    } catch {}
  }, []);

  const handleDismissGuide = () => {
    setHideGuide(true);
    try {
      localStorage.setItem('radar_hide_install_guide', 'true');
    } catch {}
  };

  const handleRestoreGuide = () => {
    setHideGuide(false);
    try {
      localStorage.removeItem('radar_hide_install_guide');
    } catch {}
  };

  // Carregar dados de WhatsApp, Grupos e Lojas do cofre
  const loadData = useCallback(async () => {
    try {
      const [resWa, resGroups, resVault] = await Promise.all([
        fetch('/api/whatsapp/connect'),
        fetch('/api/whatsapp/groups'),
        fetch('/api/integrations/vault'),
      ]);

      const dataWa = await resWa.json().catch(() => ({}));
      const dataGroups = await resGroups.json().catch(() => ({}));
      const dataVault = await resVault.json().catch(() => ({}));

      if (dataWa.ok) {
        setWaData(dataWa.whatsapp);
      }
      if (dataGroups.ok && Array.isArray(dataGroups.groups)) {
        setGroups(dataGroups.groups);
      }
      if (dataVault.ok && Array.isArray(dataVault.stores)) {
        setVaultStores(dataVault.stores);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Verificar se uma loja está realmente conectada e validada no cofre
  const isStoreConnected = useCallback((storeName: StoreName): boolean => {
    const found = vaultStores.find((s) => s.storeName === storeName);
    return found?.connectionStatus === 'conectado';
  }, [vaultStores]);

  // Abrir modal de configuração direta populando campos se já existirem metadados
  const handleOpenStoreConfig = (store: StoreName) => {
    setShowMLMethodModal(false);
    setConfigFeedback(null);
    const existing = vaultStores.find((s) => s.storeName === store);

    setConfigForm({
      appId: existing?.appId || '',
      appSecret: '',
      affiliateTag: existing?.affiliateTag || existing?.tagIdentified || '',
      userToken: '',
    });

    setSelectedStoreConfig(store);
  };

  // Tratar clique no card de uma loja
  const handleCardClick = (store: StoreName) => {
    if (store === 'mercadolivre') {
      setShowMLMethodModal(true);
    } else {
      handleOpenStoreConfig(store);
    }
  };

  // Desconectar loja via API
  const handleDisconnectStore = async (store: StoreName) => {
    setConfigLoading(true);
    try {
      const res = await fetch('/api/integrations/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect', storeName: store }),
      });
      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(data.stores)) {
          setVaultStores(data.stores);
        } else {
          await loadData();
        }
        setShowMLMethodModal(false);
        setSelectedStoreConfig(null);
        setNotice(`Integração de ${store} desconectada.`);
      } else {
        setNotice(data.error || 'Falha ao desconectar loja.');
      }
    } catch {
      setNotice('Erro de rede ao desconectar loja.');
    } finally {
      setConfigLoading(false);
    }
  };

  // Testar integração no modal
  const handleTestIntegration = async () => {
    if (!selectedStoreConfig) return;
    setConfigLoading(true);
    setConfigFeedback(null);

    try {
      const res = await fetch('/api/integrations/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          storeName: selectedStoreConfig,
          data: configForm,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setConfigFeedback({
          type: 'success',
          message: data.message || 'Integração testada e validada com sucesso!',
        });
      } else {
        setConfigFeedback({
          type: 'error',
          message: data.error || 'Falha na validação das credenciais.',
        });
      }
    } catch {
      setConfigFeedback({
        type: 'error',
        message: 'Erro de comunicação ao testar integração. Verifique a conexão.',
      });
    } finally {
      setConfigLoading(false);
    }
  };

  // Salvar integração no cofre via API
  const handleSaveIntegration = async () => {
    if (!selectedStoreConfig) return;
    setConfigLoading(true);
    setConfigFeedback(null);

    try {
      const res = await fetch('/api/integrations/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          storeName: selectedStoreConfig,
          data: configForm,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(data.stores)) {
          setVaultStores(data.stores);
        } else {
          await loadData();
        }

        setConfigFeedback({
          type: 'success',
          message: data.message || 'Integração salva e conectada com sucesso!',
        });

        // Fechar modal suavemente após confirmação confirmada do servidor
        setTimeout(() => {
          setSelectedStoreConfig(null);
          setConfigFeedback(null);
        }, 1200);
      } else {
        setConfigFeedback({
          type: 'error',
          message: data.error || 'Falha ao salvar integração no cofre.',
        });
      }
    } catch {
      setConfigFeedback({
        type: 'error',
        message: 'Erro de rede ao salvar credenciais no servidor.',
      });
    } finally {
      setConfigLoading(false);
    }
  };

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

  // Fechar modais com tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowTutorialModal(false);
        setShowMLMethodModal(false);
        setSelectedStoreConfig(null);
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
                {loading ? (
                  <p className="rp-sub">Carregando grupos...</p>
                ) : filteredGroups.length === 0 ? (
                  <p className="rp-sub">Nenhum grupo encontrado.</p>
                ) : (
                  filteredGroups.map((g) => (
                    <div key={g.id} className="rp-item">
                      <div>
                        <strong>{g.name}</strong>
                        <p className="rp-sub">ID: {g.groupJid || g.id}</p>
                      </div>
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

        {/* Aba 2: Lojas e afiliados (Desenho Aprovado Atualizado) */}
        {activeTab === 'lojas' && (
          <div data-panel="lojas" role="tabpanel">
            {/* Botão de Restaurar Guia (Aparece quando a dica é ocultada) */}
            {hideGuide && (
              <div className="cc-guide-return">
                <button type="button" onClick={handleRestoreGuide}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                  Mostrar guia de instalação
                </button>
              </div>
            )}

            {/* Bloco Onboard Aprovado: Dica de instalação ocultável */}
            {!hideGuide && (
              <section className="cc-onboard" aria-label="Primeiros passos do conector">
                <div className="cc-onboard-top">
                  <div>
                    <span className="cc-kicker">COMECE POR AQUI</span>
                    <h2>Seu navegador, conectado ao Radar.</h2>
                    <p className="cc-sub">
                      Instale o conector para vincular as lojas compatíveis. As demais integrações são configuradas aqui no painel.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="cc-dismiss-guide"
                    onClick={handleDismissGuide}
                    aria-label="Ocultar dica de instalação"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                    Ocultar dica
                  </button>
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
            )}

            {/* Grid dos Cards de Lojas Inteiros Clicáveis */}
            <div className="cc-stores-grid" role="region" aria-label="Lojas e afiliados disponíveis">
              {/* Mercado Livre */}
              <button
                type="button"
                className="cc-store-card"
                onClick={() => handleCardClick('mercadolivre')}
                aria-label={`Mercado Livre${isStoreConnected('mercadolivre') ? ', conectado' : ''}. Gerenciar integração`}
              >
                {isStoreConnected('mercadolivre') && (
                  <span className="cc-card-connection" aria-hidden="true">
                    <span className="cc-connected-label">Conectado</span>
                    <span className="cc-connected-dot"></span>
                  </span>
                )}
                <span className="cc-store-head">
                  <span className="cc-mark">
                    <BrandLogo brand="mercadolivre" variant="integracao" size={38} containerSize={50} />
                  </span>
                  <span>
                    <strong className="cc-store-name">Mercado Livre</strong>
                    <small>Extensão ou configuração manual</small>
                  </span>
                </span>
                <span className="cc-store-description">Sua conta de afiliado, do seu jeito.</span>
                <span className="cc-store-corner" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </span>
              </button>

              {/* Shopee */}
              <button
                type="button"
                className="cc-store-card"
                onClick={() => handleCardClick('shopee')}
                aria-label={`Shopee${isStoreConnected('shopee') ? ', conectado' : ''}. Configurar integração`}
              >
                {isStoreConnected('shopee') && (
                  <span className="cc-card-connection" aria-hidden="true">
                    <span className="cc-connected-label">Conectado</span>
                    <span className="cc-connected-dot"></span>
                  </span>
                )}
                <span className="cc-store-head">
                  <span className="cc-mark">
                    <BrandLogo brand="shopee" variant="integracao" size={38} containerSize={50} />
                  </span>
                  <span>
                    <strong className="cc-store-name">Shopee</strong>
                    <small>Programa de afiliados</small>
                  </span>
                </span>
                <span className="cc-store-description">Gerencie os dados da sua integração.</span>
                <span className="cc-store-corner" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </span>
              </button>

              {/* Amazon */}
              <button
                type="button"
                className="cc-store-card"
                onClick={() => handleCardClick('amazon')}
                aria-label={`Amazon${isStoreConnected('amazon') ? ', conectado' : ''}. Configurar integração`}
              >
                {isStoreConnected('amazon') && (
                  <span className="cc-card-connection" aria-hidden="true">
                    <span className="cc-connected-label">Conectado</span>
                    <span className="cc-connected-dot"></span>
                  </span>
                )}
                <span className="cc-store-head">
                  <span className="cc-mark">
                    <BrandLogo brand="amazon" variant="integracao" size={38} containerSize={50} />
                  </span>
                  <span>
                    <strong className="cc-store-name">Amazon</strong>
                    <small>Programa de associados</small>
                  </span>
                </span>
                <span className="cc-store-description">Conecte as oportunidades da sua conta.</span>
                <span className="cc-store-corner" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </span>
              </button>

              {/* Netshoes */}
              <button
                type="button"
                className="cc-store-card"
                onClick={() => handleCardClick('netshoes')}
                aria-label={`Netshoes${isStoreConnected('netshoes') ? ', conectado' : ''}. Configurar integração`}
              >
                {isStoreConnected('netshoes') && (
                  <span className="cc-card-connection" aria-hidden="true">
                    <span className="cc-connected-label">Conectado</span>
                    <span className="cc-connected-dot"></span>
                  </span>
                )}
                <span className="cc-store-head">
                  <span className="cc-mark">
                    <BrandLogo brand="netshoes" variant="integracao" size={38} containerSize={50} />
                  </span>
                  <span>
                    <strong className="cc-store-name">Netshoes</strong>
                    <small>Integração Rakuten</small>
                  </span>
                </span>
                <span className="cc-store-description">Seu programa de afiliados em um só lugar.</span>
                <span className="cc-store-corner" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </span>
              </button>

              {/* Magalu */}
              <button
                type="button"
                className="cc-store-card"
                onClick={() => handleCardClick('magalu')}
                aria-label={`Magalu${isStoreConnected('magalu') ? ', conectado' : ''}. Configurar integração`}
              >
                {isStoreConnected('magalu') && (
                  <span className="cc-card-connection" aria-hidden="true">
                    <span className="cc-connected-label">Conectado</span>
                    <span className="cc-connected-dot"></span>
                  </span>
                )}
                <span className="cc-store-head">
                  <span className="cc-mark">
                    <BrandLogo brand="magalu" variant="integracao" size={38} containerSize={50} />
                  </span>
                  <span>
                    <strong className="cc-store-name">Magalu</strong>
                    <small>Magazine Você</small>
                  </span>
                </span>
                <span className="cc-store-description">Conecte sua vitrine do Magazine Você ao Radar.</span>
                <span className="cc-store-corner" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </span>
              </button>
            </div>

            <p className="rp-sub" style={{ marginTop: 22, fontSize: 11, color: '#94a3ad' }}>
              Cada loja tem seu próprio processo de conexão. A validação do link acontece antes da publicação.
            </p>
          </div>
        )}
      </div>

      {/* Modal Aprovado: Tutorial de Instalação da Extensão */}
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

      {/* Modal Aprovado: Mercado Livre - Escolha entre dois métodos (#cc-method-dialog) */}
      {showMLMethodModal && (
        <div
          className="cc-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cc-method-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowMLMethodModal(false);
          }}
        >
          <div className="cc-method-dialog">
            <div className="cc-method-brand">
              <span className="cc-mark">
                <BrandLogo brand="mercadolivre" variant="integracao" size={38} containerSize={50} />
              </span>
              <div>
                <h2>Mercado Livre</h2>
                {isStoreConnected('mercadolivre') && (
                  <span className="cc-modal-status">
                    <span className="cc-connected-dot"></span>
                    Conectado
                  </span>
                )}
              </div>
              <button
                type="button"
                className="cc-close-btn"
                aria-label="Fechar opções do Mercado Livre"
                onClick={() => setShowMLMethodModal(false)}
              >
                ✕
              </button>
            </div>

            <h3 id="cc-method-title">Como deseja configurar?</h3>
            <p className="cc-sub">Escolha como vincular sua conta de afiliado ao Radar.</p>

            <div className="cc-method-options">
              {/* Opção 1: Pela extensão */}
              <button
                type="button"
                className="cc-method-option"
                onClick={() => {
                  setShowMLMethodModal(false);
                  setShowTutorialModal(true);
                }}
              >
                <span className="cc-method-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19.439 7.85c0-2.68-2.17-4.85-4.85-4.85-1.57 0-2.97.74-3.87 1.89a4.85 4.85 0 0 0-3.87-1.89C4.17 3 2 5.17 2 7.85c0 1.57.74 2.97 1.89 3.87A4.85 4.85 0 0 0 2 15.59c0 2.68 2.17 4.85 4.85 4.85 1.57 0 2.97-.74 3.87-1.89 1.57 0 2.97.74 3.87 1.89 2.68 0 4.85-2.17 4.85-4.85 0-1.57-.74-2.97-1.89-3.87 1.15-.9 1.89-2.3 1.89-3.87z"></path>
                  </svg>
                </span>
                <span>
                  <strong>Pela extensão</strong>
                  <small>Use sua conta aberta neste navegador.</small>
                </span>
                <span className="cc-option-arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </span>
              </button>

              {/* Opção 2: Configurar manualmente */}
              <button
                type="button"
                className="cc-method-option"
                onClick={() => {
                  setShowMLMethodModal(false);
                  handleOpenStoreConfig('mercadolivre');
                }}
              >
                <span className="cc-method-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="4" y1="21" x2="4" y2="14"></line>
                    <line x1="4" y1="10" x2="4" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12" y2="3"></line>
                    <line x1="20" y1="21" x2="20" y2="16"></line>
                    <line x1="20" y1="12" x2="20" y2="3"></line>
                    <line x1="1" y1="14" x2="7" y2="14"></line>
                    <line x1="9" y1="8" x2="15" y2="8"></line>
                    <line x1="17" y1="16" x2="23" y2="16"></line>
                  </svg>
                </span>
                <span>
                  <strong>Configurar manualmente</strong>
                  <small>Informe seus dados de afiliado no painel.</small>
                </span>
                <span className="cc-option-arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </span>
              </button>
            </div>

            <div className="cc-method-footer">
              <button
                type="button"
                className="rp-btn rp-quiet"
                onClick={() => {
                  setShowMLMethodModal(false);
                  setShowTutorialModal(true);
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                Como instalar a extensão
              </button>

              {isStoreConnected('mercadolivre') && (
                <button
                  type="button"
                  className="rp-btn rp-quiet cc-disconnect"
                  onClick={() => handleDisconnectStore('mercadolivre')}
                  disabled={configLoading}
                >
                  {configLoading ? 'Desconectando...' : 'Desconectar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Aprovado: Configuração Direta das Lojas (#cc-config-dialog) */}
      {selectedStoreConfig && (
        <div
          className="cc-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cc-config-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !configLoading) setSelectedStoreConfig(null);
          }}
        >
          <div className="cc-config-dialog">
            <div className="cc-config-head">
              <span className="cc-mark">
                <BrandLogo brand={selectedStoreConfig} variant="integracao" size={38} containerSize={50} />
              </span>
              <div>
                <span className="cc-kicker" id="cc-config-eyebrow">
                  {selectedStoreConfig === 'amazon' ? 'PROGRAMA DE ASSOCIADOS' : 'CONTA DE AFILIADO'}
                </span>
                <h2 id="cc-config-title">
                  {selectedStoreConfig === 'shopee' && 'Conectar Shopee'}
                  {selectedStoreConfig === 'amazon' && 'Conectar Amazon'}
                  {selectedStoreConfig === 'netshoes' && 'Conectar Netshoes'}
                  {selectedStoreConfig === 'mercadolivre' && 'Configurar Mercado Livre'}
                  {selectedStoreConfig === 'magalu' && 'Conectar Magalu'}
                </h2>
              </div>
              <button
                type="button"
                className="cc-close-btn"
                aria-label="Fechar configuração"
                onClick={() => setSelectedStoreConfig(null)}
                disabled={configLoading}
              >
                ✕
              </button>
            </div>

            <p className="cc-config-description">
              {selectedStoreConfig === 'shopee' &&
                'A integração da Shopee utiliza a Open API oficial de afiliados com assinatura segura por App ID e App Secret.'}
              {selectedStoreConfig === 'amazon' &&
                'Insira o seu ID de rastreamento (Tag de associado) cadastrado no portal Amazon Associates Brasil.'}
              {selectedStoreConfig === 'netshoes' &&
                'A integração da Netshoes utiliza a rede Rakuten Advertising com seu ID de anunciante e Token da aplicação.'}
              {selectedStoreConfig === 'mercadolivre' &&
                'Configure sua identificação manual de afiliado para vincular seus links de divulgação do Mercado Livre.'}
              {selectedStoreConfig === 'magalu' &&
                'Informe o nome ou identificador da sua vitrine de divulgador no Magazine Você.'}
            </p>

            <div className="cc-config-fields">
              {/* Campos Shopee */}
              {selectedStoreConfig === 'shopee' && (
                <>
                  <label>
                    App ID
                    <input
                      type="text"
                      placeholder="Identificador da sua aplicação"
                      value={configForm.appId}
                      onChange={(e) => setConfigForm({ ...configForm, appId: e.target.value })}
                      autoFocus
                    />
                    <small>Disponível na área de API do programa de afiliados Shopee.</small>
                  </label>
                  <label>
                    App Secret
                    <input
                      type="password"
                      placeholder="Chave secreta da integração"
                      value={configForm.appSecret}
                      onChange={(e) => setConfigForm({ ...configForm, appSecret: e.target.value })}
                    />
                    <small>A chave da API é diferente da senha da sua conta.</small>
                  </label>
                </>
              )}

              {/* Campos Amazon */}
              {selectedStoreConfig === 'amazon' && (
                <>
                  <label>
                    ID de rastreamento
                    <input
                      type="text"
                      placeholder="ID vinculado à sua conta de associado (ex: suatag-20)"
                      value={configForm.affiliateTag}
                      onChange={(e) => setConfigForm({ ...configForm, affiliateTag: e.target.value })}
                      autoFocus
                    />
                    <small>Use o identificador com o qual deseja gerar seus links.</small>
                  </label>
                  <label>
                    Loja Amazon
                    <input
                      type="text"
                      placeholder="Brasil · amazon.com.br"
                      defaultValue="Brasil · amazon.com.br"
                      readOnly
                      style={{ opacity: 0.85 }}
                    />
                  </label>
                </>
              )}

              {/* Campos Netshoes */}
              {selectedStoreConfig === 'netshoes' && (
                <>
                  <label>
                    ID do anunciante
                    <input
                      type="text"
                      placeholder="Identificador da Netshoes no seu programa"
                      value={configForm.appId}
                      onChange={(e) => setConfigForm({ ...configForm, appId: e.target.value })}
                      autoFocus
                    />
                    <small>Utilize o ID aprovado para a sua integração.</small>
                  </label>
                  <label>
                    Token de acesso Rakuten
                    <input
                      type="password"
                      placeholder="Token da sua aplicação"
                      value={configForm.userToken}
                      onChange={(e) => setConfigForm({ ...configForm, userToken: e.target.value })}
                    />
                    <small>Usado pela integração da API de deep links da Rakuten.</small>
                  </label>
                </>
              )}

              {/* Campos Mercado Livre Manual */}
              {selectedStoreConfig === 'mercadolivre' && (
                <>
                  <label>
                    ID da ferramenta
                    <input
                      type="text"
                      placeholder="Identificador da sua ferramenta de afiliado"
                      value={configForm.appId}
                      onChange={(e) => setConfigForm({ ...configForm, appId: e.target.value })}
                      autoFocus
                    />
                  </label>
                  <label>
                    Tag de rastreio
                    <input
                      type="text"
                      placeholder="Tag da sua conta de afiliado"
                      value={configForm.affiliateTag}
                      onChange={(e) => setConfigForm({ ...configForm, affiliateTag: e.target.value })}
                    />
                    <small>Os dados serão conferidos no fluxo de conversão.</small>
                  </label>
                </>
              )}

              {/* Campos Magalu */}
              {selectedStoreConfig === 'magalu' && (
                <label>
                  Nome ou código da sua loja
                  <input
                    type="text"
                    placeholder="Nome da sua loja no Magazine Você (ex: sualoja)"
                    value={configForm.affiliateTag}
                    onChange={(e) => setConfigForm({ ...configForm, affiliateTag: e.target.value })}
                    autoFocus
                  />
                  <small>Utilizado para compor o link de afiliado oficial do Magazine Você.</small>
                </label>
              )}
            </div>

            {/* Dica recolhível: Onde encontro esses dados? */}
            <details className="cc-config-help">
              <summary>Onde encontro esses dados?</summary>
              {selectedStoreConfig === 'shopee' && (
                <>
                  <p>
                    Acesse o console oficial de afiliados da Shopee no menu <strong>Open API</strong>. Lá você poderá visualizar ou gerar seu App ID e App Secret.
                  </p>
                  <a href="https://affiliate.shopee.com.br/open_api" target="_blank" rel="noopener noreferrer">
                    <span>Abrir portal de afiliados</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="7" y1="17" x2="17" y2="7"></line>
                      <polyline points="7 7 17 7 17 17"></polyline>
                    </svg>
                  </a>
                </>
              )}

              {selectedStoreConfig === 'amazon' && (
                <>
                  <p>
                    Faça login no portal do Programa de Associados da Amazon Brasil. No canto superior direito da tela, você encontra o seu ID de rastreamento ativo.
                  </p>
                  <a href="https://associados.amazon.com.br" target="_blank" rel="noopener noreferrer">
                    <span>Abrir Amazon Associates</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="7" y1="17" x2="17" y2="7"></line>
                      <polyline points="7 7 17 7 17 17"></polyline>
                    </svg>
                  </a>
                </>
              )}

              {selectedStoreConfig === 'netshoes' && (
                <>
                  <p>
                    No painel da Rakuten Advertising, acesse o <em>Developer Portal</em> para gerar seu Access Token e consultar o ID do anunciante da Netshoes.
                  </p>
                  <a href="https://rakutenadvertising.com" target="_blank" rel="noopener noreferrer">
                    <span>Abrir Rakuten Advertising</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="7" y1="17" x2="17" y2="7"></line>
                      <polyline points="7 7 17 7 17 17"></polyline>
                    </svg>
                  </a>
                </>
              )}

              {selectedStoreConfig === 'mercadolivre' && (
                <>
                  <p>
                    No portal de afiliados do Mercado Livre você localiza a sua tag de rastreio e os dados da sua aplicação de afiliado.
                  </p>
                  <a href="https://www.mercadolivre.com.br/afiliados" target="_blank" rel="noopener noreferrer">
                    <span>Abrir Afiliados Mercado Livre</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="7" y1="17" x2="17" y2="7"></line>
                      <polyline points="7 7 17 7 17 17"></polyline>
                    </svg>
                  </a>
                </>
              )}

              {selectedStoreConfig === 'magalu' && (
                <>
                  <p>
                    No seu painel do Magazine Você, copie o nome público ou identificador da sua vitrine de divulgador.
                  </p>
                  <a href="https://www.magazinevoce.com.br" target="_blank" rel="noopener noreferrer">
                    <span>Abrir Magazine Você</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="7" y1="17" x2="17" y2="7"></line>
                      <polyline points="7 7 17 7 17 17"></polyline>
                    </svg>
                  </a>
                </>
              )}
            </details>

            {/* Aviso de privacidade */}
            <p className="cc-config-privacy">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              Você não precisa informar a senha da sua conta.
            </p>

            {/* Ações */}
            <div className="cc-config-actions">
              <button
                type="button"
                className="rp-btn rp-quiet"
                onClick={() => setSelectedStoreConfig(null)}
                disabled={configLoading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rp-btn"
                onClick={handleTestIntegration}
                disabled={configLoading}
              >
                {configLoading ? 'Testando...' : 'Testar integração'}
              </button>
              <button
                type="button"
                className="rp-btn rp-primary"
                onClick={handleSaveIntegration}
                disabled={configLoading}
              >
                {configLoading ? 'Salvando...' : 'Salvar integração'}
              </button>
            </div>

            {/* Feedback inline */}
            {configFeedback && (
              <div
                className={`cc-config-feedback ${configFeedback.type}`}
                role="status"
                aria-live="polite"
              >
                {configFeedback.message}
              </div>
            )}
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
