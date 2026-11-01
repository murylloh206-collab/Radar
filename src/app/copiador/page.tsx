'use client';

import CopierRuntimeStatus from '@/components/CopierRuntimeStatus';
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CopySource,
  CopyDestination,
  WhatsAppGroup,
} from '@/lib/types';
import CopierGroupPicker, { CopierGroupPhoto } from '@/components/CopierGroupPicker';
import { BrandLogo } from '@/components/BrandLogo';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Flame,
  Layers,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  X,
} from 'lucide-react';

interface ConnectionInfo {
  id: string;
  ownerJid?: string;
  label: string;
  phoneNumber?: string;
  profileName?: string;
  profilePicUrl?: string;
  status: string;
  state: 'connected_now' | 'last_known_connection' | 'unreachable' | 'disconnected';
  statusLabel: string;
  lastPingAt: string | null;
  isDefault?: boolean;
}

interface ActivityEvent {
  id: string;
  type: 'recebimento' | 'envio';
  timestamp: string;
  title: string;
  detail: string;
  status: string;
  reason?: string;
  store?: string;
  groupName: string;
}

interface CopierStatusResponse {
  ok: boolean;
  summary?: {
    hasRule: boolean;
    ruleId?: string;
    originJid?: string;
    originName: string;
    destinationNames: string[];
    destinationJids: string[];
    operationMode: 'revisao_manual' | 'automatico';
    state: 'ativo' | 'pausado' | 'aguardando_mensagens' | 'erro';
    stateLabel: string;
    isActive: boolean;
    blockReason?: string;
  };
  activeConnection?: ConnectionInfo;
  connections?: Array<{
    id: string;
    label: string;
    phoneNumber?: string;
    profileName?: string;
    profilePicUrl?: string;
    status: string;
    isDefault?: boolean;
    lastPingAt?: string;
  }>;
  receiving?: {
    status: 'ativo' | 'aguardando' | 'inativo';
    lastMessageReceivedAt: string | null;
    todayCount: number;
    totalCount: number;
  };
  queue?: {
    status: 'processando' | 'aguardando_aprovacao' | 'ociosa' | 'parada';
    isWorkerActive: boolean;
    lastProcessedAt: string | null;
    scheduledCount: number;
    pendingReviewCount: number;
    sentTodayCount: number;
    failedCount: number;
    nextSendAt: string | null;
  };
  activity?: ActivityEvent[];
}

function formatPhone(phone?: string) {
  if (!phone) return 'Número não informado';
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('55') && clean.length === 13) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  return `+${clean}`;
}

