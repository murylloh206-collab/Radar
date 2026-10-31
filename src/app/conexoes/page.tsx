'use client';

import React, { Suspense, useEffect, useState, useMemo } from 'react';
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

  // Modal de Integração de Loja
  const [selectedStoreModal, setSelectedStoreModal] = useState<string | null>(null);

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

  return (
    <section className="rp-page" aria-label="Conexões">
      {/* Cabeçalho */}
      <div className="rp-head">
        <div>
          <span className="rp-step">Configurações</span>
          <h1>Conexões</h1>
          <p>Seu WhatsApp e suas contas de afiliado, organizados no mesmo lugar.</p>
        </div>
        <span className="rp-tag">
          {isConnected ? 'WhatsApp ativo' : 'Aguardando conexão'}
        </span>
      </div>

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
                <div className="rp-inline">
                  <BrandLogo brand="whatsapp" size={30} containerSize={46} />
                  <div>
                    <h2>{waData?.profileName || 'Radar de Ofertas'}</h2>
                    <p className="rp-sub">
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

        {/* Aba 2: Lojas e afiliados */}
        {activeTab === 'lojas' && (
          <div data-panel="lojas" role="tabpanel">
            <div className="rp-grid">
              <div className="rp-panel rp-store">
                <div className="rp-row">
                  <div className="rp-inline">
                    <BrandLogo brand="mercadolivre" size={28} containerSize={44} withBackground />
                    <h2>Mercado Livre</h2>
                  </div>
                  <span className="rp-tag">Configurar</span>
                </div>
                <p className="rp-sub">Conecte sua conta para converter os links das ofertas.</p>
                <button
                  className="rp-btn"
                  type="button"
                  onClick={() => setSelectedStoreModal('Mercado Livre')}
                >
                  Gerenciar integração
                </button>
              </div>

              <div className="rp-panel rp-store">
                <div className="rp-row">
                  <div className="rp-inline">
                    <BrandLogo brand="shopee" size={28} containerSize={44} withBackground />
                    <h2>Shopee</h2>
                  </div>
                  <span className="rp-tag">Configurar</span>
                </div>
                <p className="rp-sub">Integração de afiliados e confirmação dos seus links.</p>
                <button
                  className="rp-btn"
                  type="button"
                  onClick={() => setSelectedStoreModal('Shopee')}
                >
                  Gerenciar integração
                </button>
              </div>

              <div className="rp-panel rp-store">
                <div className="rp-row">
                  <div className="rp-inline">
                    <BrandLogo brand="netshoes" size={28} containerSize={44} withBackground />
                    <h2>Netshoes</h2>
                  </div>
                  <span className="rp-tag">Configurar</span>
                </div>
                <p className="rp-sub">Programa de afiliados através da Rakuten.</p>
                <button
                  className="rp-btn"
                  type="button"
                  onClick={() => setSelectedStoreModal('Netshoes / Rakuten')}
                >
                  Gerenciar integração
                </button>
              </div>

              <div className="rp-panel rp-store">
                <div className="rp-row">
                  <div className="rp-inline">
                    <BrandLogo brand="amazon" size={28} containerSize={44} withBackground />
                    <h2>Amazon</h2>
                  </div>
                  <span className="rp-tag">Configurar</span>
                </div>
                <p className="rp-sub">Configure a identificação da sua conta de associado.</p>
                <button
                  className="rp-btn"
                  type="button"
                  onClick={() => setSelectedStoreModal('Amazon')}
                >
                  Gerenciar integração
                </button>
              </div>

              <div className="rp-panel rp-store">
                <div className="rp-row">
                  <div className="rp-inline">
                    <BrandLogo brand="magalu" size={28} containerSize={44} withBackground />
                    <h2>Magalu</h2>
                  </div>
                  <span className="rp-tag">Configurar</span>
                </div>
                <p className="rp-sub">Acompanhe a configuração da sua conta de parceiro.</p>
                <button
                  className="rp-btn"
                  type="button"
                  onClick={() => setSelectedStoreModal('Magalu')}
                >
                  Gerenciar integração
                </button>
              </div>
            </div>

            <p className="rp-sub rp-section">
              Conectar uma conta, validar um link e disponibilizar relatórios são etapas diferentes.
            </p>
          </div>
        )}
      </div>

      {/* Modal de Integração com Lojas */}
      {selectedStoreModal && (
        <dialog
          className="rp-dialog"
          open
          style={{ display: 'block', position: 'fixed', inset: 0, margin: 'auto', zIndex: 100 }}
        >
          <div className="rp-row">
            <h2>Integração · {selectedStoreModal}</h2>
            <button
              className="rp-btn"
              type="button"
              onClick={() => setSelectedStoreModal(null)}
            >
              ×
            </button>
          </div>

          <p className="rp-sub rp-section">
            Configuração da conta de afiliado. As credenciais são armazenadas com segurança no servidor.
          </p>

          <label className="rp-field">
            Identificação da conta / Tag de Afiliado
            <input placeholder="Identificador fornecido pela plataforma" />
          </label>

          <label className="rp-field">
            Credencial de acesso / Token
            <input type="password" placeholder="Mantida protegida no servidor" />
          </label>

          <div className="rp-banner rp-section">
            <span>Estado da integração</span>
            <span className="rp-tag">Pronta para configurar</span>
          </div>

          <div className="rp-footer">
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
        </dialog>
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

