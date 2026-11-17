'use client';

import { useWhatsAppWorkspace } from '@/components/WhatsAppWorkspaceProvider';
import { initialCopierRule } from '@/lib/client/copier-selection';
import { serialPoll } from '@/lib/client/serial-poll';
import CopierRuntimeStatus from '@/components/CopierRuntimeStatus';
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CopySource,
  WhatsAppGroup,
} from '@/lib/types';
import CopierGroupPicker, { CopierGroupPhoto } from '@/components/CopierGroupPicker';
import CopierSettingsModal, { BUILTIN_TEMPLATES } from '@/components/CopierSettingsModal';
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
  Settings,
  Plus,
  SlidersHorizontal,
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
  mediaUrl?: string;
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
  const sharedWhatsApp = useWhatsAppWorkspace();
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Estados dos 4 Passos do Fluxo
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);
  const [selectedOriginJid, setSelectedOriginJid] = useState<string>(paramOriginJid);
  const [selectedDestJids, setSelectedDestJids] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('Oferta essencial');
  const [operationMode, setOperationMode] = useState<'revisao_manual' | 'automatico'>('revisao_manual');
  const [allowedStores, setAllowedStores] = useState<string[]>(['shopee', 'mercadolivre', 'amazon', 'netshoes']);
  const [isActiveRule, setIsActiveRule] = useState(false);

  const [picker, setPicker] = useState<'origin' | 'destinations' | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(!sharedWhatsApp.workspace);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const savedRule = useRef<CopySource | null>(null);
  const selectionEdited = useRef(false);
  const accountIdentity = useRef('');

  const [rulesReady, setRulesReady] = useState(false);
  const [rulesList, setRulesList] = useState<CopySource[]>([]);
  const selectedRuleChoice = useRef<string | null>(null);
  const [reviving, setReviving] = useState(false);

  const handleReviveConnection = async () => {
    setReviving(true);
    try {
      const res = await fetch('/api/copier/watchdog?restart=true' + (selectedConnectionId ? '&connectionId=' + encodeURIComponent(selectedConnectionId) : ''), { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setFeedback({
          type: 'success',
          message: `Conexão WhatsApp revivida com sucesso! ${data.cycle?.processed || 0} eventos processados e ${data.cycle?.dispatched || 0} envios avaliados.`,
        });
        await loadData(selectedConnectionId, true);
      } else {
        setFeedback({
          type: 'warning',
          message: data.error || 'Não foi possível reiniciar a conexão no momento.',
        });
      }
    } catch {
      setFeedback({
        type: 'warning',
        message: 'Erro ao comunicar com o sentinela de auto-cura.',
      });
    } finally {
      setReviving(false);
    }
  };

  const applyRule = useCallback((source: CopySource | null, origin = '') => {
    savedRule.current = source;
    setActiveRuleId(source?.id || null); setIsActiveRule(!!source?.isActive);
    setSelectedOriginJid(origin || source?.groupJid || '');
    setSelectedDestJids((sharedWhatsApp.workspace?.destinations || []).filter(destination => destination.sourceId === source?.id && destination.isActive).map(destination => destination.groupJid));
    setOperationMode(source?.operationMode || 'revisao_manual');
    setAllowedStores(source?.allowedStores?.length ? source.allowedStores : ['shopee', 'mercadolivre', 'amazon', 'netshoes']);
    if (source?.templateName) setSelectedTemplate(source.templateName);
  }, [sharedWhatsApp.workspace?.destinations]);

  useEffect(() => { if (paramConnId && paramConnId !== sharedWhatsApp.selectedId) sharedWhatsApp.select(paramConnId); }, [paramConnId, sharedWhatsApp.selectedId, sharedWhatsApp.select]);

  useEffect(() => {
    const workspace = sharedWhatsApp.workspace;
    if (!workspace?.connection) {
      setLoading(sharedWhatsApp.loading); setGroupsLoading(sharedWhatsApp.loading);
      if (workspace) { setConnections(workspace.connections); setGroups([]); setRulesReady(true); }
      return;
    }
    const connection = workspace.connection;
    const identity = connection.id + ':' + (connection.ownerJid || '');
    const changedAccount = accountIdentity.current !== identity;
    if (changedAccount) {
      accountIdentity.current = identity; selectionEdited.current = false; selectedRuleChoice.current = null;
      setPicker(null); setStatusData(null); setRulesReady(false);
    }
    setSelectedConnectionId(connection.id); setActiveConnection(connection);
    setConnections(workspace.connections); setGroups(workspace.groups); setSyncedAt(workspace.syncedAt);
    setRulesList(workspace.sources);
    if (!selectionEdited.current && selectedRuleChoice.current === null) {
      const source = initialCopierRule(workspace.sources, paramOriginJid);
      applyRule(source, paramOriginJid);
    }
    setRulesReady(true); setLoading(false); setGroupsLoading(false);
    setGroupError(sharedWhatsApp.error);
  }, [sharedWhatsApp.workspace, sharedWhatsApp.loading, sharedWhatsApp.error, paramOriginJid, applyRule]);

  useEffect(() => {
    if (!selectedConnectionId) return;
    setStatusData(null);
    return serialPoll(async signal => {
      if (document.visibilityState === 'hidden') return false;
      try {
        const response = await fetch('/api/copier/status?connectionId=' + encodeURIComponent(selectedConnectionId), { signal, cache: 'no-store' });
        const status = await response.json();
        if (!signal.aborted && response.ok && status.ok) setStatusData(status);
      } catch { /* Statistics do not block account and group selection. */ }
      return false;
    }, 15000);
  }, [selectedConnectionId]);

  const loadData = async (_requestedId?: string, refresh = false) => {
    if (refresh) {
      setGroupsLoading(true);
      await sharedWhatsApp.refreshGroups();
      setGroupsLoading(false);
    } else await sharedWhatsApp.reload();
  };
  const handleSelectConnection = (id: string) => {
    setRulesReady(false); setGroups([]); setActiveConnection(null); setStatusData(null);
    setSelectedOriginJid(''); setSelectedDestJids([]); setActiveRuleId(null); setIsActiveRule(false);
    selectedRuleChoice.current = null; selectionEdited.current = false;
    sharedWhatsApp.select(id);
  };
  const chooseRule = (id: string) => {
    selectedRuleChoice.current = id; selectionEdited.current = true;
    applyRule(rulesList.find(source => source.id === id) || null);
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
  const handleToggleCopier = async (requestedActive?: boolean) => {
    const nextState = requestedActive ?? !isActiveRule;
    if (nextState && (!groupsMap.has(selectedOriginJid) || selectedDestJids.some(jid => !groupsMap.has(jid)))) {
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

    setSaving(true);
    setFeedback(null);

    try {
      const originGroup = groupsMap.get(selectedOriginJid);
      const computedName = originGroup ? `Cópia: ${originGroup.name}` : 'Regra Copiador';

      const res = await fetch('/api/copier/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...savedRule.current,
          saveOnly: requestedActive !== undefined,
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
      if (res.ok && data.ok) {
        setIsActiveRule(nextState);
        if (data.source?.id) { savedRule.current = data.source; selectedRuleChoice.current = data.source.id; setActiveRuleId(data.source.id); }
        setFeedback({
          type: 'success',
          message: requestedActive !== undefined ? `Configurações salvas. O copiador permanece ${nextState ? 'ativo' : 'pausado'}.` : nextState
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

  const handlePauseFromModal = async () => {
    await handleToggleCopier(false);
  };

  const handleSaveModalSettings = async (updated: Partial<CopySource>) => {
    if (isActiveRule) {
      throw new Error('O copiador só pode ser editado quando estiver pausado. Pause antes de salvar alterações.');
    }

    setSaving(true);
    setFeedback(null);

    try {
      const originGroup = groupsMap.get(selectedOriginJid);
      const computedName = originGroup ? `Cópia: ${originGroup.name}` : (savedRule.current?.name || 'Regra Copiador');

      const payload = {
        ...savedRule.current,
        ...updated,
        id: activeRuleId || undefined,
        connectionId: selectedConnectionId || activeConnection?.id,
        groupJid: selectedOriginJid || savedRule.current?.groupJid,
        name: computedName,
        operationMode,
        allowedStores,
        stripThirdPartyLinks: true,
        stripExternalTags: true,
        destinationJids: selectedDestJids,
        isActive: false, // salva pausado conforme a regra de fluxo estrito
        saveOnly: true,
      };

      const res = await fetch('/api/copier/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.source) {
          savedRule.current = data.source;
          setActiveRuleId(data.source.id);
          selectedRuleChoice.current = data.source.id;
          if (data.source.templateName) setSelectedTemplate(data.source.templateName);
        }
        setFeedback({
          type: 'success',
          message: 'Configurações do copiador salvas com sucesso! Para iniciar o monitoramento, clique em "Ativar Copiador".',
        });
        await loadData();
      } else {
        throw new Error(data.error || 'Falha ao salvar as configurações.');
      }
    } finally {
      setSaving(false);
    }
  };

  const editAllowedStores = (update: React.SetStateAction<string[]>) => { selectionEdited.current = true; setAllowedStores(update); };

  const isConnected = activeConnection?.status === 'connected';
  const isRuleActive = isActiveRule;
  const isReceivingActive = statusData?.receiving?.status === 'ativo';
  const isQueueActive = statusData?.queue?.status === 'processando';

  return (
    <section className="rp-page copier-page" aria-label="Modo Copiador">
      {/* Topo: título e ações */}
      <header className="rv6-head">
        <div>
          <h1>Copiador</h1>
          <p>Copia as ofertas de um grupo, troca os links pelos seus e publica nos seus grupos.</p>
        </div>

        <div className="rv6-head-actions">
          {/* Seletor de WhatsApp (quando houver várias contas) */}
          {connections.length > 1 && (
            <label className="rv6-select">
              <Smartphone size={14} aria-hidden="true" />
              <select
                value={selectedConnectionId}
                onChange={(e) => handleSelectConnection(e.target.value)}
                aria-label="Selecionar conta WhatsApp"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.phoneNumber ? formatPhone(c.phoneNumber) : 'Sem número'})
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            type="button"
            className="rp-btn"
            onClick={() => setShowActivityModal(true)}
            title="Ver histórico de atividade em tempo real"
          >
            <Activity size={14} aria-hidden="true" />
            Atividade
          </button>
        </div>
      </header>

      {/* Console: estado da automação, conta e caminho da oferta num único bloco */}
      <section className="rv6-console" data-on={isRuleActive ? 'true' : 'false'} aria-label="Estado do Copiador">
        <div className="rv6-console-top">
          <div className="rv6-state">
            <span className="rv6-pulse" aria-hidden="true" />
            <div>
              <small>{activeRuleId && savedRule.current ? savedRule.current.name : 'Nova configuração'}</small>
              <strong>
                {!rulesReady ? 'Carregando…' : !activeRuleId ? 'Pronto para configurar' : isRuleActive ? 'Copiando agora' : 'Pausado'}
              </strong>
              <p>
                {isRuleActive
                  ? 'Para mudar intervalo, horário, ordem ou modelo de mensagem, pause o Copiador antes.'
                  : 'Escolha a origem e os destinos abaixo. A engrenagem abre os ajustes avançados.'}
              </p>
            </div>
          </div>

          <div className="rv6-account">
            <BrandLogo brand="whatsapp" variant="whatsapp-destaque" size={26} containerSize={42} />
            <div className="rv6-account-info">
              <div className="rv6-account-line">
                <strong>{activeConnection?.label || 'Selecione seu WhatsApp'}</strong>
                <span className={`rp-tag ${isConnected ? 'rp-good' : 'rp-warn'}`}>
                  {activeConnection?.statusLabel || (loading ? 'Consultando conexão…' : 'Conexão não confirmada')}
                </span>
                {activeConnection?.isDefault && <span className="rp-tag">Padrão</span>}
              </div>
              <p>
                {formatPhone(activeConnection?.phoneNumber)} · {activeConnection?.profileName || 'Conta WhatsApp'}
              </p>
              <p className="rv6-check">
                <ShieldCheck size={13} aria-hidden="true" data-ok={isConnected ? 'true' : 'false'} />
                Verificado em {formatDateTimeBR(activeConnection?.lastPingAt)}
              </p>
            </div>
            <div className="rv6-account-actions">
              <button
                type="button"
                className="rp-btn"
                onClick={handleReviveConnection}
                disabled={reviving}
                title="Reinicia a sessão do WhatsApp e processa ofertas acumuladas"
              >
                <RefreshCw size={13} className={reviving ? 'wa-spin' : ''} aria-hidden="true" />
                {reviving ? 'Sincronizando…' : 'Sincronizar'}
              </button>
              <Link href="/conexoes?aba=whatsapp" className="rv5-more" style={{ margin: 0 }}>
                Gerenciar contas
              </Link>
            </div>
          </div>
        </div>

        {/* Caminho da oferta: origem, conversão e destinos, com a saúde de cada etapa */}
        <ol className="rv6-track" aria-label="Caminho da oferta">
          <li>
            <div className="rv6-track-head">
              <small>1 · Chega de</small>
              <span className={`rp-tag ${isReceivingActive ? 'rp-good' : ''}`}>{isReceivingActive ? 'Recebendo' : 'Aguardando'}</span>
            </div>
            <strong>{originGroupName}</strong>
            <p>
              <b>{statusData ? statusData.receiving?.todayCount ?? 0 : '–'}</b> recebidas hoje · última: {formatDateTimeBR(statusData?.receiving?.lastMessageReceivedAt)}
            </p>
          </li>
          <li>
            <div className="rv6-track-head">
              <small>2 · Vira sua oferta</small>
              <span className={`rp-tag ${isRuleActive ? 'rp-good' : 'rp-warn'}`}>
                {!rulesReady ? 'Carregando…' : !activeRuleId ? 'Nova' : isRuleActive ? 'Ativa' : 'Pausada'}
              </span>
            </div>
            <strong>{selectedTemplate}</strong>
            <p>{operationMode === 'automatico' ? 'Envio automático, sem revisão' : 'Passa pela sua revisão antes de enviar'}</p>
          </li>
          <li>
            <div className="rv6-track-head">
              <small>3 · Sai para</small>
              <span className={`rp-tag ${isQueueActive ? 'rp-good' : ''}`}>
                {statusData?.queue?.status === 'parada' ? 'Processador parado' : statusData?.queue?.status === 'processando' ? 'Enviando' : 'Em espera'}
              </span>
            </div>
            <strong>{destinationGroupName}</strong>
            <p>
              <b>{statusData ? statusData.queue?.sentTodayCount ?? 0 : '–'}</b> enviadas hoje · último: {formatDateTimeBR(statusData?.queue?.lastProcessedAt)}
            </p>
          </li>
        </ol>

        {/* Regras salvas e ajustes aplicados */}
        <div className="rv6-console-foot">
          <div className="rv6-rules" role="group" aria-label="Regras salvas">
            <button
              type="button"
              className={`csm-seg-btn ${!activeRuleId ? 'is-active' : ''}`}
              onClick={() => chooseRule('')}
              disabled={!rulesReady}
            >
              <Plus size={14} aria-hidden="true" />
              <span>Nova regra</span>
            </button>

            {rulesList.map((source) => (
              <button
                key={source.id}
                type="button"
                className={`csm-seg-btn ${activeRuleId === source.id ? 'is-active' : ''}`}
                onClick={() => chooseRule(source.id)}
                disabled={!rulesReady}
              >
                <span className="rv6-rule-name">{source.name}</span>
                <span className="rv6-rule-dot" data-on={source.isActive ? 'true' : 'false'} title={source.isActive ? 'Ativa' : 'Pausada'} />
              </button>
            ))}
          </div>

          {savedRule.current && (
            <dl className="rv6-settings">
              <div><dt>Intervalo</dt><dd>{savedRule.current.customDelaySeconds || 60}s</dd></div>
              <div><dt>Horário</dt><dd>{savedRule.current.is24Hours || (savedRule.current.startTime === '00:00' && (savedRule.current.endTime === '00:00' || savedRule.current.endTime === '23:59')) ? '24 horas' : `${savedRule.current.startTime || '08:00'} às ${savedRule.current.endTime || '22:00'}`}</dd></div>
              <div><dt>Ordem</dt><dd>{savedRule.current.dispatchOrder === 'aleatoria' ? 'Aleatória' : 'Em sequência'}</dd></div>
              <div><dt>Modelo</dt><dd>{savedRule.current.templateName || selectedTemplate}</dd></div>
            </dl>
          )}

          <button
            type="button"
            className="rp-btn rv6-gear"
            onClick={() => setShowSettingsModal(true)}
            aria-label="Abrir configurações avançadas do copiador"
            title="Configurações da automação (intervalo, horários, ordem e modelos)"
          >
            <Settings size={15} aria-hidden="true" />
            Ajustes
          </button>
        </div>
      </section>
      {!sharedWhatsApp.workspace && <p role="status" className="rp-panel" style={{ padding: 18 }}>{sharedWhatsApp.error || 'Carregando suas contas, grupos e regras salvas…'}</p>}

      {feedback && (
        <div
          className="rp-panel rp-section"
          style={{
            marginBottom: 20,
            borderColor: feedback.type === 'error' ? '#e05353' : feedback.type === 'warning' ? '#d97736' : '#56c288',
            background: feedback.type === 'error' ? '#2e1d1d' : feedback.type === 'warning' ? '#2e251a' : '#1b2d22',
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: '#f1f1f1' }}>{feedback.message}</p>
        </div>
      )}

      {picker && <CopierGroupPicker key={selectedConnectionId + ':' + picker} mode={picker} groups={groups}
        selected={picker === 'origin' ? (selectedOriginJid ? [selectedOriginJid] : []) : selectedDestJids}
        excludedJid={selectedOriginJid} connectionId={selectedConnectionId} ownerJid={activeConnection?.ownerJid}
        accountLabel={(activeConnection?.label || 'WhatsApp selecionado') + ' · ' + formatPhone(activeConnection?.phoneNumber)}
        loading={groupsLoading} error={groupError} onRefresh={() => void loadData(selectedConnectionId, true)} onClose={() => setPicker(null)}
        onConfirm={selection => { selectionEdited.current = true; if (picker === 'origin') { setSelectedOriginJid(selection[0]); setSelectedDestJids(previous => previous.filter(jid => jid !== selection[0])); } else setSelectedDestJids(selection); setPicker(null); }} />}

      <CopierRuntimeStatus workerActive={statusData?.queue?.isWorkerActive} connectionId={selectedConnectionId} />

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
                  onChange={() => { selectionEdited.current = true; setOperationMode('revisao_manual'); }}
                />
                Revisar antes de enviar (Recomendado para conferir fotos e textos)
              </label>

              <label className="rp-check">
                <input
                  type="radio"
                  name="rp-mode"
                  checked={operationMode === 'automatico'}
                  onChange={() => { selectionEdited.current = true; setOperationMode('automatico'); }}
                />
                Enviar automaticamente após validar links de afiliado
              </label>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#d0cfcd' }}>Modelo de mensagem (Template)</label>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#f5c542',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Settings size={13} />
                  Personalizar no modal
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                {Object.values(BUILTIN_TEMPLATES).map((tpl) => {
                  const isSelected = selectedTemplate === tpl.name;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      className={`csm-seg-btn ${isSelected ? 'is-active' : ''}`}
                      style={{ padding: '10px 8px', fontSize: 12, textAlign: 'center' }}
                      onClick={() => {
                        selectionEdited.current = true;
                        setSelectedTemplate(tpl.name);
                        if (savedRule.current) {
                          savedRule.current.templateText = tpl.templateText;
                          savedRule.current.templateName = tpl.name;
                        }
                      }}
                    >
                      {tpl.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <details className="rp-details" style={{ marginTop: 14 }}>
              <summary>Lojas autorizadas e regras de conversão</summary>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label className="rp-check">
                  <input
                    type="checkbox"
                    checked={allowedStores.includes('shopee')}
                    onChange={(e) => {
                      editAllowedStores((prev) =>
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
                      editAllowedStores((prev) =>
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
                      editAllowedStores((prev) =>
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
                      editAllowedStores((prev) =>
                        e.target.checked ? [...prev, 'netshoes'] : prev.filter((s) => s !== 'netshoes')
                      );
                    }}
                  />
                  Netshoes
                </label>
              </div>

              <div style={{ background: '#222221', padding: 12, borderRadius: 8, marginTop: 12, border: '1px solid #3d3c3b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f5c542', fontSize: 11, fontWeight: 600 }}>
                  <ShieldCheck size={14} />
                  PROTEÇÃO ANTI-CONCORRENTE OBRIGATÓRIA
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#b3b2af', lineHeight: 1.5 }}>
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
              <div style={{ position: 'relative', width: '100%', maxWidth: 220, aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: '1px solid #41403e', background: '#222221', marginBottom: 12 }}>
                <img
                  src="/scenarios/eletroeletronicos.png"
                  alt="Prévia de cenário de produto"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(30, 29, 27, 0.85)', padding: '2px 8px', borderRadius: 10, fontSize: 10, color: '#ebe6da', display: 'flex', alignItems: 'center', gap: 4, backdropFilter: 'blur(4px)', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
                  <span>🎯 @radar.ofertas.br1</span>
                </div>
              </div>
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
                <span className="rp-link" style={{ color: '#f5c542', fontWeight: 600 }}>
                  👉 Compre aqui: https://shope.ee/seu-afiliado
                </span>
              </p>
            </div>

            <p className="rp-sub" style={{ fontSize: 11 }}>
              O layout é gerado automaticamente aplicando seu template e o link de afiliado validado.
            </p>
          </div>

          {/* PASSO 4: Ativar Copiador */}
          <div className="rp-panel" style={{ border: isActiveRule ? '1px solid #2e7d56' : '1px solid #4a4948' }}>
            <span className="rp-step">Passo 04</span>
            <div className="rp-row" style={{ marginTop: 4 }}>
              <h2>Ativar Copiador</h2>
              <span className={`rp-tag ${isActiveRule ? 'rp-good' : 'rp-warn'}`}>
                {!rulesReady ? 'Carregando…' : !activeRuleId ? 'Nova configuração' : isActiveRule ? 'Monitoramento Ativo' : 'Copiador Pausado'}
              </span>
            </div>

            <p className="rp-sub" style={{ margin: '8px 0 16px' }}>
              {isActiveRule
                ? 'O Copiador está ativo! Todas as ofertas recebidas no grupo de origem serão processadas e enviadas para o grupo de destino de forma contínua e independente.'
                : 'Revise os passos 1, 2 e 3 e clique no botão abaixo para iniciar a automação em tempo real.'}
            </p>

            <div className="rp-actions">
              <button type="button" className="rp-btn" style={{ minHeight: 46 }} disabled={saving || !rulesReady || !selectedOriginJid || !selectedDestJids.length}
                onClick={() => void handleToggleCopier(isActiveRule)}>
                {saving ? 'Salvando…' : 'Salvar configurações'}
              </button>
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
                onClick={() => void handleToggleCopier()}
                disabled={saving || !rulesReady}
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

      {/* MODAL: Configurações da Automação (Intervalo, Horários, Ordem, Templates) */}
      <CopierSettingsModal
        isOpen={showSettingsModal}
        isRuleActive={isActiveRule}
        rule={savedRule.current}
        connectionId={selectedConnectionId}
        onClose={() => setShowSettingsModal(false)}
        onSave={handleSaveModalSettings}
        onPauseRule={handlePauseFromModal}
      />

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
                <Activity size={18} style={{ color: '#f5c542' }} />
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
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#a1a09d' }}>
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
                          background: '#201f1e',
                          border: '1px solid #3d3c3a',
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
                              <Radio size={14} style={{ color: '#f5c542' }} />
                            ) : (
                              <Send size={14} style={{ color: '#56c288' }} />
                            )}
                            <strong style={{ fontSize: 13, color: '#f1f1f1' }}>{event.title}</strong>
                            {event.store && (
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#333230', color: '#f5d784' }}>
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

                        <p style={{ margin: 0, fontSize: 12, color: '#b6b5b2', lineHeight: 1.5, wordBreak: 'break-word' }}>
                          {event.detail}
                        </p>

                        {event.mediaUrl && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', border: '1px solid #41403e', background: '#201f1e', flexShrink: 0 }}>
                              <img
                                src={event.mediaUrl}
                                alt="Mídia da publicação"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                              />
                            </div>
                            <span style={{ fontSize: 11, color: '#a2a19e' }}>Foto enviada com a publicação</span>
                          </div>
                        )}

                        {event.reason && (
                          <div
                            style={{
                              fontSize: 11,
                              color: isBlocked ? '#fca5a5' : '#a8a7a4',
                              background: isBlocked ? 'rgba(239, 68, 68, 0.1)' : '#2a2928',
                              padding: '4px 8px',
                              borderRadius: 6,
                              marginTop: 2,
                            }}
                          >
                            Motivo / Detalhe: {event.reason}
                          </div>
                        )}

                        <div style={{ fontSize: 10, color: '#898784', marginTop: 2 }}>
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
    <React.Suspense fallback={<div className="rp-page"><p style={{ color: "#a1a09d", padding: 40 }}>Carregando Modo Copiador...</p></div>}>
      <CopierContent />
    </React.Suspense>
  );
}