function formatDateTimeBR(isoString?: string | null) {
  if (!isoString) return 'Nenhum registro ainda';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return 'Data não identificada';
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dayMonth = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${dayMonth} às ${time} (Brasília)`;
}

function CopierContent() {
  const searchParams = useSearchParams();
  const paramConnId = searchParams?.get('connectionId') || '';
  const paramOriginJid = searchParams?.get('originJid') || '';

  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>(paramConnId);
  const [activeConnection, setActiveConnection] = useState<ConnectionInfo | null>(null);

  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [statusData, setStatusData] = useState<CopierStatusResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);

  // Estados dos 4 Passos do Fluxo
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);
  const [selectedOriginJid, setSelectedOriginJid] = useState<string>(paramOriginJid);
  const [selectedDestJids, setSelectedDestJids] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('Oferta essencial');
  const [operationMode, setOperationMode] = useState<'revisao_manual' | 'automatico'>('revisao_manual');
  const [allowedStores, setAllowedStores] = useState<string[]>(['shopee', 'mercadolivre', 'amazon', 'netshoes']);
  const [isActiveRule, setIsActiveRule] = useState(false);

  const [picker, setPicker] = useState<'origin' | 'destinations' | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const selectionEdited = useRef(false);
  const accountIdentity = useRef('');
  const currentConnection = useRef(paramConnId);

  const loadData = useCallback(async (requestedId?: string, refresh = false) => {
    const version = ++requestVersion.current;
    const target = requestedId ?? currentConnection.current;
    const switched = target !== currentConnection.current;
    currentConnection.current = target;
    if (switched) {
      selectionEdited.current = false;
      setGroups([]); setActiveConnection(null); setStatusData(null); setPicker(null);
      setSelectedOriginJid(''); setSelectedDestJids([]); setActiveRuleId(null); setIsActiveRule(false);
    }
    setGroupsLoading(true); setGroupError(null);
    const query = new URLSearchParams();
    if (target) query.set('connectionId', target);
    if (refresh) query.set('refresh', 'true');
    try {
      const response = await fetch('/api/copier/group-catalog?' + query, { cache: 'no-store' });
      const catalog = await response.json();
      if (version !== requestVersion.current) return;
      if (Array.isArray(catalog.connections)) setConnections(catalog.connections);
      if (!response.ok && catalog.connection) {
        setActiveConnection(catalog.connection); setSelectedConnectionId(catalog.connection.id);
        currentConnection.current = catalog.connection.id;
      }
      if (!response.ok || !catalog.ok) throw new Error(catalog.error || 'Não foi possível consultar os grupos.');
      const connection: ConnectionInfo = catalog.connection;
      const identity = connection.id + ':' + connection.ownerJid;
      if (accountIdentity.current && accountIdentity.current !== identity) {
        setSelectedOriginJid(''); setSelectedDestJids([]); setActiveRuleId(null); setIsActiveRule(false);
        selectionEdited.current = true;
      }
      accountIdentity.current = identity;
      currentConnection.current = connection.id;
      setSelectedConnectionId(connection.id); setActiveConnection(connection);
      setConnections(catalog.connections); setGroups(catalog.groups); setSyncedAt(catalog.syncedAt);
      setGroupsLoading(false); setLoading(false);
      const scopedQuery = '?connectionId=' + encodeURIComponent(connection.id);
      await Promise.allSettled([
        fetch('/api/copier/status' + scopedQuery, { cache: 'no-store' }).then(async response => {
          const status = await response.json();
          if (version === requestVersion.current && response.ok && status.ok) setStatusData(status);
        }),
        fetch('/api/copier/sources' + scopedQuery, { cache: 'no-store' }).then(async response => {
          const rules = await response.json();
          if (version !== requestVersion.current || !response.ok || !rules.ok) return;
          const found: CopySource | undefined = rules.sources.find((source: CopySource) => source.isActive) || rules.sources[0];
          if (!found) { setActiveRuleId(null); setIsActiveRule(false); return; }
          setActiveRuleId(found.id);
          if (!refresh && !selectionEdited.current) {
            setSelectedOriginJid(paramOriginJid || found.groupJid);
            setSelectedDestJids((rules.destinations || []).filter((destination: CopyDestination) => destination.sourceId === found.id && destination.isActive).map((destination: CopyDestination) => destination.groupJid));
            setOperationMode(found.operationMode || 'revisao_manual');
            if (found.allowedStores?.length) setAllowedStores(found.allowedStores);
          }
          setIsActiveRule(!!found.isActive);
        }),
      ]);
    } catch (error) {
      if (version !== requestVersion.current) return;
      setGroupError(error instanceof Error ? error.message : 'Não foi possível consultar os grupos.');
      if (switched) setActiveConnection(previous => previous?.id === currentConnection.current ? previous : null);
      else setActiveConnection(previous => previous ? { ...previous, state: 'unreachable', statusLabel: 'Não foi possível verificar agora' } : null);
    } finally {
      if (version === requestVersion.current) { setLoading(false); setGroupsLoading(false); }
    }
  }, [paramOriginJid]);

  useEffect(() => {
    void loadData(paramConnId);
    return () => { requestVersion.current++; };
  }, [loadData, paramConnId]);

  const handleSelectConnection = (newId: string) => {
    setSelectedConnectionId(newId);
    void loadData(newId);
  };

  // Mapa de grupos
  const groupsMap = useMemo(() => {
    const map = new Map<string, WhatsAppGroup>();
    groups.forEach((g) => map.set(g.groupJid, g));
    return map;
  }, [groups]);

  // Origem selecionada
  const originGroupName = useMemo(() => {
    if (!selectedOriginJid) return 'Selecione uma origem';
    return groupsMap.get(selectedOriginJid)?.name || 'Grupo de origem a confirmar';
  }, [selectedOriginJid, groupsMap]);

  // Destino selecionado
  const destinationGroupName = useMemo(() => {
    if (selectedDestJids.length === 0) return 'Selecione um destino';
    return selectedDestJids.map((jid) => groupsMap.get(jid)?.name || 'Grupo de destino a confirmar').join(', ');
  }, [selectedDestJids, groupsMap]);

  // Salvar / Alternar Ativação do Copiador (Passo 4)
  const handleToggleCopier = async () => {
    if (!isActiveRule && (groupsLoading || groupError || !groupsMap.has(selectedOriginJid) || selectedDestJids.some(jid => !groupsMap.has(jid)))) {
      setFeedback({ type: 'warning', message: 'Atualize os grupos e confirme a origem e os destinos desta conta antes de ativar.' });
      return;
    }
    if (!selectedOriginJid) {
      setFeedback({ type: 'warning', message: 'Passo 1 incompleto: escolha o grupo de origem antes de ativar.' });
      return;
    }
    if (selectedDestJids.length === 0) {
      setFeedback({ type: 'warning', message: 'Passo 2 incompleto: escolha pelo menos um grupo de destino para enviar.' });
      return;
    }

    const nextState = !isActiveRule;
    setSaving(true);
    setFeedback(null);

    try {
      const originGroup = groupsMap.get(selectedOriginJid);
      const computedName = originGroup ? `Cópia: ${originGroup.name}` : 'Regra Copiador';

      const res = await fetch('/api/copier/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeRuleId || undefined,
          connectionId: selectedConnectionId || activeConnection?.id,
          groupJid: selectedOriginJid,
          name: computedName,
          operationMode,
          allowedStores,
          stripThirdPartyLinks: true,
          stripExternalTags: true,
          destinationJids: selectedDestJids,
          isActive: nextState,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setIsActiveRule(nextState);
        if (data.source?.id) setActiveRuleId(data.source.id);
        setFeedback({
          type: 'success',
          message: nextState
            ? 'Copiador ativado com sucesso! As novas ofertas recebidas serão convertidas e processadas continuamente.'
            : 'Copiador pausado. O monitoramento foi suspenso.',
        });
        await loadData();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Falha ao salvar a regra do Copiador.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro de comunicação ao salvar o Copiador.' });
    } finally {
      setSaving(false);
    }
  };

  const isConnected = activeConnection?.state === 'connected_now';
  const isRuleActive = isActiveRule;
  const isReceivingActive = statusData?.receiving?.status === 'ativo';
  const isQueueActive = statusData?.queue?.status === 'processando';

  return (
    <section className="rp-page copier-page" aria-label="Modo Copiador">
      {/* Topo: WhatsApp Selecionado, Seletor de Contas e Ações */}
      <div className="rp-head" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <span className="rp-step">Automação Contínua</span>
            <h1 style={{ margin: '4px 0 2px' }}>Modo Copiador</h1>
            <p>Monitore grupos de ofertas, converta links para seus afiliados e publique automaticamente.</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Seletor de WhatsApp (quando houver várias contas) */}
          {connections.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#22292f', padding: '4px 10px', borderRadius: 8, border: '1px solid #364149' }}>
              <Smartphone size={14} style={{ color: '#39bee6' }} />
              <select
                value={selectedConnectionId}
                onChange={(e) => handleSelectConnection(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: '#edf2f5', fontSize: 12, outline: 'none', cursor: 'pointer' }}
                aria-label="Selecionar conta WhatsApp"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id} style={{ background: '#1c2227', color: '#edf2f5' }}>
                    {c.label} ({c.phoneNumber ? formatPhone(c.phoneNumber) : 'Sem número'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            className="rp-btn"
            onClick={() => setShowActivityModal(true)}
            title="Ver histórico de atividade em tempo real"
          >
            <Activity size={14} aria-hidden="true" />
            Ver atividade
          </button>

          <Link href="/conexoes?aba=whatsapp" className="rp-btn rp-quiet">
            Gerenciar WhatsApps ↗
          </Link>
        </div>
      </div>

      {/* Cartão de WhatsApp Conectado em Destaque */}
      <div
        className="rp-banner"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          gap: 16,
          background: '#242b31',
          border: '1px solid #36424b',
          borderRadius: 14,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <BrandLogo brand="whatsapp" variant="whatsapp-destaque" size={32} containerSize={48} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 15, color: '#edf2f5' }}>
                {activeConnection?.label || 'Selecione seu WhatsApp'}
              </strong>
              <span className={`rp-tag ${isConnected ? 'rp-good' : 'rp-warn'}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                {activeConnection?.statusLabel || (loading ? 'Consultando conexão…' : 'Conexão não confirmada')}
              </span>
              {activeConnection?.isDefault && (
                <span style={{ fontSize: 9, background: '#254452', color: '#74dbf7', padding: '1px 6px', borderRadius: 4, border: '1px solid #356073' }}>
                  Padrão
                </span>
              )}
            </div>
            <p className="rp-sub" style={{ margin: '3px 0 0', fontSize: 12, color: '#97abb9' }}>
              Número: <strong style={{ color: '#d0dfea' }}>{formatPhone(activeConnection?.phoneNumber)}</strong>
              {' '}&bull; Perfil: <strong style={{ color: '#d0dfea' }}>{activeConnection?.profileName || 'Conta WhatsApp'}</strong>
            </p>
          </div>
        </div>

        <div style={{ textAlign: 'right', fontSize: 11, color: '#889dae' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            <ShieldCheck size={14} style={{ color: isConnected ? '#56c288' : '#889dae' }} />
            <span>Última verificação:</span>
          </div>
          <strong style={{ color: '#b9cad6', display: 'block', marginTop: 2 }}>
            {formatDateTimeBR(activeConnection?.lastPingAt)}
          </strong>
        </div>
      </div>

      {/* 4 Pilares de Saúde e Diagnóstico Separados */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: 14,
          marginBottom: 24,
        }}
        aria-label="Status dos 4 componentes da automação"
      >
        {/* Pilar 1: Regra do Copiador */}
        <div style={{ background: '#20262b', border: '1px solid #364049', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#8fa2af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              1. Regra
            </span>
            <span className={`rp-tag ${isRuleActive ? 'rp-good' : 'rp-warn'}`} style={{ fontSize: 10 }}>
              {isRuleActive ? 'Ativa' : 'Pausada'}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#edf2f5', marginBottom: 4 }}>
            {isRuleActive ? 'Monitoramento habilitado' : 'Operação suspensa'}
          </div>
          <p style={{ fontSize: 11, color: '#8fa2af', margin: 0 }}>
            Modo: <strong>{operationMode === 'automatico' ? 'Envio automático' : 'Revisão prévia'}</strong>
          </p>
        </div>

        {/* Pilar 2: Conexão WhatsApp */}
        <div style={{ background: '#20262b', border: '1px solid #364049', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#8fa2af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              2. Conexão WhatsApp
            </span>
            <span className={`rp-tag ${isConnected ? 'rp-good' : 'rp-warn'}`} style={{ fontSize: 10 }}>
              {isConnected ? 'Pareada' : 'Aguardando'}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#edf2f5', marginBottom: 4 }}>
            {activeConnection?.statusLabel || 'Não verificada'}
          </div>
          <p style={{ fontSize: 11, color: '#8fa2af', margin: 0 }}>
            {activeConnection?.phoneNumber ? formatPhone(activeConnection.phoneNumber) : 'Sem número'}
          </p>
        </div>

        {/* Pilar 3: Saúde de Recebimento */}
        <div style={{ background: '#20262b', border: '1px solid #364049', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#8fa2af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              3. Recebimento
            </span>
            <span className={`rp-tag ${isReceivingActive ? 'rp-good' : ''}`} style={{ fontSize: 10 }}>
              {isReceivingActive ? 'Ativo' : 'Aguardando'}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#edf2f5', marginBottom: 4 }}>
            {statusData?.receiving?.todayCount ?? 0} ofertas hoje
          </div>
          <p style={{ fontSize: 11, color: '#8fa2af', margin: 0 }}>
            Última recebida: <br />
            <strong>{formatDateTimeBR(statusData?.receiving?.lastMessageReceivedAt)}</strong>
          </p>
        </div>

        {/* Pilar 4: Saúde de Envio */}
        <div style={{ background: '#20262b', border: '1px solid #364049', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#8fa2af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              4. Processamento & Envio
            </span>
            <span className={`rp-tag ${isQueueActive ? 'rp-good' : ''}`} style={{ fontSize: 10 }}>
              {statusData?.queue?.status === 'processando' ? 'Processando' : 'Ociosa'}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#edf2f5', marginBottom: 4 }}>
            {statusData?.queue?.sentTodayCount ?? 0} enviadas hoje
          </div>
          <p style={{ fontSize: 11, color: '#8fa2af', margin: 0 }}>
            Último envio confirmado: <br />
            <strong>{formatDateTimeBR(statusData?.queue?.lastProcessedAt)}</strong>
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className="rp-panel rp-section"
          style={{
            marginBottom: 20,
            borderColor: feedback.type === 'error' ? '#e05353' : feedback.type === 'warning' ? '#d97736' : '#56c288',
            background: feedback.type === 'error' ? '#2e1d1d' : feedback.type === 'warning' ? '#2e251a' : '#1b2d22',
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: '#edf2f5' }}>{feedback.message}</p>
        </div>
      )}

      {picker && <CopierGroupPicker key={selectedConnectionId + ':' + picker} mode={picker} groups={groups}
        selected={picker === 'origin' ? (selectedOriginJid ? [selectedOriginJid] : []) : selectedDestJids}
        excludedJid={selectedOriginJid} connectionId={selectedConnectionId} ownerJid={activeConnection?.ownerJid}
        accountLabel={(activeConnection?.label || 'WhatsApp selecionado') + ' · ' + formatPhone(activeConnection?.phoneNumber)}
        loading={groupsLoading} error={groupError} onRefresh={() => void loadData(selectedConnectionId, true)} onClose={() => setPicker(null)}
        onConfirm={selection => { selectionEdited.current = true; if (picker === 'origin') { setSelectedOriginJid(selection[0]); setSelectedDestJids(previous => previous.filter(jid => jid !== selection[0])); } else setSelectedDestJids(selection); setPicker(null); }} />}

      <CopierRuntimeStatus connectionId={selectedConnectionId} />

      {/* Resumo do Fluxo Principal */}
      <div className="rp-flow copier-flow" style={{ marginBottom: 20 }}>
        <div className="rp-flow-part">
          <small>1. Copiar de</small>
          <strong>{originGroupName}</strong>
        </div>
        <span className="rp-flow-arrow">→</span>
        <div className="rp-flow-part">
          <small>2. Publicar em</small>
          <strong>{destinationGroupName}</strong>
        </div>
        <span className="rp-flow-arrow">→</span>
        <div className="rp-flow-part">
          <small>3. Formato</small>
          <strong>{selectedTemplate} ({operationMode === 'automatico' ? 'Auto' : 'Revisão'})</strong>
        </div>
      </div>

      {/* Grid com os 4 Passos Estruturados */}
      <div className="rp-split">
        {/* Coluna Esquerda: Passos 1, 2 e 3 */}
        <div className="rp-stack">
          {/* PASSO 1: De qual grupo copiar? */}
          <div className="rp-panel">
            <span className="rp-step">Passo 01</span>
            <h2>De qual grupo copiar?</h2>
            <p className="rp-sub" style={{ margin: '0 0 14px' }}>
              Escolha o grupo de onde o Radar capturará as promoções enviadas por concorrentes ou parceiros.
            </p>

            <button type="button" className="copier-choose" onClick={() => setPicker('origin')} aria-haspopup="dialog">
              {groupsMap.get(selectedOriginJid) ? <CopierGroupPhoto group={groupsMap.get(selectedOriginJid)!} connectionId={selectedConnectionId} ownerJid={activeConnection?.ownerJid} /> : <span className="cgp-avatar"><Users size={22} /></span>}
              <span className="copier-choose-copy"><strong>{originGroupName}</strong><small>Escolher pela foto e pelo nome do grupo</small></span><ChevronRight size={18} />
            </button>
            <div className="copier-group-tools"><span>{groupsLoading ? 'Atualizando grupos…' : syncedAt ? groups.length + ' grupos sincronizados' : 'Sincronize esta conexão'}</span><button type="button" onClick={() => void loadData(selectedConnectionId, true)} disabled={groupsLoading}><RefreshCw size={13} />Atualizar</button></div>
            {groupError && <p className="copier-group-notice" role="status">{groupError} <Link href="/conexoes?aba=whatsapp">Gerenciar WhatsApps</Link></p>}

          </div>

          {/* PASSO 2: Para quais grupos enviar? */}
          <div className="rp-panel">
            <span className="rp-step">Passo 02</span>
            <h2>Para quais grupos enviar?</h2>
            <p className="rp-sub" style={{ margin: '0 0 14px' }}>
              Selecione o canal ou grupo oficial onde você administra e deseja que as ofertas sejam divulgadas.
            </p>

            <button type="button" className="copier-choose" onClick={() => setPicker('destinations')} aria-haspopup="dialog">
              {groupsMap.get(selectedDestJids[0]) ? <CopierGroupPhoto group={groupsMap.get(selectedDestJids[0])!} connectionId={selectedConnectionId} ownerJid={activeConnection?.ownerJid} /> : <span className="cgp-avatar"><Users size={22} /></span>}
              <span className="copier-choose-copy"><strong>{selectedDestJids.length > 1 ? selectedDestJids.length + ' grupos selecionados' : destinationGroupName}</strong><small>{selectedDestJids.length > 1 ? destinationGroupName : 'Selecionar um ou vários grupos de destino'}</small></span><ChevronRight size={18} />
            </button>

            <p className="rp-sub" style={{ fontSize: 11, margin: '6px 0 0' }}>
              A conta conectada precisa ter permissão de envio (administrador ou grupo aberto a todos).
            </p>
          </div>

          {/* PASSO 3: Qual template usar? */}
          <div className="rp-panel">
            <span className="rp-step">Passo 03</span>
            <h2>Qual template usar?</h2>
            <p className="rp-sub" style={{ margin: '0 0 14px' }}>
              Defina o formato da mensagem e o modo de liberação das ofertas.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <label className="rp-check">
                <input
                  type="radio"
                  name="rp-mode"
                  checked={operationMode === 'revisao_manual'}
                  onChange={() => setOperationMode('revisao_manual')}
                />
                Revisar antes de enviar (Recomendado para conferir fotos e textos)
              </label>

              <label className="rp-check">
                <input
                  type="radio"
                  name="rp-mode"
                  checked={operationMode === 'automatico'}
                  onChange={() => setOperationMode('automatico')}
                />
                Enviar automaticamente após validar links de afiliado
              </label>
            </div>

            <label className="rp-field">
              Modelo de texto (Template)
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
              >
                <option value="Oferta essencial">Oferta essencial (Preço + Link limpo)</option>
                <option value="Oferta com cupom">Oferta com cupom e destaque</option>
                <option value="Texto curto">Texto curto e direto</option>
              </select>
            </label>

            <details className="rp-details" style={{ marginTop: 14 }}>
              <summary>Lojas autorizadas e regras de conversão</summary>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label className="rp-check">
                  <input
                    type="checkbox"
                    checked={allowedStores.includes('shopee')}
                    onChange={(e) => {
                      setAllowedStores((prev) =>
                        e.target.checked ? [...prev, 'shopee'] : prev.filter((s) => s !== 'shopee')
                      );
                    }}
                  />
                  Shopee
                </label>
                <label className="rp-check">
                  <input
                    type="checkbox"
                    checked={allowedStores.includes('mercadolivre')}
                    onChange={(e) => {
                      setAllowedStores((prev) =>
                        e.target.checked ? [...prev, 'mercadolivre'] : prev.filter((s) => s !== 'mercadolivre')
                      );
                    }}
                  />
                  Mercado Livre
                </label>
                <label className="rp-check">
                  <input
                    type="checkbox"
                    checked={allowedStores.includes('amazon')}
                    onChange={(e) => {
                      setAllowedStores((prev) =>
                        e.target.checked ? [...prev, 'amazon'] : prev.filter((s) => s !== 'amazon')
                      );
                    }}
                  />
                  Amazon
                </label>
                <label className="rp-check">
                  <input
                    type="checkbox"
                    checked={allowedStores.includes('netshoes')}
                    onChange={(e) => {
                      setAllowedStores((prev) =>
                        e.target.checked ? [...prev, 'netshoes'] : prev.filter((s) => s !== 'netshoes')
                      );
                    }}
                  />
                  Netshoes
                </label>
              </div>

              <div style={{ background: '#1c2227', padding: 12, borderRadius: 8, marginTop: 12, border: '1px solid #333d45' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#39bee6', fontSize: 11, fontWeight: 600 }}>
                  <ShieldCheck size={14} />
                  PROTEÇÃO ANTI-CONCORRENTE OBRIGATÓRIA
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#a0b3c2', lineHeight: 1.5 }}>
                  Se a conversão para o seu link de afiliado falhar em qualquer loja, a oferta será <strong>automaticamente bloqueada</strong>. O link do concorrente nunca será publicado no seu grupo.
                </p>
              </div>
            </details>
          </div>
        </div>

        {/* Coluna Direita: Prévia e PASSO 4: Ativar Copiador */}
        <div className="rp-stack">
          {/* Prévia da Mensagem Formatada */}
          <div className="rp-panel">
            <div className="rp-row">
              <h2>Prévia da mensagem</h2>
              <span className="rp-tag">Exemplo</span>
            </div>

            <div className="rp-message rp-section">
              <div
                className="rp-product-photo rp-p1"
                role="img"
                aria-label="Fone sem fio de exemplo"
              />
              <p>
                🔥 <strong>Achado imperdível do Radar</strong><br />
                Fone de Ouvido Bluetooth Sem Fio Estéreo<br />
                De <del>R$ 199,90</del> por <strong>R$ 129,90</strong>
                <br />
                {selectedTemplate === 'Oferta com cupom' && (
                  <>
                    🏷️ <em>Use o cupom: PROMO10</em><br />
                  </>
                )}
                <span className="rp-link" style={{ color: '#39bee6', fontWeight: 600 }}>
                  👉 Compre aqui: https://shope.ee/seu-afiliado
                </span>
              </p>
            </div>

            <p className="rp-sub" style={{ fontSize: 11 }}>
              O layout é gerado automaticamente aplicando seu template e o link de afiliado validado.
            </p>
          </div>

          {/* PASSO 4: Ativar Copiador */}
          <div className="rp-panel" style={{ border: isActiveRule ? '1px solid #2e7d56' : '1px solid #3d4a55' }}>
            <span className="rp-step">Passo 04</span>
            <div className="rp-row" style={{ marginTop: 4 }}>
              <h2>Ativar Copiador</h2>
              <span className={`rp-tag ${isActiveRule ? 'rp-good' : 'rp-warn'}`}>
                {isActiveRule ? 'Monitoramento Ativo' : 'Copiador Pausado'}
              </span>
            </div>

            <p className="rp-sub" style={{ margin: '8px 0 16px' }}>
              {isActiveRule
                ? 'O Copiador está ativo! Todas as ofertas recebidas no grupo de origem serão processadas e enviadas para o grupo de destino de forma contínua e independente.'
                : 'Revise os passos 1, 2 e 3 e clique no botão abaixo para iniciar a automação em tempo real.'}
            </p>

            <div className="rp-actions">
              <button
                type="button"
                className={`rp-btn ${isActiveRule ? '' : 'rp-primary'}`}
                style={{
                  minHeight: 46,
                  padding: '12px 24px',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onClick={handleToggleCopier}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <RefreshCw size={15} className="wa-spin" />
                    Salvando regra...
                  </>
                ) : isActiveRule ? (
                  <>
                    <Pause size={15} />
                    Pausar Copiador
                  </>
                ) : (
                  <>
                    <Play size={15} />
                    Ativar Copiador
                  </>
                )}
              </button>

              <Link href="/envios?aba=revisao" className="rp-btn">
                Ver fila de envios
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: Histórico de Atividade Detalhada */}
      {showActivityModal && (
        <div
          className="wa-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowActivityModal(false)}
        >
          <div className="wa-modal" style={{ maxWidth: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="wa-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Activity size={18} style={{ color: '#39bee6' }} />
                <h3 style={{ margin: 0, fontSize: 16 }}>Atividade Recente do Copiador</h3>
              </div>
              <button
                type="button"
                className="wa-modal-close"
                onClick={() => setShowActivityModal(false)}
                aria-label="Fechar atividade"
              >
                <X size={18} />
              </button>
            </div>

            <div className="wa-modal-body" style={{ overflowY: 'auto', padding: 20 }}>
              {!statusData?.activity || statusData.activity.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8fa2af' }}>
                  <Clock size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: 14 }}>Nenhum evento registrado ainda.</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                    Assim que mensagens forem recebidas ou jobs forem processados, eles aparecerão aqui.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {statusData.activity.map((event) => {
                    const isRecebimento = event.type === 'recebimento';
                    const isBlocked = event.status === 'bloqueado' || event.status === 'descartada' || event.status === 'falha';
                    const isSuccess = event.status === 'enviado' || event.status === 'processada';

                    return (
                      <div
                        key={event.id}
                        style={{
                          background: '#192025',
                          border: '1px solid #313d46',
                          borderRadius: 10,
                          padding: 14,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {isRecebimento ? (
                              <Radio size={14} style={{ color: '#39bee6' }} />
                            ) : (
                              <Send size={14} style={{ color: '#56c288' }} />
                            )}
                            <strong style={{ fontSize: 13, color: '#edf2f5' }}>{event.title}</strong>
                            {event.store && (
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#25343e', color: '#8dd9ec' }}>
                                {event.store.toUpperCase()}
                              </span>
                            )}
                          </div>

                          <span
                            className={`rp-tag ${isSuccess ? 'rp-good' : isBlocked ? 'rp-warn' : ''}`}
                            style={{ fontSize: 10, padding: '2px 7px' }}
                          >
                            {event.status}
                          </span>
                        </div>

                        <p style={{ margin: 0, fontSize: 12, color: '#a4b7c4', lineHeight: 1.5, wordBreak: 'break-word' }}>
                          {event.detail}
                        </p>

                        {event.reason && (
                          <div
                            style={{
                              fontSize: 11,
                              color: isBlocked ? '#fca5a5' : '#94a9b8',
                              background: isBlocked ? 'rgba(239, 68, 68, 0.1)' : '#212a31',
                              padding: '4px 8px',
                              borderRadius: 6,
                              marginTop: 2,
                            }}
                          >
                            Motivo / Detalhe: {event.reason}
                          </div>
                        )}

                        <div style={{ fontSize: 10, color: '#748b99', marginTop: 2 }}>
                          {formatDateTimeBR(event.timestamp)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="wa-modal-footer">
              <button
                type="button"
                className="wa-btn-primary"
                onClick={() => setShowActivityModal(false)}
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


export default function CopierPage() {
  return (
    <React.Suspense fallback={<div className="rp-page"><p style={{ color: "#8fa2af", padding: 40 }}>Carregando Modo Copiador...</p></div>}>
      <CopierContent />
    </React.Suspense>
  );
}
