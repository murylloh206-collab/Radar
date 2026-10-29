'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Copy,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Eye,
  Check,
  Users,
  Search,
  Settings,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  X,
  History,
  SlidersHorizontal,
  ChevronRight,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  CopyDestination,
  CopySource,
  IncomingMessage,
  PublicationJob,
  WhatsAppGroup,
} from '@/lib/types';

interface CopierStatusData {
  connection: {
    state: 'connected_now' | 'last_known_connection' | 'unreachable' | 'disconnected';
    label: string;
    status: string;
    lastPingAt: string | null;
    instanceName?: string;
    phoneNumber?: string;
    profileName?: string;
    batteryLevel?: number;
  };
  receiving: {
    status: 'ativo' | 'aguardando' | 'inativo';
    lastMessageReceivedAt: string | null;
    lastRealWebhookAt?: string | null;
    todayCount: number;
    totalCount: number;
  };
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
    latestOffer?: {
      receivedAt: string;
      textSnippet: string;
      store?: string;
      status: string;
    };
    latestPublication?: {
      sentAt: string;
      targetName: string;
      status: string;
    };
    blockReason?: string;
  };
  webhookDiagnosis?: {
    endpoint: string;
    hasSecret: boolean;
    lastRealWebhookAt: string | null;
    lastEventAt: string | null;
  };
}

