'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Unlink,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import type { WhatsAppConnection, WhatsAppGroup } from '@/lib/types';
import './whatsapp-groups.css';

function dateLabel(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Ainda não verificado';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function phoneLabel(value?: string) {
  if (!value) return 'Número não informado';
  const digits = value.replace(/\D/g, '');
  if (!digits) return 'Número não informado';
  if (digits.startsWith('55') && digits.length === 13) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return `+${digits}`;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function WhatsAppAvatar({
  resource,
  ownerJid,
  accountKey,
  name,
  personal = false,
  directUrl,
}: {
  resource?: string;
  ownerJid?: string;
  accountKey?: string;
  name: string;
  personal?: boolean;
  directUrl?: string;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const [picture, setPicture] = useState<string | null>(directUrl || null);
  const [photoError, setPhotoError] = useState<string | undefined>();

  useEffect(() => {
    if (directUrl) {
      setPicture(directUrl);
      return;
    }
    if (!resource || !ownerJid) return;

    const controller = new AbortController();
    let active = true;
    let started = false;
    setPicture(null);
    setPhotoError(undefined);

    async function load() {
      if (started) return;
      started = true;
      try {
        const response = await fetch(`${resource}&ownerJid=${encodeURIComponent(ownerJid || '')}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) {
          if (active) setPhotoError(typeof data.error === 'string' ? data.error : 'Não foi possível consultar a foto.');
          return;
        }
        if (active && data.ok && typeof data.pictureUrl === 'string') setPicture(data.pictureUrl);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }

    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                void load();
                observer?.disconnect();
              }
            },
            { rootMargin: '120px' }
          );

    if (observer && element.current) observer.observe(element.current);
    else void load();

    return () => {
      active = false;
      controller.abort();
      observer?.disconnect();
    };
  }, [resource, ownerJid, accountKey, directUrl]);

  return (
    <span ref={element} title={photoError} className={`wa-avatar ${personal ? 'wa-avatar--account' : ''}`}>
      {picture ? (
        <img
          src={picture}
          alt={`Foto de ${name}`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setPicture(null)}
        />
      ) : personal ? (
        <UserRound size={24} aria-hidden="true" />
      ) : (
        <Users size={21} aria-hidden="true" />
      )}
    </span>
  );
}

export default function WhatsAppGroupsPanel() {
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [refreshingGroups, setRefreshingGroups] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(25);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  // Estados do Modal "Adicionar WhatsApp"
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalStep, setModalStep] = useState<'label' | 'preparing' | 'qrcode' | 'expired' | 'connected' | 'error'>('label');
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);
  const [canForceLocal, setCanForceLocal] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [creatingConnection, setCreatingConnection] = useState(false);
  const [activeNewConn, setActiveNewConn] = useState<WhatsAppConnection | null>(null);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [qrCodeRaw, setQrCodeRaw] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Estados de confirmação para Desconectar / Remover
  const [confirmAction, setConfirmAction] = useState<{
    type: 'disconnect' | 'delete';
    connection: WhatsAppConnection;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const mounted = useRef(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Carregar Conexões e Grupos do Cache/Banco Imediatamente
  const loadInitialData = useCallback(async () => {
    try {
      setErrorMessage(null);
      const resConn = await fetch('/api/whatsapp/connections', { cache: 'no-store' });
      const dataConn = await resConn.json().catch(() => ({}));

      if (dataConn.ok && Array.isArray(dataConn.connections)) {
        setConnections(dataConn.connections);
        // Selecionar conexão padrão ou primeira
        const defaultConn = dataConn.connections.find((c: WhatsAppConnection) => c.isDefault) || dataConn.connections[0];
        const activeId = defaultConn ? defaultConn.id : '';
        setSelectedConnectionId(activeId);

        // Carregar grupos imediatamente do banco para essa conexão
        const resGroups = await fetch(`/api/whatsapp/groups?connectionId=${encodeURIComponent(activeId)}`, {
          cache: 'no-store',
        });
        const dataGroups = await resGroups.json().catch(() => ({}));
        if (dataGroups.ok && Array.isArray(dataGroups.groups)) {
          setGroups(dataGroups.groups);
          setSyncedAt(dataGroups.cachedAt || defaultConn?.lastPingAt || null);
        }
      }
    } catch {
      setErrorMessage('Não foi possível carregar as conexões de WhatsApp.');
    } finally {
      if (mounted.current) {
        setLoadingInitial(false);
      }
    }
  }, []);

  // 2. Atualização Leve em Segundo Plano dos Grupos
  const refreshCurrentGroups = useCallback(async (connectionIdToSync?: string) => {
    const targetId = connectionIdToSync || selectedConnectionId;
    if (!targetId) return;

    setRefreshingGroups(true);
    setGroupsError(null);

    try {
      const response = await fetch('/api/whatsapp/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: targetId }),
      });
      const data = await response.json().catch(() => ({}));

      if (mounted.current) {
        if (data.ok && Array.isArray(data.groups)) {
          setGroups(data.groups);
          setSyncedAt(data.cachedAt || new Date().toISOString());
          // Atualiza contagem nos cards de conexões
          setConnections((prev) =>
            prev.map((c) =>
              c.id === targetId
                ? { ...c, groupsCount: data.groups.length, lastPingAt: data.cachedAt || new Date().toISOString() }
                : c
            )
          );
        } else if (data.groups) {
          // Se retornou grupos em cache com aviso, preserva
          setGroups(data.groups);
          if (data.warning) setGroupsError(data.warning);
        } else {
          setGroupsError(data.error || 'Aviso: sincronização em segundo plano não pôde atualizar no momento.');
        }
      }
    } catch {
      if (mounted.current) {
        setGroupsError('Falha temporária ao sincronizar grupos em segundo plano.');
      }
    } finally {
      if (mounted.current) {
        setRefreshingGroups(false);
      }
    }
  }, [selectedConnectionId]);

  useEffect(() => {
    mounted.current = true;
    void loadInitialData();
    return () => {
      mounted.current = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [loadInitialData]);

  // Ao trocar de conexão no card
  const handleSelectConnection = (connId: string) => {
    setSelectedConnectionId(connId);
    setSearch('');
    setLimit(25);
    setGroupsError(null);

    // Carrega instantaneamente os grupos já salvos dessa conexão
    fetch(`/api/whatsapp/groups?connectionId=${encodeURIComponent(connId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.groups)) {
          setGroups(data.groups);
          setSyncedAt(data.cachedAt || null);
        }
      })
      .catch(() => {});
  };

  // Abrir Modal de Adicionar WhatsApp
  const handleOpenAddModal = () => {
    setNewLabel(`WhatsApp ${connections.length + 1}`);
    setModalStep('label');
    setModalError(null);
    setQrCodeBase64(null);
    setQrCodeRaw(null);
    setActiveNewConn(null);
    setShowAddModal(true);
  };

  // Passo 1 -> Passo 2: Criar instância e exibir QR Code
  const handleCreateInstanceAndGetQR = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newLabel.trim()) return;

    setCreatingConnection(true);
    setModalStep('preparing');
    setModalError(null);
    setQrCodeBase64(null);
    setQrCodeRaw(null);

    try {
      const res = await fetch('/api/whatsapp/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', label: newLabel.trim() }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setModalError(data.error || 'Não foi possível gerar a instância na Evolution API.');
        setModalStep('error');
        return;
      }

      const conn = data.connection || { id: data.connectionId, label: newLabel.trim() };
      setActiveNewConn(conn);

      const qr = data.qrcode?.base64 || data.qrCodeBase64;
      if (qr) {
        setQrCodeBase64(qr);
        setQrCodeRaw(data.qrcode?.code || null);
        setModalStep('qrcode');
      } else {
        setModalStep('qrcode');
      }

      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(() => {
        pollPairingStatus(conn.id);
      }, 2500);
    } catch {
      setModalError('Falha de conexão ao criar a instância. Tente novamente.');
      setModalStep('error');
    } finally {
      setCreatingConnection(false);
    }
  };

  // Pooling de Pareamento
  const pollPairingStatus = async (connId: string) => {
    try {
      const res = await fetch('/api/whatsapp/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'poll_qr', connectionId: connId }),
      });
      const data = await res.json();

      if (data.ok && (data.connected || data.status === 'connected')) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        const finalConn = data.connection || activeNewConn;
        if (finalConn) setActiveNewConn(finalConn);
        setModalStep('connected');

        // Recarregar lista de conexões e sincronizar grupos
        void loadInitialData();
        setSelectedConnectionId(connId);
      } else if (data.qrcode?.base64 || data.qrCodeBase64) {
        const freshQr = data.qrcode?.base64 || data.qrCodeBase64;
        if (freshQr) {
          setQrCodeBase64(freshQr);
          setQrCodeRaw(data.qrcode?.code || null);
        }
      }
    } catch {
      // Ignora erro passageiro de poll
    }
  };

  // Conectar / Reconectar Conta Existente (Sem criar instâncias duplicadas)
  const handleReconnectConnection = async (conn: WhatsAppConnection) => {
    setActiveNewConn(conn);
    setNewLabel(conn.label);
    setModalStep('preparing');
    setModalError(null);
    setQrCodeBase64(null);
    setQrCodeRaw(null);
    setShowAddModal(true);

    try {
      const res = await fetch('/api/whatsapp/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reconnect', connectionId: conn.id }),
      });
      const data = await res.json();

      if (data.ok && (data.alreadyConnected || data.connected || data.status === 'connected')) {
        setActiveNewConn(data.connection || conn);
        setModalStep('connected');
        void loadInitialData();
        return;
      }

      const qr = data.qrcode?.base64 || data.qrCodeBase64;
      if (data.ok && qr) {
        setQrCodeBase64(qr);
        setQrCodeRaw(data.qrcode?.code || null);
        setModalStep('qrcode');

        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = setInterval(() => {
          pollPairingStatus(conn.id);
        }, 2500);
      } else {
        setModalError(data.error || 'Não foi possível gerar novo QR Code para esta conexão.');
        setModalStep('error');
      }
    } catch {
      setModalError('Erro ao comunicar com o servidor do WhatsApp.');
      setModalStep('error');
    }
  };

  // Executar Desconexão ou Remoção confirmada
  const handleConfirmAction = async (forceLocalOnly = false) => {
    if (!confirmAction) return;
    setActionLoading(true);
    setDeleteWarning(null);

    try {
      const actionType = confirmAction.type === 'disconnect' ? 'disconnect' : 'delete';
      const res = await fetch('/api/whatsapp/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionType,
          connectionId: confirmAction.connection.id,
          forceLocalOnly,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setConfirmAction(null);
        setCanForceLocal(false);
        setDeleteWarning(null);
        await loadInitialData();
      } else if (data.canForceLocal) {
        setCanForceLocal(true);
        setDeleteWarning(data.error || 'O gateway remoto está indisponível.');
      } else {
        alert(data.error || 'Falha ao executar ação.');
      }
    } catch {
      alert('Erro de comunicação com o servidor.');
    } finally {
      setActionLoading(false);
    }
  };

  // Definir Conexão Padrão
  const handleSetDefault = async (connId: string) => {
    try {
      await fetch('/api/whatsapp/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_default', connectionId: connId }),
      });
      setConnections((prev) =>
        prev.map((c) => ({
          ...c,
          isDefault: c.id === connId,
        }))
      );
    } catch {}
  };

  const selectedConn = useMemo(
    () => connections.find((c) => c.id === selectedConnectionId) || connections[0],
    [connections, selectedConnectionId]
  );

  const filteredGroups = useMemo(
    () => groups.filter((g) => normalize(g.name).includes(normalize(search))),
    [groups, search]
  );

  const accountKey = `${selectedConn?.ownerJid || ''}:${syncedAt || ''}:${selectedConn?.lastPingAt || ''}`;
  const isSelectedConnected = selectedConn?.status === 'connected';

  return (
    <div className="wa-connections">
      {/* Cabeçalho com Título e Botão Superior Direito "Adicionar WhatsApp" */}
      <div className="wa-header-row">
        <div>
          <h1>WhatsApp e grupos</h1>
          <p>Conecte seus números de WhatsApp para monitorar fontes de ofertas e enviar publicações.</p>
        </div>
        <button
          type="button"
          className="wa-btn-primary"
          onClick={handleOpenAddModal}
          aria-label="Adicionar WhatsApp"
        >
          <Plus size={16} aria-hidden="true" />
          Adicionar WhatsApp
        </button>
      </div>

      {errorMessage && (
        <p className="wa-warning" role="alert">
          <CircleAlert size={15} aria-hidden="true" />
          {errorMessage}
        </p>
      )}

      {/* Grid com Cards das Contas Conectadas */}
      <section aria-label="Contas WhatsApp configuradas">
        <div className="wa-accounts-grid">
          {connections.map((conn) => {
            const isConnSelected = conn.id === selectedConnectionId;
            const isConnected = conn.status === 'connected';

            return (
              <div
                key={conn.id}
                role="button"
                tabIndex={0}
                className={`wa-account-card ${isConnSelected ? 'wa-account-card--active' : ''}`}
                onClick={() => handleSelectConnection(conn.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleSelectConnection(conn.id);
                }}
              >
                <div>
                  <div className="wa-account-card-header">
                    <div className="wa-account-card-info">
                      <WhatsAppAvatar
                        ownerJid={conn.ownerJid}
                        accountKey={`${conn.ownerJid}:${conn.lastPingAt}`}
                        name={conn.label}
                        personal
                        directUrl={conn.profilePicUrl}
                      />
                      <div className="wa-account-card-details">
                        <span className="wa-account-card-label">
                          {conn.label}
                          {conn.isDefault && <span className="wa-badge-default">Padrão</span>}
                        </span>
                        <div className="wa-account-card-number">{phoneLabel(conn.phoneNumber)}</div>
                        <div className="wa-account-card-profile">
                          {conn.profileName || 'Perfil WhatsApp'}
                        </div>
                      </div>
                    </div>
                    <span className={`wa-status ${isConnected ? 'wa-status--connected' : ''}`}>
                      <span aria-hidden="true" />
                      {isConnected ? 'Conectado' : 'Desconectado'}
                    </span>
                  </div>

                  <div className="wa-account-card-meta">
                    <span>
                      <Users size={13} style={{ display: 'inline', marginRight: 4 }} />
                      {conn.groupsCount ?? 0} grupos sincronizados
                    </span>
                    <span>{conn.lastPingAt ? dateLabel(conn.lastPingAt) : 'Sem verificação'}</span>
                  </div>
                </div>

                {/* Ações da Conta */}
                <div className="wa-account-card-actions" onClick={(e) => e.stopPropagation()}>
                  {!conn.isDefault && (
                    <button
                      type="button"
                      className="wa-btn-sm"
                      onClick={() => handleSetDefault(conn.id)}
                      title="Tornar este WhatsApp o padrão do sistema"
                    >
                      Tornar padrão
                    </button>
                  )}
                  {!isConnected ? (
                    <button
                      type="button"
                      className="wa-btn-sm"
                      onClick={() => handleReconnectConnection(conn)}
                      style={{ color: '#39bee6' }}
                    >
                      <QrCode size={13} style={{ marginRight: 4, display: 'inline' }} />
                      Conectar WhatsApp
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="wa-btn-sm"
                      onClick={() => setConfirmAction({ type: 'disconnect', connection: conn })}
                      title="Desconectar sessão sem apagar os grupos"
                    >
                      <Unlink size={13} style={{ marginRight: 4, display: 'inline' }} />
                      Desconectar
                    </button>
                  )}
                  <button
                    type="button"
                    className="wa-btn-sm"
                    onClick={() => setConfirmAction({ type: 'delete', connection: conn })}
                    title="Excluir conta permanentemente"
                    style={{ color: '#f87171' }}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Seção dos Grupos da Conexão Selecionada */}
      {selectedConn && (
        <section className="wa-groups" aria-labelledby="wa-groups-heading">
          <header className="wa-groups-header">
            <div>
              <div className="wa-heading-row">
                <h2 id="wa-groups-heading">
                  Grupos de {selectedConn.label}
                </h2>
                {syncedAt && <span className="wa-count">{groups.length}</span>}
                {refreshingGroups && (
                  <span className="wa-sync-pill">
                    <RefreshCw size={12} className="wa-spin" />
                    Atualizando em segundo plano...
                  </span>
                )}
              </div>
              <p>
                {phoneLabel(selectedConn.phoneNumber)} • Identificação oficial e permissões confirmadas.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                className="wa-button"
                onClick={() => void refreshCurrentGroups()}
                disabled={refreshingGroups}
                title="Sincronizar grupos da conta no WhatsApp"
              >
                <RefreshCw size={14} className={refreshingGroups ? 'wa-spin' : ''} aria-hidden="true" />
                {refreshingGroups ? 'Atualizando…' : 'Sincronizar grupos'}
              </button>

              <label className="wa-search">
                <Search size={17} aria-hidden="true" />
                <span className="wa-sr-only">Buscar grupo pelo nome</span>
                <input
                  type="search"
                  placeholder="Buscar grupo"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setLimit(25);
                  }}
                />
              </label>
            </div>
          </header>

          {groupsError && (
            <p className="wa-warning" role="status">
              <CircleAlert size={15} aria-hidden="true" />
              {groupsError}
            </p>
          )}

          {loadingInitial ? (
            <div className="wa-empty" role="status">
              <RefreshCw size={22} className="wa-spin" aria-hidden="true" />
              <h3>Carregando grupos salvos...</h3>
              <p>Consultando a base de dados do Radar.</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="wa-empty">
              <Users size={25} aria-hidden="true" />
              <h3>{search ? 'Nenhum grupo com esse nome' : 'Nenhum grupo sincronizado ainda'}</h3>
              <p>
                {search
                  ? 'Tente outro termo para encontrar o grupo.'
                  : 'Clique em "Sincronizar grupos" para carregar os grupos deste WhatsApp.'}
              </p>
            </div>
          ) : (
            <ul className="wa-group-list">
              {filteredGroups.slice(0, limit).map((group) => (
                <li key={`${group.connectionId || 'd'}_${group.groupJid}`} className="wa-group-row">
                  <div className="wa-group-identity">
                    <WhatsAppAvatar
                      resource={`/api/whatsapp/groups/photo?groupJid=${encodeURIComponent(group.groupJid)}`}
                      ownerJid={selectedConn.ownerJid || ''}
                      accountKey={accountKey}
                      name={group.name}
                    />
                    <div className="wa-group-copy">
                      <h3>{group.name}</h3>
                      <div className="wa-group-meta">
                        {group.participantCount > 0 && <span>{group.participantCount} participantes</span>}
                        <span>
                          {group.permissionStatus === 'verified_admin'
                            ? 'Você administra'
                            : group.permissionStatus === 'restricted_readonly'
                            ? 'Somente leitura'
                            : group.permissionStatus === 'verified_member'
                            ? 'Membro'
                            : 'Permissão verificada'}
                        </span>
                        {group.isOrigin && <span className="wa-role">Origem</span>}
                        {group.isDestination && <span className="wa-role">Destino</span>}
                      </div>
                      <details className="wa-group-details">
                        <summary>Detalhes do grupo</summary>
                        <code>{group.groupJid}</code>
                      </details>
                    </div>
                  </div>
                  <Link
                    className="wa-group-link"
                    href={`/copiador?connectionId=${encodeURIComponent(selectedConn.id)}&originJid=${encodeURIComponent(group.groupJid)}`}
                  >
                    Usar no Copiador
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {filteredGroups.length > limit && (
            <div className="wa-more">
              <button
                type="button"
                className="wa-button"
                onClick={() => setLimit((value) => value + 25)}
              >
                Mostrar mais grupos
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>
          )}

          {syncedAt && (
            <footer className="wa-list-footer">
              <Check size={13} aria-hidden="true" />
              Última sincronização confirmada: {dateLabel(syncedAt)}
            </footer>
          )}
        </section>
      )}

      {/* Diagnóstico Técnico da Conexão Ativa */}
      {selectedConn && (
        <details className="wa-diagnostics">
          <summary>Detalhes avançados da conexão selecionada</summary>
          <dl>
            <dt>ID Conexão</dt>
            <dd><code>{selectedConn.id}</code></dd>
            <dt>Instância</dt>
            <dd><code>{selectedConn.instanceName}</code></dd>
            <dt>Identificador (JID)</dt>
            <dd><code>{selectedConn.ownerJid || 'Não pareado'}</code></dd>
            <dt>Último Ping</dt>
            <dd>{dateLabel(selectedConn.lastPingAt)}</dd>
          </dl>
        </details>
      )}

      {/* MODAL: Adicionar / Conectar WhatsApp */}
      {showAddModal && (
        <div
          className="wa-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-wa-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && modalStep !== 'preparing') {
              setShowAddModal(false);
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            }
          }}
        >
          <div className="wa-modal">
            <div className="wa-modal-header">
              <h3 id="add-wa-title">
                {modalStep === 'label'
                  ? 'Adicionar nova conta de WhatsApp'
                  : modalStep === 'preparing'
                  ? 'Preparando conexão...'
                  : modalStep === 'qrcode'
                  ? 'Escaneie o QR Code'
                  : modalStep === 'connected'
                  ? 'WhatsApp conectado com sucesso!'
                  : 'Falha na conexão'}
              </h3>
              <button
                type="button"
                className="wa-modal-close"
                onClick={() => {
                  setShowAddModal(false);
                  if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                }}
                aria-label="Fechar modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="wa-modal-body">
              {modalStep === 'label' && (
                <form onSubmit={handleCreateInstanceAndGetQR}>
                  <div className="wa-input-group">
                    <label htmlFor="wa-new-label">Apelido para organizar este WhatsApp:</label>
                    <input
                      id="wa-new-label"
                      type="text"
                      placeholder="Ex: WhatsApp Vendas, Chip 02, Ofertas VIP"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      required
                      autoFocus
                    />
                    <p style={{ fontSize: 11, color: '#8fa2af', margin: '6px 0 0' }}>
                      Cada número terá uma instância isolada e segura configurada automaticamente.
                    </p>
                  </div>

                  <div className="wa-modal-footer" style={{ padding: '16px 0 0', background: 'transparent' }}>
                    <button
                      type="button"
                      className="wa-button"
                      onClick={() => setShowAddModal(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="wa-btn-primary"
                      disabled={creatingConnection || !newLabel.trim()}
                    >
                      {creatingConnection ? (
                        <>
                          <RefreshCw size={14} className="wa-spin" />
                          Criando instância...
                        </>
                      ) : (
                        'Gerar QR Code'
                      )}
                    </button>
                  </div>
                </form>
              )}

              {modalStep === 'preparing' && (
                <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                  <RefreshCw size={36} className="wa-spin" style={{ color: '#39bee6', margin: '0 auto 16px' }} />
                  <h4 style={{ margin: '0 0 8px', fontSize: 15 }}>Preparando conexão com o WhatsApp</h4>
                  <p style={{ fontSize: 12, color: '#8fa2af', margin: 0 }}>
                    Consultando instância e gerando QR Code no gateway...
                  </p>
                </div>
              )}

              {modalStep === 'qrcode' && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: '#c5d5e2', margin: '0 0 16px' }}>
                    Abra o <strong>WhatsApp</strong> no celular &gt; <strong>Aparelhos conectados</strong> &gt; <strong>Conectar um aparelho</strong> e aponte para a tela:
                  </p>

                  <div className="wa-qr-container">
                    {qrCodeBase64 ? (
                      <img src={qrCodeBase64} alt="QR Code WhatsApp" />
                    ) : (
                      <div style={{ padding: 40, color: '#333' }}>
                        <RefreshCw size={28} className="wa-spin" style={{ margin: '0 auto 10px' }} />
                        <p style={{ margin: 0, fontSize: 12 }}>Aguardando imagem do QR Code...</p>
                      </div>
                    )}
                  </div>

                  <p style={{ fontSize: 11, color: '#8fa2af', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, margin: '12px 0 0' }}>
                    <RefreshCw size={12} className="wa-spin" />
                    Aguardando leitura do código pelo aparelho celular...
                  </p>
                </div>
              )}

              {modalStep === 'connected' && activeNewConn && (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      background: 'rgba(34, 197, 94, 0.15)',
                      color: '#4ade80',
                      display: 'grid',
                      placeItems: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    <Check size={28} />
                  </div>
                  <h4 style={{ margin: '0 0 6px', fontSize: 16 }}>Conta vinculada com sucesso!</h4>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: '#9eb0bc' }}>
                    {activeNewConn.profileName || activeNewConn.label} ({phoneLabel(activeNewConn.phoneNumber)})
                  </p>
                  <p style={{ fontSize: 11, color: '#68d391' }}>
                    Identidade confirmada no gateway. Os grupos estão sendo sincronizados automaticamente.
                  </p>
                </div>
              )}

              {modalStep === 'error' && (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <CircleAlert size={36} style={{ color: '#ef4444', margin: '0 auto 12px' }} />
                  <p style={{ fontSize: 13, color: '#fca5a5', margin: '0 0 16px', lineHeight: 1.5 }}>
                    {modalError || 'Ocorreu um erro ao comunicar com a Evolution API.'}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                    <button
                      type="button"
                      className="wa-button"
                      onClick={() => setShowAddModal(false)}
                    >
                      Fechar
                    </button>
                    <button
                      type="button"
                      className="wa-btn-primary"
                      onClick={() => {
                        if (activeNewConn) {
                          void handleReconnectConnection(activeNewConn);
                        } else {
                          setModalStep('label');
                        }
                      }}
                    >
                      Tentar novamente
                    </button>
                  </div>
                </div>
              )}
            </div>

            {modalStep === 'connected' && (
              <div className="wa-modal-footer">
                <button
                  type="button"
                  className="wa-btn-primary"
                  onClick={() => {
                    setShowAddModal(false);
                    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                  }}
                >
                  Concluir
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Confirmação de Desconectar / Remover */}
      {confirmAction && (
        <div
          className="wa-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => !actionLoading && setConfirmAction(null)}
        >
          <div className="wa-modal" style={{ maxWidth: 460 }}>
            <div className="wa-modal-header">
              <h3>
                {confirmAction.type === 'disconnect' ? 'Desconectar WhatsApp' : 'Excluir WhatsApp'}
              </h3>
              <button
                type="button"
                className="wa-modal-close"
                disabled={actionLoading}
                onClick={() => setConfirmAction(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="wa-modal-body">
              {confirmAction.type === 'disconnect' ? (
                <p style={{ fontSize: 13, lineHeight: 1.6, color: '#c6d5df', margin: 0 }}>
                  Deseja desconectar a sessão de <strong>{confirmAction.connection.label}</strong> ({phoneLabel(confirmAction.connection.phoneNumber)})?
                  <br /><br />
                  Os grupos cadastrados serão mantidos e você poderá reconectar a qualquer momento via QR Code.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ fontSize: 13, lineHeight: 1.5, color: '#c6d5df', margin: 0 }}>
                    Tem certeza de que deseja excluir permanentemente o cadastro de <strong>{confirmAction.connection.label}</strong>?
                    <br />
                    <span style={{ color: '#8fa2af', fontSize: 12 }}>
                      Número: {phoneLabel(confirmAction.connection.phoneNumber)}
                    </span>
                  </p>

                  {/* Vínculos Afetados */}
                  <div style={{ background: '#161b1f', border: '1px solid #2e383f', borderRadius: 8, padding: 12, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: '#a0b3c2', marginBottom: 6 }}>Vínculos afetados:</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: '#8fa2af', lineHeight: 1.6 }}>
                      <li><strong>{confirmAction.connection.groupsCount ?? 0}</strong> grupos vinculados serão removidos.</li>
                      <li><strong>{confirmAction.connection.sourcesCount ?? 0}</strong> regras de envio serão <span style={{ color: '#fca5a5' }}>pausadas</span> para impedir novos disparos.</li>
                      <li><strong>{confirmAction.connection.jobsCount ?? 0}</strong> mensagens e postagens do histórico serão <span style={{ color: '#86efac' }}>preservadas</span>.</li>
                    </ul>
                  </div>

                  {confirmAction.connection.isDefault && (
                    <div style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: 8, padding: 10, fontSize: 12, color: '#fef08a' }}>
                      ⚠️ <strong>Atenção:</strong> Esta é a sua conexão padrão. Suas regras não serão atribuídas automaticamente a outro número. Você deverá selecionar uma nova conexão explicitamente nas regras se desejar.
                    </div>
                  )}

                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                    Esta ação também encerrará a sessão do WhatsApp e removerá a instância no gateway Evolution.
                  </p>

                  {deleteWarning && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: 8, padding: 10, fontSize: 12, color: '#fca5a5' }}>
                      {deleteWarning}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="wa-modal-footer">
              <button
                type="button"
                className="wa-button"
                disabled={actionLoading}
                onClick={() => setConfirmAction(null)}
              >
                Cancelar
              </button>

              {canForceLocal && confirmAction.type === 'delete' ? (
                <button
                  type="button"
                  className="wa-btn-danger"
                  disabled={actionLoading}
                  onClick={() => handleConfirmAction(true)}
                  title="Remove o cadastro apenas do painel local"
                >
                  {actionLoading ? 'Removendo...' : 'Confirmar remoção apenas do painel'}
                </button>
              ) : (
                <button
                  type="button"
                  className={confirmAction.type === 'disconnect' ? 'wa-button' : 'wa-btn-danger'}
                  disabled={actionLoading}
                  onClick={() => handleConfirmAction(false)}
                >
                  {actionLoading
                    ? 'Processando...'
                    : confirmAction.type === 'disconnect'
                    ? 'Desconectar'
                    : 'Excluir conta'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}