export default function CopierPage() {
  const [sources, setSources] = useState<CopySource[]>([]);
  const [destinations, setDestinations] = useState<CopyDestination[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [messages, setMessages] = useState<IncomingMessage[]>([]);
  const [jobs, setJobs] = useState<PublicationJob[]>([]);
  const [copierStatus, setCopierStatus] = useState<CopierStatusData | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Estados do Assistente Mobile First
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);
  const [selectedOriginJid, setSelectedOriginJid] = useState('');
  const [selectedDestJids, setSelectedDestJids] = useState<string[]>([]);
  const [operationMode, setOperationMode] = useState<'revisao_manual' | 'automatico'>('revisao_manual');
  const [allowedStores, setAllowedStores] = useState<string[]>([
    'shopee',
    'mercadolivre',
    'netshoes',
    'amazon',
    'magalu',
  ]);
  const [templateText, setTemplateText] = useState(
    '🔥 *{titulo}*\n\nDe: ~R$ {preco_de}~\nPor apenas: *R$ {preco_por}* ({desconto})\n\n🛒 *Compre com segurança no link verificado:*\n{link}\n\n🎯 *Radar de Ofertas* — Melhores achadinhos'
  );
  const [customDelay, setCustomDelay] = useState(60);
  const [isActiveRule, setIsActiveRule] = useState(false);

  // Filtros de busca rápida nos seletores
  const [originSearch, setOriginSearch] = useState('');
  const [destSearch, setDestSearch] = useState('');

  // Gavetas / Drawers
  const [showMessagesDrawer, setShowMessagesDrawer] = useState(false);
  const [showWebhookDrawer, setShowWebhookDrawer] = useState(false);
  const [webhookData, setWebhookData] = useState<any>(null);
  const [isSyncingWebhook, setIsSyncingWebhook] = useState(false);
  const [webhookFeedback, setWebhookFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  // Carregar dados de forma consolidada e segura
  const loadData = useCallback(async () => {
    try {
      const [resSrc, resMsg, resJobs, resGroups, resStatus] = await Promise.all([
        fetch('/api/copier/sources'),
        fetch('/api/copier/messages?realOnly=true'),
        fetch('/api/copier/jobs'),
        fetch('/api/whatsapp/groups'),
        fetch('/api/copier/status'),
      ]);

      const dataSrc = await resSrc.json().catch(() => ({}));
      const dataMsg = await resMsg.json().catch(() => ({}));
      const dataJobs = await resJobs.json().catch(() => ({}));
      const dataGroups = await resGroups.json().catch(() => ({}));
      const dataStatus = await resStatus.json().catch(() => ({}));

      if (dataSrc.ok) {
        setSources(dataSrc.sources || []);
        setDestinations(dataSrc.destinations || []);

        // Preenche com a regra ativa existente ou a primeira do banco
        const primary = (dataSrc.sources || []).find((s: CopySource) => s.isActive) || dataSrc.sources?.[0];
        if (primary) {
          setActiveRuleId(primary.id);
          setSelectedOriginJid(primary.groupJid);
          const linkedDests = (dataSrc.destinations || [])
            .filter((d: CopyDestination) => d.sourceId === primary.id && d.isActive)
            .map((d: CopyDestination) => d.groupJid);
          setSelectedDestJids(linkedDests);
          setOperationMode(primary.operationMode || 'revisao_manual');
          if (Array.isArray(primary.allowedStores) && primary.allowedStores.length > 0) {
            setAllowedStores(primary.allowedStores);
          }
          if (primary.templateText) setTemplateText(primary.templateText);
          if (primary.customDelaySeconds) setCustomDelay(primary.customDelaySeconds);
          setIsActiveRule(Boolean(primary.isActive));
        }
      }

      if (dataGroups.ok && Array.isArray(dataGroups.groups)) {
        setGroups(dataGroups.groups);
      }
      if (dataMsg.ok && Array.isArray(dataMsg.messages)) {
        setMessages(dataMsg.messages);
      }
      if (dataJobs.ok && Array.isArray(dataJobs.jobs)) {
        setJobs(dataJobs.jobs);
      }
      if (dataStatus.ok) {
        setCopierStatus(dataStatus);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do Copiador:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Formatação de data/hora
  const formatTime = (iso?: string | null) => {
    if (!iso) return 'Nenhuma';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' de ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch {
      return iso;
    }
  };

  // Mapeamento de grupos para busca rápida
  const groupsMap = useMemo(() => {
    const map = new Map<string, WhatsAppGroup>();
    groups.forEach((g) => map.set(g.groupJid, g));
    return map;
  }, [groups]);

  // Grupos filtrados para Origem
  const filteredOriginGroups = useMemo(() => {
    return groups.filter((g) => {
      const query = originSearch.toLowerCase().trim();
      return !query || g.name.toLowerCase().includes(query);
    });
  }, [groups, originSearch]);

  // Grupos filtrados para Destino (somente onde pode postar)
  const filteredDestGroups = useMemo(() => {
    return groups.filter((g) => {
      if (g.groupJid === selectedOriginJid) return false; // Anti-loop: nunca origem
      const query = destSearch.toLowerCase().trim();
      return !query || g.name.toLowerCase().includes(query);
    });
  }, [groups, selectedOriginJid, destSearch]);

  // Itens na Fila de Aprovação (Modo Revisão Manual)
  const pendingReviewJobs = useMemo(() => {
    return jobs.filter((j) => j.status === 'aguardando_aprovacao' || j.status === 'rascunho');
  }, [jobs]);

  // Salvar configuração e opcionalmente alternar status ativo
  const handleSaveConfiguration = async (desiredActiveState?: boolean) => {
    if (!selectedOriginJid) {
      setFeedback({ type: 'error', message: 'Selecione o grupo de origem (de onde copiar).' });
      return;
    }
    if (selectedDestJids.length === 0) {
      setFeedback({ type: 'error', message: 'Selecione pelo menos um grupo de destino (para onde enviar).' });
      return;
    }

    // Validar permissão real nos destinos
    for (const destJid of selectedDestJids) {
      const grp = groupsMap.get(destJid);
      if (grp && (grp.canPost === false || grp.permissionStatus === 'restricted_readonly')) {
        setFeedback({
          type: 'error',
          message: `O grupo "${grp.name}" está restrito a administradores. A conta não tem permissão para publicar nele.`,
        });
        return;
      }
    }

    setSaving(true);
    setFeedback(null);

    const willBeActive = typeof desiredActiveState === 'boolean' ? desiredActiveState : isActiveRule;

    try {
      const originGroup = groupsMap.get(selectedOriginJid);
      const computedName = originGroup ? `Cópia: ${originGroup.name}` : 'Regra Copiador';

      const res = await fetch('/api/copier/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeRuleId || undefined,
          groupJid: selectedOriginJid,
          name: computedName,
          operationMode,
          allowedStores,
          stripThirdPartyLinks: true,
          stripExternalTags: true,
          customDelaySeconds: customDelay,
          templateText,
          destinationJids: selectedDestJids,
          isActive: willBeActive,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setIsActiveRule(willBeActive);
        if (data.source?.id) setActiveRuleId(data.source.id);
        setFeedback({
          type: 'success',
          message: willBeActive
            ? 'Copiador ATIVADO com sucesso! Monitorando o grupo em tempo real.'
            : 'Configurações salvas! Copiador está pausado.',
        });
        await loadData();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Falha ao salvar configuração.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro de comunicação ao salvar configuração.' });
    } finally {
      setSaving(false);
    }
  };

  // Alternar ativação do Copiador diretamente com 1 toque
  const handleToggleActive = async () => {
    if (!isActiveRule) {
      await handleSaveConfiguration(true);
    } else {
      if (!activeRuleId) return;
      setSaving(true);
      try {
        const res = await fetch('/api/copier/rules/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: activeRuleId, isActive: false }),
        });
        const data = await res.json();
        if (data.ok) {
          setIsActiveRule(false);
          setFeedback({ type: 'warning', message: 'Copiador pausado. Novas ofertas não serão publicadas.' });
          await loadData();
        } else {
          setFeedback({ type: 'error', message: data.error || 'Erro ao pausar copiador.' });
        }
      } catch {
        setFeedback({ type: 'error', message: 'Erro ao pausar copiador.' });
      } finally {
        setSaving(false);
      }
    }
  };

  // Alternar seleção de destino
  const handleToggleDestJid = (jid: string) => {
    setSelectedDestJids((prev) =>
      prev.includes(jid) ? prev.filter((id) => id !== jid) : [...prev, jid]
    );
  };

  // Alternar lojas permitidas
  const handleToggleStore = (store: string) => {
    setAllowedStores((prev) =>
      prev.includes(store) ? prev.filter((s) => s !== store) : [...prev, store]
    );
  };

  // Aprovar oferta na fila
  const handleApproveJob = async (jobId: string) => {
    try {
      const res = await fetch('/api/copier/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', jobId }),
      });
      const data = await res.json();
      if (data.ok) {
        setFeedback({ type: 'success', message: 'Oferta aprovada e enviada para o grupo de destino!' });
        await loadData();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Erro ao aprovar oferta.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao conectar ao servidor.' });
    }
  };

  // Descartar oferta na fila
  const handleCancelJob = async (jobId: string) => {
    try {
      const res = await fetch('/api/copier/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', jobId }),
      });
      const data = await res.json();
      if (data.ok) {
        setFeedback({ type: 'warning', message: 'Oferta descartada da fila.' });
        await loadData();
      }
    } catch {}
  };

  // Abrir gaveta técnica de webhook
  const handleOpenWebhookDiag = async () => {
    setShowWebhookDrawer(true);
    setWebhookFeedback(null);
    try {
      const res = await fetch('/api/whatsapp/webhook-config');
      const data = await res.json();
      if (data.ok) setWebhookData(data);
    } catch {}
  };

  // Forçar sincronização de Webhook
  const handleSyncWebhook = async () => {
    setIsSyncingWebhook(true);
    setWebhookFeedback(null);
    try {
      const res = await fetch('/api/whatsapp/webhook-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        setWebhookFeedback({ ok: true, message: data.message || 'Webhook configurado na Evolution API!' });
        if (data.warning) {
          setFeedback({ type: 'warning', message: data.warning });
        }
        await loadData();
      } else {
        setWebhookFeedback({ ok: false, message: data.error || 'Erro ao registrar webhook na Evolution.' });
      }
    } catch {
      setWebhookFeedback({ ok: false, message: 'Erro de conexão ao sincronizar webhook.' });
    } finally {
      setIsSyncingWebhook(false);
    }
  };

  // Resumo atual da rota
  const originGroupName = groupsMap.get(selectedOriginJid)?.name || copierStatus?.summary?.originName || 'Nenhum grupo de origem selecionado';
  const destGroupNames = selectedDestJids
    .map((jid) => groupsMap.get(jid)?.name || jid)
    .filter(Boolean);

  // Status visual consolidado
  const isConnected = copierStatus?.connection?.status === 'connected';
  const summaryState = copierStatus?.summary?.state || (isActiveRule ? 'aguardando_mensagens' : 'pausado');

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 animate-fade-in">
      {/* CABEÇALHO DA TELA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] tracking-tight">
              Copiador WhatsApp
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#1CCAF2]/15 text-[#1CCAF2] border border-[#1CCAF2]/30">
              Operação Real
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#8EADC7] mt-1">
            Escolha o grupo de origem, o destino, configure o tratamento e ative a cópia em tempo real.
          </p>
        </div>

        {/* Ações Rápidas no Topo */}
        <div className="flex items-center gap-2">
          {/* Botão Ver Últimas Mensagens */}
          <button
            onClick={() => setShowMessagesDrawer(true)}
            className="px-3.5 py-2 rounded-xl bg-[#0D1B31] border border-[#18334D] hover:border-[#1CCAF2]/40 text-[#F8FBFF] hover:text-[#1CCAF2] text-xs font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <History className="w-4 h-4 text-[#1CCAF2]" />
            <span>Ver últimas mensagens</span>
            {copierStatus?.receiving?.todayCount !== undefined && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-[#1CCAF2] text-[#061225]">
                {copierStatus.receiving.todayCount}
              </span>
            )}
          </button>

          {/* Estado de Conexão WhatsApp */}
          <Link
            href="/conexao-whatsapp"
            className="px-3 py-2 rounded-xl bg-[#061225] border border-[#18334D] hover:border-[#20C997]/40 text-xs text-[#8EADC7] hover:text-[#F8FBFF] transition-all flex items-center gap-1.5"
            title="Verificar pareamento do WhatsApp"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected ? 'bg-[#20C997] animate-pulse' : 'bg-[#F87171]'
              }`}
            />
            <span className="font-semibold hidden sm:inline">
              {isConnected ? 'WhatsApp Conectado' : 'Reconectar WhatsApp'}
            </span>
          </Link>
        </div>
      </div>

      {/* FEEDBACK GLOBAL */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs sm:text-sm flex items-start justify-between gap-3 animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-[#20C997]/10 border-[#20C997]/40 text-[#20C997]'
              : feedback.type === 'warning'
              ? 'bg-[#F7B84B]/10 border-[#F7B84B]/40 text-[#F7B84B]'
              : 'bg-[#F87171]/10 border-[#F87171]/40 text-[#F87171]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : feedback.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-current opacity-70 hover:opacity-100 p-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. RESUMO PERMANENTE OPERACIONAL                                          */}
      {/* ========================================================================= */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#0D1B31] to-[#0A1629] border border-[#18334D] shadow-xl relative overflow-hidden space-y-4">
        {/* Glow de fundo */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#1CCAF2]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#18334D]/80">
          {/* Rota Permanente Origem ➔ Destino */}
          <div className="space-y-1.5 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#8EADC7]">
              Fluxo Operacional Selecionado
            </span>
            <div className="flex items-center gap-2 flex-wrap text-sm sm:text-base font-bold text-[#F8FBFF]">
              <span className="px-2.5 py-1 rounded-xl bg-[#061225] border border-[#18334D] text-[#1CCAF2] truncate max-w-[240px]">
                {selectedOriginJid ? originGroupName : 'Escolha a Origem'}
              </span>
              <ArrowRight className="w-4 h-4 text-[#8EADC7] flex-shrink-0" />
              <span className="px-2.5 py-1 rounded-xl bg-[#061225] border border-[#18334D] text-[#20C997] truncate max-w-[260px]">
                {destGroupNames.length > 0
                  ? destGroupNames.length === 1
                    ? destGroupNames[0]
                    : `${destGroupNames[0]} (+${destGroupNames.length - 1})`
                  : 'Escolha o Destino'}
              </span>
              <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-[#18334D] text-[#8EADC7]">
                {operationMode === 'automatico' ? '⚡ Modo Automático' : '🛡️ Revisão Manual'}
              </span>
            </div>
          </div>

          {/* Badge do Estado Vivo do Copiador */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-[#061225] border border-[#18334D]">
              <span
                className={`w-3 h-3 rounded-full ${
                  summaryState === 'ativo'
                    ? 'bg-[#20C997] animate-pulse'
                    : summaryState === 'aguardando_mensagens'
                    ? 'bg-[#1CCAF2] animate-pulse'
                    : summaryState === 'pausado'
                    ? 'bg-[#F7B84B]'
                    : 'bg-[#F87171]'
                }`}
              />
              <span className="text-xs font-bold text-[#F8FBFF]">
                {summaryState === 'ativo'
                  ? 'Copiador Ativo'
                  : summaryState === 'aguardando_mensagens'
                  ? 'Aguardando Mensagens'
                  : summaryState === 'pausado'
                  ? 'Copiador Pausado'
                  : 'Bloqueado com Pendência'}
              </span>
            </div>

            {/* Botão Primário Ligar/Desligar Copiador */}
            <button
              onClick={handleToggleActive}
              disabled={saving || !selectedOriginJid || selectedDestJids.length === 0}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isActiveRule
                  ? 'bg-[#F7B84B] hover:bg-[#F7B84B]/90 text-[#061225]'
                  : 'bg-gradient-to-r from-[#20C997] to-[#1CCAF2] hover:opacity-95 text-[#061225]'
              }`}
            >
              {isActiveRule ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>Pausar Copiador</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Ativar Copiador</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Métricas e Últimas Atividades Permanentes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-2xl bg-[#061225] border border-[#18334D] flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold text-[#8EADC7] uppercase block">Última Oferta Recebida</span>
              <p className="font-semibold text-[#F8FBFF] truncate mt-0.5">
                {copierStatus?.summary?.latestOffer?.textSnippet || 'Nenhuma oferta recente capturada'}
              </p>
            </div>
            <span className="text-[11px] text-[#8EADC7] font-medium whitespace-nowrap">
              {formatTime(copierStatus?.summary?.latestOffer?.receivedAt)}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-[#061225] border border-[#18334D] flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold text-[#8EADC7] uppercase block">Última Publicação Realizada</span>
              <p className="font-semibold text-[#F8FBFF] truncate mt-0.5">
                {copierStatus?.summary?.latestPublication?.targetName || 'Nenhuma publicação realizada'}
              </p>
            </div>
            <span className="text-[11px] text-[#8EADC7] font-medium whitespace-nowrap">
              {formatTime(copierStatus?.summary?.latestPublication?.sentAt)}
            </span>
          </div>
        </div>

        {/* Motivo de Bloqueio (se houver) */}
        {copierStatus?.summary?.blockReason && (
          <div className="p-3 rounded-2xl bg-[#F7B84B]/10 border border-[#F7B84B]/30 flex items-center gap-2.5 text-xs text-[#F7B84B]">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{copierStatus.summary.blockReason}</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. FILA DE REVISÃO MANUAL (CASO HAJA OFERTAS PENDENTES DE APROVAÇÃO)      */}
      {/* ========================================================================= */}
      {pendingReviewJobs.length > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-[#0D1B31] border border-[#1CCAF2]/40 shadow-lg space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1CCAF2] animate-pulse" />
              <h2 className="text-sm sm:text-base font-bold text-[#F8FBFF]">
                Fila de Revisão Manual ({pendingReviewJobs.length} {pendingReviewJobs.length === 1 ? 'oferta' : 'ofertas'} aguardando aprovação)
              </h2>
            </div>
            <span className="text-xs text-[#8EADC7]">Aprove com 1 clique antes de publicar</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {pendingReviewJobs.map((job) => {
              const isBlockedWithoutAffiliate = !job.affiliateUrl || job.affiliateUrl.trim().length === 0;
              const hasWarningReason = Boolean(job.errorDetails && job.errorDetails.trim().length > 0);
              return (
                <div
                  key={job.id}
                  className={`p-4 rounded-2xl bg-[#061225] border space-y-3 ${
                    isBlockedWithoutAffiliate
                      ? 'border-[#F87171]/60'
                      : hasWarningReason
                      ? 'border-[#F7B84B]/50'
                      : 'border-[#18334D]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-[#1CCAF2] uppercase block">
                        Destino: {job.targetName || 'Grupo Destino'}
                      </span>
                      <p className="text-xs font-semibold text-[#F8FBFF] line-clamp-2 mt-1">
                        {job.messageText.split('\n')[0] || 'Oferta Capturada'}
                      </p>
                    </div>
                    {isBlockedWithoutAffiliate ? (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#F87171]/15 text-[#F87171] border border-[#F87171]/40 flex-shrink-0">
                        Bloqueado (Sem Link Próprio)
                      </span>
                    ) : hasWarningReason ? (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#F7B84B]/15 text-[#F7B84B] border border-[#F7B84B]/40 flex-shrink-0">
                        Link Montado (Sem Confirmação API)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/30 flex-shrink-0">
                        Link Próprio Confirmado
                      </span>
                    )}
                  </div>

                  {hasWarningReason && (
                    <div
                      className={`p-2.5 rounded-xl border text-[11px] flex items-start gap-2 ${
                        isBlockedWithoutAffiliate
                          ? 'bg-[#F87171]/10 border-[#F87171]/30 text-[#F87171]'
                          : 'bg-[#F7B84B]/10 border-[#F7B84B]/30 text-[#F7B84B]'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{job.errorDetails}</span>
                    </div>
                  )}

                  <div className="p-2.5 rounded-xl bg-[#0D1B31] border border-[#18334D] text-[11px] text-[#8EADC7] font-mono whitespace-pre-wrap max-h-28 overflow-y-auto">
                    {job.messageText}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#18334D]/60">
                    <button
                      onClick={() => handleCancelJob(job.id)}
                      className="px-3 py-1.5 rounded-xl bg-[#0D1B31] border border-[#18334D] hover:border-[#F87171] text-[#8EADC7] hover:text-[#F87171] text-xs font-semibold transition-all cursor-pointer"
                    >
                      Descartar
                    </button>
                    <button
                      onClick={() => handleApproveJob(job.id)}
                      disabled={isBlockedWithoutAffiliate}
                      className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all shadow-md flex items-center gap-1.5 ${
                        isBlockedWithoutAffiliate
                          ? 'bg-[#18334D] text-[#8EADC7]/50 cursor-not-allowed'
                          : 'bg-gradient-to-r from-[#20C997] to-[#1CCAF2] text-[#061225] hover:opacity-95 cursor-pointer'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {isBlockedWithoutAffiliate ? 'Envio Bloqueado' : 'Aprovar e Enviar Agora'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ASSISTENTE OPERACIONAL MOBILE FIRST EM 4 ETAPAS                        */}
      {/* ========================================================================= */}
      <div className="p-4 sm:p-6 rounded-3xl bg-[#0D1B31] border border-[#18334D] shadow-xl space-y-6">
        <div className="border-b border-[#18334D] pb-3">
          <h2 className="text-base sm:text-lg font-bold text-[#F8FBFF] flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-[#1CCAF2]" />
            <span>Configurar Fluxo de Cópia Operacional</span>
          </h2>
          <p className="text-xs text-[#8EADC7] mt-0.5">
            Siga os 4 passos objetivos para colocar o Copiador em funcionamento.
          </p>
        </div>

        {/* PASSO 1: DE QUAL GRUPO COPIAR? */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs sm:text-sm font-bold text-[#F8FBFF] flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#1CCAF2] text-[#061225] font-black text-xs flex items-center justify-center">
                1
              </span>
              <span>De qual grupo copiar? (Origem)</span>
            </label>
            <span className="text-[11px] text-[#8EADC7]">Grupos reais sincronizados</span>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-[#8EADC7] absolute left-3 top-3" />
              <input
                type="text"
                value={originSearch}
                onChange={(e) => setOriginSearch(e.target.value)}
                placeholder="Buscar grupo de origem pelo nome..."
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl pl-9 pr-3 py-2 text-xs text-[#F8FBFF] placeholder-[#8EADC7]/40 focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 p-1 rounded-2xl bg-[#061225] border border-[#18334D]">
              {filteredOriginGroups.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#8EADC7]">
                  Nenhum grupo encontrado com este nome.
                </div>
              ) : (
                filteredOriginGroups.map((g) => {
                  const isSelected = selectedOriginJid === g.groupJid;
                  return (
                    <button
                      key={g.groupJid}
                      type="button"
                      onClick={() => setSelectedOriginJid(g.groupJid)}
                      className={`w-full p-2.5 rounded-xl text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-[#0879DF]/20 border border-[#1CCAF2] text-[#F8FBFF]'
                          : 'bg-transparent hover:bg-[#0D1B31] border border-transparent text-[#8EADC7] hover:text-[#F8FBFF]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{g.name}</p>
                        <p className="text-[10px] text-[#8EADC7]/70">
                          {g.participantCount} participantes • {g.canPost ? 'Pode postar' : 'Somente leitura'}
                        </p>
                      </div>
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-[#1CCAF2] flex-shrink-0" />
                      ) : (
                        <span className="text-[11px] font-semibold text-[#8EADC7]/50">Selecionar</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* PASSO 2: PARA QUAL GRUPO ENVIAR? */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs sm:text-sm font-bold text-[#F8FBFF] flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#20C997] text-[#061225] font-black text-xs flex items-center justify-center">
                2
              </span>
              <span>Para qual grupo enviar? (Destino)</span>
            </label>
            <span className="text-[11px] text-[#8EADC7]">
              {selectedDestJids.length} {selectedDestJids.length === 1 ? 'destino selecionado' : 'destinos selecionados'}
            </span>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-[#8EADC7] absolute left-3 top-3" />
              <input
                type="text"
                value={destSearch}
                onChange={(e) => setDestSearch(e.target.value)}
                placeholder="Buscar grupo de destino pelo nome..."
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl pl-9 pr-3 py-2 text-xs text-[#F8FBFF] placeholder-[#8EADC7]/40 focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 p-1 rounded-2xl bg-[#061225] border border-[#18334D]">
              {filteredDestGroups.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#8EADC7]">
                  Nenhum grupo disponível como destino.
                </div>
              ) : (
                filteredDestGroups.map((g) => {
                  const isSelected = selectedDestJids.includes(g.groupJid);
                  const isRestricted = g.canPost === false || g.permissionStatus === 'restricted_readonly';

                  return (
                    <button
                      key={g.groupJid}
                      type="button"
                      disabled={isRestricted}
                      onClick={() => handleToggleDestJid(g.groupJid)}
                      className={`w-full p-2.5 rounded-xl text-left transition-all flex items-center justify-between gap-2 ${
                        isRestricted
                          ? 'opacity-40 cursor-not-allowed bg-transparent'
                          : isSelected
                          ? 'bg-[#20C997]/15 border border-[#20C997] text-[#F8FBFF] cursor-pointer'
                          : 'bg-transparent hover:bg-[#0D1B31] border border-transparent text-[#8EADC7] hover:text-[#F8FBFF] cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold truncate">{g.name}</p>
                          {g.isAdmin && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-[#20C997]/20 text-[#20C997]">
                              ADMIN
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#8EADC7]/70">
                          {isRestricted
                            ? 'Restrito a Administradores (envio bloqueado)'
                            : `${g.participantCount} participantes • Envio liberado`}
                        </p>
                      </div>

                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-[#20C997] flex-shrink-0" />
                      ) : (
                        <span className="text-[11px] font-semibold text-[#8EADC7]/50">
                          {isRestricted ? 'Bloqueado' : 'Adicionar'}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* PASSO 3: COMO TRATAR A OFERTA? */}
        <div className="space-y-4">
          <label className="text-xs sm:text-sm font-bold text-[#F8FBFF] flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#0879DF] text-[#F8FBFF] font-black text-xs flex items-center justify-center">
              3
            </span>
            <span>Como tratar a oferta?</span>
          </label>

          {/* Seleção do Modo de Operação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOperationMode('revisao_manual')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                operationMode === 'revisao_manual'
                  ? 'bg-[#0879DF]/20 border-[#1CCAF2] shadow-md shadow-[#1CCAF2]/10'
                  : 'bg-[#061225] border-[#18334D] hover:border-[#18334D]/80 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#F8FBFF] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#1CCAF2]" />
                  <span>Revisão Manual (Recomendado)</span>
                </span>
                {operationMode === 'revisao_manual' && (
                  <Check className="w-4 h-4 text-[#1CCAF2]" />
                )}
              </div>
              <p className="text-[11px] text-[#8EADC7] mt-1 leading-relaxed">
                As ofertas reais capturadas entram em fila de aprovação. Você aprova com 1 toque antes de postar no WhatsApp.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setOperationMode('automatico')}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                operationMode === 'automatico'
                  ? 'bg-[#20C997]/20 border-[#20C997] shadow-md shadow-[#20C997]/10'
                  : 'bg-[#061225] border-[#18334D] hover:border-[#18334D]/80 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#F8FBFF] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#20C997]" />
                  <span>Automático</span>
                </span>
                {operationMode === 'automatico' && (
                  <Check className="w-4 h-4 text-[#20C997]" />
                )}
              </div>
              <p className="text-[11px] text-[#8EADC7] mt-1 leading-relaxed">
                Publicação imediata assim que a oferta for validada com seu link de afiliado oficial e Arte Radar.
              </p>
            </button>
          </div>

          {/* Lojas Permitidas */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-[#8EADC7]">Lojas Permitidas para Cópia:</span>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { id: 'shopee', name: 'Shopee' },
                { id: 'mercadolivre', name: 'Mercado Livre' },
                { id: 'amazon', name: 'Amazon' },
                { id: 'magalu', name: 'Magalu' },
                { id: 'netshoes', name: 'Netshoes' },
              ].map((store) => {
                const checked = allowedStores.includes(store.id);
                return (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() => handleToggleStore(store.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      checked
                        ? 'bg-[#1CCAF2] text-[#061225] shadow-xs'
                        : 'bg-[#061225] border border-[#18334D] text-[#8EADC7]'
                    }`}
                  >
                    {store.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Template de Mensagem */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#8EADC7]">Template da Mensagem no WhatsApp:</span>
              <span className="text-[10px] text-[#8EADC7]">Variáveis: &#123;titulo&#125;, &#123;preco_por&#125;, &#123;link&#125;</span>
            </div>
            <textarea
              rows={4}
              value={templateText}
              onChange={(e) => setTemplateText(e.target.value)}
              className="w-full bg-[#061225] border border-[#18334D] rounded-2xl p-3 text-xs font-mono text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
            />
          </div>
        </div>

        {/* PASSO 4: ATIVAR OU PAUSAR COPIADOR */}
        <div className="pt-4 border-t border-[#18334D] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-[#8EADC7]">
            {isActiveRule ? (
              <span className="text-[#20C997] font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Copiador ativo e monitorando a origem</span>
              </span>
            ) : (
              <span className="text-[#F7B84B] font-semibold flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>Copiador pausado. Clique em Ativar para iniciar.</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleSaveConfiguration()}
              disabled={saving}
              className="flex-1 sm:flex-none px-4 py-3 rounded-2xl bg-[#061225] border border-[#18334D] hover:border-[#1CCAF2]/40 text-[#F8FBFF] text-xs font-bold transition-all cursor-pointer"
            >
              Salvar Alterações
            </button>

            <button
              type="button"
              onClick={handleToggleActive}
              disabled={saving || !selectedOriginJid || selectedDestJids.length === 0}
              className={`flex-1 sm:flex-none px-6 py-3 rounded-2xl text-xs sm:text-sm font-black transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isActiveRule
                  ? 'bg-[#F7B84B] hover:bg-[#F7B84B]/90 text-[#061225]'
                  : 'bg-gradient-to-r from-[#20C997] to-[#1CCAF2] hover:opacity-95 text-[#061225]'
              }`}
            >
              {isActiveRule ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>Pausar Copiador</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Ativar Copiador</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* RODAPÉ DISCRETO: DIAGNÓSTICO TÉCNICO */}
      <div className="flex items-center justify-between text-xs text-[#8EADC7]/70 pt-2 px-2">
        <span>Radar de Ofertas v1.0 • Operação Oficial</span>
        <button
          onClick={handleOpenWebhookDiag}
          className="hover:text-[#1CCAF2] underline cursor-pointer flex items-center gap-1"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Diagnóstico técnico do Webhook e Instância</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* GAVETA LATERAL (DRAWER): ÚLTIMAS MENSAGENS RECEBIDAS                       */}
      {/* ========================================================================= */}
      {showMessagesDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-xl h-full bg-[#0D1B31] border-l border-[#18334D] shadow-2xl flex flex-col animate-slide-in-right">
            {/* Topo da Gaveta */}
            <div className="p-4 sm:p-5 border-b border-[#18334D] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-[#1CCAF2]" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#F8FBFF]">
                    Últimas Mensagens do Grupo de Origem
                  </h3>
                  <p className="text-[11px] text-[#8EADC7]">
                    Mensagens reais recebidas via Evolution API
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMessagesDrawer(false)}
                className="p-1.5 rounded-xl bg-[#061225] border border-[#18334D] text-[#8EADC7] hover:text-[#F8FBFF] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo da Gaveta */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#8EADC7] space-y-2">
                  <MessageSquare className="w-8 h-8 text-[#8EADC7]/40 mx-auto" />
                  <p className="font-semibold text-[#F8FBFF]">Nenhuma mensagem registrada ainda</p>
                  <p>Assim que uma nova oferta for enviada no grupo de origem monitorado, ela aparecerá aqui em tempo real.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isProcessed = m.status === 'processada';
                  return (
                    <div
                      key={m.id || m.messageId}
                      className="p-3.5 rounded-2xl bg-[#061225] border border-[#18334D] space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#F8FBFF] truncate">
                          {m.originGroupName || m.remoteJid}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isProcessed
                              ? 'bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/30'
                              : 'bg-[#F7B84B]/15 text-[#F7B84B] border border-[#F7B84B]/30'
                          }`}
                        >
                          {isProcessed ? 'Processada' : 'Descartada'}
                        </span>
                      </div>

                      <p className="text-[#8EADC7] font-mono text-[11px] bg-[#0D1B31] p-2.5 rounded-xl border border-[#18334D]/60 whitespace-pre-wrap max-h-24 overflow-y-auto">
                        {m.rawText}
                      </p>

                      <div className="space-y-1 text-[11px]">
                        {m.extractedUrls && m.extractedUrls.length > 0 && (
                          <p className="text-[#8EADC7] truncate">
                            <strong className="text-[#F8FBFF]">Link Original:</strong> {m.extractedUrls[0]}
                          </p>
                        )}
                        {m.affiliateUrl && (
                          <p className="text-[#20C997] truncate">
                            <strong className="text-[#20C997]">Link Afiliado Convertido:</strong> {m.affiliateUrl}
                          </p>
                        )}
                        {m.discardReason && (
                          <p className="text-[#F87171]">
                            <strong>Motivo:</strong> {m.discardReason}
                          </p>
                        )}
                      </div>

                      <div className="text-[10px] text-[#8EADC7]/60 pt-1 border-t border-[#18334D]/50 flex items-center justify-between">
                        <span>Recebida em: {formatTime(m.receivedAt)}</span>
                        <span>ID: {m.messageId.substring(0, 16)}...</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* GAVETA LATERAL (DRAWER): DIAGNÓSTICO TÉCNICO E WEBHOOK                     */}
      {/* ========================================================================= */}
      {showWebhookDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg h-full bg-[#0D1B31] border-l border-[#18334D] shadow-2xl flex flex-col animate-slide-in-right">
            <div className="p-4 sm:p-5 border-b border-[#18334D] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#1CCAF2]" />
                <h3 className="text-sm sm:text-base font-bold text-[#F8FBFF]">
                  Diagnóstico Técnico do Webhook
                </h3>
              </div>
              <button
                onClick={() => setShowWebhookDrawer(false)}
                className="p-1.5 rounded-xl bg-[#061225] border border-[#18334D] text-[#8EADC7] hover:text-[#F8FBFF] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-[#061225] border border-[#18334D] space-y-2">
                <span className="font-bold text-[#F8FBFF] block">Status do Webhook na Evolution</span>
                <p className="text-[#8EADC7]">
                  Endpoint local: <code className="text-[#1CCAF2]">/api/webhook/evolution</code>
                </p>
                <p className="text-[#8EADC7]">
                  URL cadastrada na Evolution:{' '}
                  <code className="text-[#F8FBFF] break-all">
                    {webhookData?.webhookStatus?.url || 'Não configurada no gateway'}
                  </code>
                </p>
                <p className="text-[#8EADC7]">
                  Eventos ativos:{' '}
                  <span className="text-[#20C997]">
                    {webhookData?.webhookStatus?.events?.join(', ') || 'MESSAGES_UPSERT'}
                  </span>
                </p>
                <p className="text-[#8EADC7]">
                  Segredo validado: {webhookData?.isSecretConfigured ? '✅ Sim (ativo)' : '❌ Ausente'}
                </p>
              </div>

              {webhookFeedback && (
                <div
                  className={`p-3 rounded-xl border ${
                    webhookFeedback.ok
                      ? 'bg-[#20C997]/15 border-[#20C997] text-[#20C997]'
                      : 'bg-[#F87171]/15 border-[#F87171] text-[#F87171]'
                  }`}
                >
                  {webhookFeedback.message}
                </div>
              )}

              <div className="p-3.5 rounded-2xl bg-[#0879DF]/10 border border-[#1CCAF2]/30 text-[#8EADC7] space-y-1">
                <p className="font-bold text-[#F8FBFF]">💡 Dica sobre hospedagem no Render:</p>
                <p>
                  A Evolution API está hospedada no Render e precisa alcançar a URL pública HTTPS da sua aplicação. Se estiver rodando localmente (localhost), a Evolution não conseguirá entregar eventos até que haja uma URL pública (ex: Render, Vercel ou túnel Cloudflare).
                </p>
              </div>

              <button
                onClick={handleSyncWebhook}
                disabled={isSyncingWebhook}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] font-black transition-all shadow-md hover:opacity-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncingWebhook ? 'animate-spin' : ''}`} />
                <span>Registrar / Sincronizar Webhook na Evolution</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
