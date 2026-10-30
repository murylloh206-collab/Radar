'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  QrCode,
  Wifi,
  WifiOff,
  RefreshCw,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Users,
  Search,
  Star,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  LogOut,
  Play,
  Copy,
  Clock,
  Database,
} from 'lucide-react';
import { WhatsAppGroup } from '@/lib/types';

interface WhatsAppData {
  status: 'connected' | 'connecting' | 'disconnected';
  phoneNumber?: string;
  profileName?: string;
  batteryLevel?: number;
  qrCodeBase64?: string;
  hasApiKey: boolean;
  instanceName: string;
  lastPingAt?: string;
  verificationStatus?: 'verified' | 'unreachable' | 'timeout' | 'failed';
  verificationMessage?: string;
  lastVerificationError?: string;
}

export default function WhatsAppConnectionPage() {
  const [wa, setWa] = useState<WhatsAppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
    canRetry?: boolean;
  } | null>(null);

  // Grupos
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupsLive, setGroupsLive] = useState<boolean>(false);
  const [groupsCachedAt, setGroupsCachedAt] = useState<string | null>(null);
  const [groupsWarning, setGroupsWarning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'can_post' | 'read_only'>('all');

  // Controle de Polling Sequencial Seguro
  const inFlightRef = useRef<boolean>(false);
  const consecutiveErrorsRef = useRef<number>(0);
  const totalPollsRef = useRef<number>(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingActiveRef = useRef<boolean>(false);

  // Formatar data e hora local
  const formatDateTime = (isoDate?: string | null) => {
    if (!isoDate) return 'Ainda não registrada';
    try {
      const d = new Date(isoDate);
      if (isNaN(d.getTime())) return 'Data indisponível';
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoDate;
    }
  };

  // Buscar grupos (com identificação se veio ao vivo ou do cache)
  const loadGroups = useCallback(async (refresh = false) => {
    setLoadingGroups(true);
    try {
      const res = await fetch(`/api/whatsapp/groups${refresh ? '?refresh=true' : ''}`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.groups)) {
        setGroups(data.groups);
        setGroupsLive(Boolean(data.isLive));
        setGroupsCachedAt(data.cachedAt || null);
        setGroupsWarning(data.warning || null);
      } else {
        setGroupsWarning(data.error || 'Não foi possível consultar os grupos da conta conectada.');
      }
    } catch {
      setGroupsWarning('Não foi possível consultar os grupos da conta conectada.');
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  // Limpa agendamentos de polling pendentes
  const stopPolling = useCallback(() => {
    isPollingActiveRef.current = false;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Buscar status real da instância diretamente na Evolution API
  const loadStatus = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);

    try {
      const res = await fetch('/api/whatsapp/connect?check=true');
      const data = await res.json();

      if (data.ok && data.whatsapp) {
        setWa(data.whatsapp);
        setFeedback(null);
        consecutiveErrorsRef.current = 0;

        // Se a instância estiver conectada, sincroniza grupos imediatamente
        if (data.whatsapp.status === 'connected') {
          loadGroups(true);
        }
      } else {
        // Se houve erro ou timeout temporário
        if (data.whatsapp) {
          setWa(data.whatsapp);
        }

        const isUnreachable =
          data.reason === 'timeout' ||
          data.reason === 'unavailable' ||
          data.verificationStatus === 'unreachable' ||
          res.status === 504 ||
          res.status === 503;

        setFeedback({
          type: isUnreachable ? 'warning' : 'error',
          message:
            isUnreachable
              ? 'Não foi possível verificar agora. O gateway pode estar inicializando (cold start). A última conexão confirmada foi mantida.'
              : data.error || 'Falha ao consultar estado da instância no gateway.',
          canRetry: true,
        });
      }
    } catch {
      setFeedback({
        type: 'warning',
        message: 'Não foi possível verificar agora (tempo esgotado ou indisponibilidade). Sua conexão confirmada foi mantida.',
        canRetry: true,
      });
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [loadGroups]);

  // Consulta sequencial única durante pareamento / conexão (nunca dispara concorrente)
  const executeSequentialPoll = useCallback(async () => {
    if (!isPollingActiveRef.current) return;
    if (inFlightRef.current) {
      // Se já houver consulta pendente, aguarda 2s antes de tentar novamente
      pollTimerRef.current = setTimeout(executeSequentialPoll, 2000);
      return;
    }

    inFlightRef.current = true;
    totalPollsRef.current += 1;

    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'poll' }),
      });

      const data = await res.json();

      if (data.ok && data.whatsapp) {
        setWa(data.whatsapp);
        consecutiveErrorsRef.current = 0;

        if (data.whatsapp.status === 'connected') {
          // Conectou com sucesso: interrompe o loop
          stopPolling();
          setConnecting(false);
          setFeedback({
            type: 'success',
            message: 'WhatsApp conectado com sucesso! Seus grupos foram sincronizados automaticamente.',
          });
          loadGroups(true);
          return;
        }
      } else {
        consecutiveErrorsRef.current += 1;
      }
    } catch {
      consecutiveErrorsRef.current += 1;
    } finally {
      inFlightRef.current = false;
    }

    // Limites de segurança para parar o polling
    const MAX_CONSECUTIVE_ERRORS = 5;
    const MAX_TOTAL_POLLS = 15;

    if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
      stopPolling();
      setConnecting(false);
      setFeedback({
        type: 'warning',
        message: 'A verificação automática foi pausada após tentativas consecutivas sem resposta do gateway. Clique em "Tentar novamente" quando desejar.',
        canRetry: true,
      });
      return;
    }

    if (totalPollsRef.current >= MAX_TOTAL_POLLS) {
      stopPolling();
      setConnecting(false);
      setFeedback({
        type: 'warning',
        message: 'Tempo limite da leitura do QR Code excedido. Clique em "Tentar novamente" para gerar um novo código ou revalidar a conexão.',
        canRetry: true,
      });
      return;
    }

    // Intervalo progressivo após falha (Backoff exponencial: 3.5s -> 5.2s -> 7.8s -> até máx 15s)
    const baseInterval = 3500;
    const backoffMultiplier = Math.pow(1.5, Math.min(consecutiveErrorsRef.current, 4));
    const nextInterval = Math.round(Math.min(baseInterval * backoffMultiplier, 15000));

    if (isPollingActiveRef.current) {
      pollTimerRef.current = setTimeout(executeSequentialPoll, nextInterval);
    }
  }, [loadGroups, stopPolling]);

  // Carrega status ao montar o componente
  useEffect(() => {
    loadStatus();

    return () => {
      stopPolling();
    };
  }, [loadStatus, stopPolling]);

  // Gerencia o início e término do polling sequencial seguro quando 'connecting'
  useEffect(() => {
    if ((wa?.status === 'connecting' || connecting) && wa?.status !== 'connected') {
      isPollingActiveRef.current = true;
      consecutiveErrorsRef.current = 0;
      totalPollsRef.current = 0;

      // Agenda a primeira consulta sequencial após 3.5s
      if (!pollTimerRef.current) {
        pollTimerRef.current = setTimeout(executeSequentialPoll, 3500);
      }
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [wa?.status, connecting, executeSequentialPoll, stopPolling]);

  // Iniciar pareamento / QR Code (apenas quando desconectado de fato)
  const handleStartPairing = async () => {
    if (inFlightRef.current) return;

    // Se já estiver conectada, preserva a sessão e não gera novo QR Code
    if (wa?.status === 'connected') {
      setFeedback({
        type: 'success',
        message: 'A instância já está conectada e operacional! Grupos sincronizados.',
      });
      loadGroups(true);
      return;
    }

    setConnecting(true);
    setFeedback(null);
    inFlightRef.current = true;

    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_pairing' }),
      });
      const data = await res.json();

      if (data.ok) {
        setWa(data.whatsapp);
        if (data.pairingCode) setPairingCode(data.pairingCode);

        if (data.alreadyConnected || data.whatsapp?.status === 'connected') {
          setFeedback({
            type: 'success',
            message: 'WhatsApp já está conectado e pronto para uso! Grupos sincronizados.',
          });
          loadGroups(true);
        }
      } else {
        if (data.whatsapp) setWa(data.whatsapp);
        setFeedback({
          type: data.verificationStatus === 'unreachable' ? 'warning' : 'error',
          message: data.error || 'Não foi possível verificar o estado da instância no momento.',
          canRetry: true,
        });
      }
    } catch {
      setFeedback({
        type: 'warning',
        message: 'Não foi possível verificar agora antes do pareamento. Aguarde alguns instantes e clique em "Tentar novamente".',
        canRetry: true,
      });
    } finally {
      inFlightRef.current = false;
      setConnecting(false);
    }
  };

  // Desconectar
  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar esta conta de WhatsApp? Os envios automáticos serão pausados.')) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      const data = await res.json();
      if (data.ok && data.whatsapp) {
        setWa(data.whatsapp);
        setFeedback({ type: 'success', message: 'Conta do WhatsApp desconectada com sucesso.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao tentar desconectar.' });
    } finally {
      setLoading(false);
    }
  };

  // Marcar como Grupo de Teste
  const handleSetTestGroup = async (groupJid: string) => {
    try {
      const res = await fetch('/api/whatsapp/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_test_group', groupJid }),
      });
      const data = await res.json();
      if (data.ok) {
        setGroups(data.groups);
        setFeedback({ type: 'success', message: data.message || 'Grupo de teste atualizado com sucesso!' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao definir grupo de teste.' });
    }
  };

  // Filtragem de grupos por busca e papel
  const filteredGroups = groups.filter((g) => {
    const matchSearch = g.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchSearch) return false;

    if (roleFilter === 'can_post') return g.canPost === true;
    if (roleFilter === 'read_only') return g.canPost === false;
    return true;
  });

  const isConnected = wa?.status === 'connected';
  const isUnreachable = wa?.verificationStatus === 'unreachable' || wa?.verificationStatus === 'timeout';
  const hasQr = Boolean(wa?.qrCodeBase64 && wa.status !== 'connected');

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      {/* Topo / Título */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#18334D]">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#0879DF] to-[#1CCAF2] flex items-center justify-center text-[#061225] shadow-lg shadow-[#1CCAF2]/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] tracking-tight">
                Conexão WhatsApp
              </h1>
              <p className="text-xs sm:text-sm text-[#8EADC7]">
                Pareamento e sincronização segura de grupos para o Radar de Ofertas
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => loadStatus()}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-[#0D1B31] border border-[#18334D] hover:border-[#1CCAF2]/40 text-xs font-semibold text-[#8EADC7] hover:text-[#1CCAF2] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title="Revalidar estado da conexão"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#1CCAF2]' : ''}`} />
            <span>Verificar Agora</span>
          </button>

          <Link
            href="/copiador"
            className="px-3.5 py-2 rounded-xl bg-[#0D1B31] border border-[#18334D] hover:border-[#1CCAF2]/40 text-xs font-semibold text-[#8EADC7] hover:text-[#F8FBFF] transition-all flex items-center gap-2"
          >
            <Copy className="w-4 h-4 text-[#1CCAF2]" />
            <span>Ir ao Copiador</span>
          </Link>
        </div>
      </div>

      {/* Alertas de Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-[#20C997]/15 border-[#20C997]/30 text-[#20C997]'
              : feedback.type === 'warning'
              ? 'bg-[#F7B84B]/15 border-[#F7B84B]/30 text-[#F7B84B]'
              : 'bg-[#F87171]/15 border-[#F87171]/30 text-[#F87171]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <div className="flex items-center gap-3">
            {feedback.canRetry && (
              <button
                onClick={() => {
                  stopPolling();
                  loadStatus();
                  loadGroups(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-[#061225] border border-[#18334D] hover:border-[#1CCAF2] text-xs font-bold text-[#F8FBFF] transition-colors cursor-pointer flex items-center gap-1.5 flex-shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#1CCAF2]" />
                <span>Tentar novamente</span>
              </button>
            )}
            <button
              onClick={() => setFeedback(null)}
              className="text-xs hover:underline opacity-80 cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* CARD 1: ESTADO DA CONEXÃO & PAREAMENTO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Painel Esquerdo: Estado da Conexão */}
        <div className="lg:col-span-7 bg-[#0D1B31] border border-[#18334D] rounded-3xl p-5 sm:p-7 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-sm sm:text-base font-bold text-[#F8FBFF] flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-[#1CCAF2]" />
              <span>Status do Dispositivo</span>
            </h2>

            {/* Badges de Estado */}
            <div className="flex items-center gap-2">
              {isUnreachable ? (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#F7B84B]/15 text-[#F7B84B] border border-[#F7B84B]/30"
                  title="Gateway temporariamente indisponível ou tempo limite esgotado. A última conexão foi preservada."
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Não foi possível verificar agora</span>
                </span>
              ) : isConnected ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/30 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-[#20C997] animate-ping" />
                  <span>Conectado Online</span>
                </span>
              ) : hasQr ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#F7B84B]/15 text-[#F7B84B] border border-[#F7B84B]/30 animate-pulse">
                  <span>Aguardando Leitura...</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#F87171]/15 text-[#F87171] border border-[#F87171]/30">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Desconectado</span>
                </span>
              )}
            </div>
          </div>

          {/* ESTADO CONECTADO (OU ÚLTIMA CONEXÃO CONFIRMADA PRESERVADA) */}
          {isConnected && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-[#061225] border border-[#18334D] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-inner ${
                      isUnreachable
                        ? 'bg-[#F7B84B]/10 border-[#F7B84B]/40 text-[#F7B84B]'
                        : 'bg-gradient-to-tr from-[#20C997]/20 to-[#1CCAF2]/20 border-[#20C997]/40 text-[#20C997]'
                    }`}
                  >
                    <Wifi className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#F8FBFF]">
                        {wa?.phoneNumber ? `WhatsApp +${wa.phoneNumber}` : 'Conta WhatsApp conectada'}
                    </h3>
                      <p className="text-xs text-[#8EADC7] mt-0.5">
                        {wa?.profileName ? `Nome do perfil: ${wa.profileName}` : 'Nome do perfil não informado pelo gateway'}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                      {isUnreachable ? (
                        <span className="text-[#F7B84B] font-semibold flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Não foi possível verificar agora (preservado)</span>
                        </span>
                      ) : (
                        <span className="text-[#20C997] font-semibold flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Sessão ativa e sincronizada</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button
                    onClick={() => {
                      loadStatus();
                      loadGroups(true);
                    }}
                    disabled={loading || loadingGroups}
                    className="px-3.5 py-2 rounded-xl bg-[#0D1B31] border border-[#18334D] hover:border-[#1CCAF2]/40 text-xs font-semibold text-[#1CCAF2] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading || loadingGroups ? 'animate-spin' : ''}`} />
                    <span>Tentar novamente</span>
                  </button>

                  <button
                    onClick={handleDisconnect}
                    className="px-3.5 py-2 rounded-xl bg-[#F87171]/10 border border-[#F87171]/30 hover:bg-[#F87171]/20 text-xs font-semibold text-[#F87171] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Desconectar</span>
                  </button>
                </div>
              </div>

              {/* Informações da Conexão e Verificação */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-[#061225] border border-[#18334D]">
                  <p className="text-[11px] text-[#8EADC7] font-semibold flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#1CCAF2]" />
                    <span>Última Verificação</span>
                  </p>
                  <p className="text-xs font-bold text-[#F8FBFF] mt-1 truncate" title={wa?.lastPingAt}>
                    {formatDateTime(wa?.lastPingAt)}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#061225] border border-[#18334D]">
                  <p className="text-[11px] text-[#8EADC7] font-semibold flex items-center gap-1">
                    <Users className="w-3 h-3 text-[#20C997]" />
                    <span>Total de Grupos</span>
                  </p>
                  <p className="text-base font-black text-[#F8FBFF] mt-0.5">{groups.length}</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#061225] border border-[#18334D]">
                  <p className="text-[11px] text-[#8EADC7] font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-[#1CCAF2]" />
                    <span>Envio Liberado</span>
                  </p>
                  <p className="text-base font-black text-[#1CCAF2] mt-0.5">
                    {groups.filter((g) => g.canPost).length} grupos
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ESTADO AGUARDANDO QR CODE OU COM QR CODE GERADO */}
          {!isConnected && (
            <div className="space-y-6">
              {hasQr ? (
                <div className="flex flex-col items-center justify-center space-y-4 p-6 rounded-3xl bg-[#061225] border border-[#18334D]">
                  <div className="relative p-3 bg-white rounded-2xl shadow-2xl flex items-center justify-center">
                    {/* Imagem do QR Code */}
                    {wa?.qrCodeBase64?.startsWith('data:') ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={wa.qrCodeBase64}
                        alt="QR Code WhatsApp"
                        className="w-56 h-56 sm:w-64 sm:h-64 object-contain rounded-lg"
                      />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`data:image/png;base64,${wa?.qrCodeBase64}`}
                        alt="QR Code WhatsApp"
                        className="w-56 h-56 sm:w-64 sm:h-64 object-contain rounded-lg"
                      />
                    )}
                  </div>

                  {pairingCode && (
                    <div className="text-center">
                      <p className="text-xs text-[#8EADC7]">Código de Pareamento por Número:</p>
                      <p className="text-sm font-mono font-bold text-[#1CCAF2] tracking-widest mt-1 bg-[#0D1B31] px-3 py-1 rounded-lg border border-[#18334D]">
                        {pairingCode}
                      </p>
                    </div>
                  )}

                  <div className="text-center space-y-2">
                    <p className="text-xs font-semibold text-[#8EADC7] flex items-center justify-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-[#1CCAF2] animate-spin" />
                      <span>Aguardando leitura no WhatsApp... A tela mudará automaticamente.</span>
                    </p>

                    <div className="flex items-center justify-center gap-3 pt-1">
                      <button
                        onClick={handleStartPairing}
                        disabled={connecting}
                        className="px-4 py-2 rounded-xl bg-[#0D1B31] border border-[#18334D] hover:border-[#1CCAF2]/40 text-xs font-bold text-[#1CCAF2] transition-all cursor-pointer disabled:opacity-50"
                      >
                        {connecting ? 'Gerando novo QR...' : '🔄 Gerar Novo QR Code'}
                      </button>

                      <button
                        onClick={() => loadStatus()}
                        disabled={loading}
                        className="px-4 py-2 rounded-xl bg-[#0D1B31] border border-[#18334D] hover:border-[#1CCAF2]/40 text-xs font-bold text-[#8EADC7] hover:text-[#F8FBFF] transition-all cursor-pointer"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-3xl bg-[#061225] border border-[#18334D] text-center space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-[#0D1B31] border border-[#18334D] flex items-center justify-center text-[#1CCAF2] mx-auto shadow-xl">
                    <QrCode className="w-8 h-8" />
                  </div>

                  <div className="max-w-md mx-auto space-y-1.5">
                    <h3 className="text-base sm:text-lg font-bold text-[#F8FBFF]">
                      Pronto para Conectar o WhatsApp
                    </h3>
                    <p className="text-xs sm:text-sm text-[#8EADC7]">
                      Clique abaixo para validar o estado da instância e iniciar o pareamento direto pelo painel.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                      onClick={handleStartPairing}
                      disabled={connecting || loading}
                      className="w-full sm:w-auto px-6 py-3.5 rounded-2xl text-xs sm:text-sm font-bold bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] shadow-lg shadow-[#1CCAF2]/20 hover:opacity-95 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>{connecting ? 'Determinando estado...' : 'Iniciar Conexão do WhatsApp'}</span>
                    </button>

                    <button
                      onClick={() => loadStatus()}
                      disabled={loading}
                      className="w-full sm:w-auto px-5 py-3.5 rounded-2xl text-xs sm:text-sm font-semibold bg-[#0D1B31] border border-[#18334D] text-[#8EADC7] hover:text-[#1CCAF2] hover:border-[#1CCAF2]/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#1CCAF2]' : ''}`} />
                      <span>Tentar novamente</span>
                    </button>
                  </div>

                  {wa?.lastPingAt && (
                    <p className="text-[11px] text-[#8EADC7]/70 pt-2">
                      Última verificação bem-sucedida: {formatDateTime(wa.lastPingAt)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Painel Direito: Instruções no Celular */}
        <div className="lg:col-span-5 bg-[#0D1B31] border border-[#18334D] rounded-3xl p-5 sm:p-7 shadow-xl space-y-5">
          <h2 className="text-sm sm:text-base font-bold text-[#F8FBFF] flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[#1CCAF2]" />
            <span>Como Conectar pelo Celular</span>
          </h2>

          <div className="space-y-3.5">
            <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-[#061225] border border-[#18334D]">
              <div className="w-7 h-7 rounded-xl bg-[#0879DF]/20 text-[#1CCAF2] font-black text-xs flex items-center justify-center flex-shrink-0">
                1
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-[#F8FBFF]">Abra o WhatsApp no seu smartphone</p>
                <p className="text-[11px] text-[#8EADC7]">
                  Use a conta oficial que deseja utilizar para os disparos automáticos.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-[#061225] border border-[#18334D]">
              <div className="w-7 h-7 rounded-xl bg-[#0879DF]/20 text-[#1CCAF2] font-black text-xs flex items-center justify-center flex-shrink-0">
                2
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-[#F8FBFF]">Acesse os Aparelhos Conectados</p>
                <p className="text-[11px] text-[#8EADC7]">
                  Toque nos <strong className="text-[#F8FBFF]">três pontinhos</strong> (Android) ou em <strong className="text-[#F8FBFF]">Configurações</strong> (iPhone) e selecione <strong className="text-[#1CCAF2]">Aparelhos Conectados</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-[#061225] border border-[#18334D]">
              <div className="w-7 h-7 rounded-xl bg-[#0879DF]/20 text-[#1CCAF2] font-black text-xs flex items-center justify-center flex-shrink-0">
                3
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-[#F8FBFF]">Toque em &quot;Conectar um aparelho&quot;</p>
                <p className="text-[11px] text-[#8EADC7]">
                  Desbloqueie a tela com sua biometria ou PIN para habilitar a câmera.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-[#061225] border border-[#18334D]">
              <div className="w-7 h-7 rounded-xl bg-[#0879DF]/20 text-[#1CCAF2] font-black text-xs flex items-center justify-center flex-shrink-0">
                4
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-[#F8FBFF]">Aponte a câmera para o QR Code</p>
                <p className="text-[11px] text-[#8EADC7]">
                  Assim que a leitura for realizada, o Radar de Ofertas sincroniza os dados automaticamente.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#061225]/80 border border-[#18334D] space-y-1.5">
            <p className="text-xs font-bold text-[#1CCAF2] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#20C997]" />
              <span>Conexão Própria e Segura</span>
            </p>
            <p className="text-[11px] text-[#8EADC7] leading-relaxed">
              O pareamento é direto com seu WhatsApp. A instância oficial configurada no servidor é preservada mesmo durante instabilidades temporárias de rede.
            </p>
          </div>
        </div>
      </div>

      {/* CARD 2: LISTA DE GRUPOS SINCRONIZADOS */}
      <div className="bg-[#0D1B31] border border-[#18334D] rounded-3xl p-5 sm:p-7 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#18334D]">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-bold text-[#F8FBFF] flex items-center gap-2">
                <Users className="w-5 h-5 text-[#1CCAF2]" />
                <span>Grupos e Canais Acessíveis</span>
              </h2>

              {/* Indicador de Lista Atual vs Cache Local */}
              {groupsLive ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/30">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Atualizada ao vivo</span>
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#0879DF]/15 text-[#1CCAF2] border border-[#0879DF]/30"
                  title={`Última sincronização: ${formatDateTime(groupsCachedAt)}`}
                >
                  <Database className="w-3 h-3" />
                  <span>Em cache local</span>
                </span>
              )}
            </div>
            <p className="text-xs text-[#8EADC7] mt-0.5">
              Última sincronização da lista: <strong className="text-[#F8FBFF]">{formatDateTime(groupsCachedAt)}</strong>
            </p>
          </div>

          <button
            onClick={() => loadGroups(true)}
            disabled={loadingGroups}
            className="px-4 py-2.5 rounded-xl bg-[#061225] border border-[#18334D] hover:border-[#1CCAF2]/40 text-xs font-bold text-[#1CCAF2] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingGroups ? 'animate-spin' : ''}`} />
            <span>{loadingGroups ? 'Sincronizando Grupos...' : 'Sincronizar Grupos com Gateway'}</span>
          </button>
        </div>

        {groupsWarning && (
          <div className="rounded-xl border border-[#F7B84B]/40 bg-[#F7B84B]/10 px-4 py-3 text-xs text-[#F7B84B]">
            {groupsWarning}
          </div>
        )}

        {/* Guia Explicativo de Papéis no Radar de Ofertas */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#061225] border border-[#18334D] space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-[#1CCAF2]">
              Regras de Funcionamento dos Grupos
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-[#0D1B31] border border-[#18334D]/80 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#1CCAF2]">
                <span>📥</span>
                <span>Origem = Ler Ofertas</span>
              </div>
              <p className="text-[11px] text-[#8EADC7] leading-relaxed">
                Grupo onde você monitora promoções. O Radar captura as mensagens recebidas para converter seus links de afiliado.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#0D1B31] border border-[#18334D]/80 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#20C997]">
                <span>📤</span>
                <span>Destino = Grupos para Publicar</span>
              </div>
              <p className="text-[11px] text-[#8EADC7] leading-relaxed">
                Grupos onde sua conta possui permissão para enviar mensagens com suas ofertas e links de afiliado convertidos.
              </p>
            </div>
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#8EADC7] absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar grupo pelo nome..."
              className="w-full bg-[#061225] border border-[#18334D] rounded-xl pl-10 pr-3 py-2 text-xs text-[#F8FBFF] placeholder-[#8EADC7]/40 focus:outline-none focus:border-[#1CCAF2]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setRoleFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                roleFilter === 'all'
                  ? 'bg-[#1CCAF2] text-[#061225]'
                  : 'bg-[#061225] text-[#8EADC7] border border-[#18334D]'
              }`}
            >
              Todos ({groups.length})
            </button>
            <button
              onClick={() => setRoleFilter('can_post')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                roleFilter === 'can_post'
                  ? 'bg-[#20C997] text-[#061225]'
                  : 'bg-[#061225] text-[#8EADC7] border border-[#18334D]'
              }`}
            >
              Posso Publicar ({groups.filter((g) => g.canPost === true).length})
            </button>
            <button
              onClick={() => setRoleFilter('read_only')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                roleFilter === 'read_only'
                  ? 'bg-[#F7B84B] text-[#061225]'
                  : 'bg-[#061225] text-[#8EADC7] border border-[#18334D]'
              }`}
            >
              Somente Leitura ({groups.filter((g) => g.canPost === false).length})
            </button>
          </div>
        </div>

        {/* Lista de Grupos */}
        {loadingGroups ? (
          <div className="p-12 text-center text-xs text-[#8EADC7] space-y-2">
            <RefreshCw className="w-6 h-6 text-[#1CCAF2] animate-spin mx-auto" />
            <p>Sincronizando grupos da sua conta WhatsApp...</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#061225] border border-[#18334D] text-center space-y-2">
            <Users className="w-8 h-8 text-[#8EADC7]/40 mx-auto" />
            <p className="text-xs sm:text-sm font-semibold text-[#F8FBFF]">Nenhum grupo encontrado</p>
            <p className="text-xs text-[#8EADC7]">
              {searchQuery
                ? 'Nenhum grupo corresponde ao termo buscado.'
                : 'Conecte sua conta do WhatsApp e clique em "Sincronizar Grupos com Gateway".'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredGroups.map((group) => {
              const canPost = group.canPost === true;
              const isUnverified = group.permissionStatus === 'unverified' || (!group.permissionStatus && !group.isAdmin && !group.canPost);

              return (
                <div
                  key={group.id || group.groupJid}
                  className="p-4 rounded-2xl border transition-all space-y-3 bg-[#061225] border-[#18334D] hover:border-[#1CCAF2]/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#0D1B31] border border-[#18334D] flex items-center justify-center text-[#1CCAF2] flex-shrink-0 mt-0.5">
                        <Users className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-[#F8FBFF] truncate">
                          {group.name}
                        </h4>
                        <p className="text-[11px] text-[#8EADC7] mt-0.5">
                          {group.participantCount} participantes
                        </p>
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      {group.permissionStatus === 'verified_admin' || (group.isAdmin && canPost) ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/30">
                          <ShieldCheck className="w-3 h-3" />
                          <span>{group.roleDescription || 'Administrador'}</span>
                        </span>
                      ) : group.permissionStatus === 'verified_member' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#0879DF]/15 text-[#1CCAF2] border border-[#0879DF]/30">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Membro liberado</span>
                        </span>
                      ) : group.permissionStatus === 'restricted_readonly' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#F7B84B]/15 text-[#F7B84B] border border-[#F7B84B]/30" title="Grupo restrito: apenas administradores podem postar">
                          <ShieldAlert className="w-3 h-3" />
                          <span>Somente Leitura (Restrito)</span>
                        </span>
                      ) : isUnverified ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-neutral-800 text-[#8EADC7] border border-neutral-700" title="Identidade do participante pendente de verificação">
                          <Clock className="w-3 h-3 text-[#8EADC7]" />
                          <span>{group.isAnnounce ? 'Permissão não verificada (Restrito)' : 'Permissão não verificada'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#F7B84B]/15 text-[#F7B84B] border border-[#F7B84B]/30">
                          <ShieldAlert className="w-3 h-3" />
                          <span>Somente Leitura</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#18334D]/80 flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      {canPost ? (
                        <span className="text-[#20C997] font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Apto para Destino de Postagem</span>
                        </span>
                      ) : (
                        <span className="text-[#8EADC7] flex items-center gap-1">
                          <span>Apto como Origem de Cópia</span>
                        </span>
                      )}
                    </div>

                    <Link
                      href="/copiador"
                      className="px-2.5 py-1 rounded-lg bg-[#0D1B31] border border-[#18334D] hover:border-[#1CCAF2]/40 text-[#8EADC7] hover:text-[#1CCAF2] font-semibold transition-colors flex items-center gap-1"
                    >
                      <span>Usar no Copiador</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="p-4 rounded-2xl bg-[#061225] border border-[#18334D] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <p className="font-bold text-[#F8FBFF]">Grupos sincronizados prontos para a operação</p>
            <p className="text-[11px] text-[#8EADC7] mt-0.5">
              Escolha a origem de garimpo e o grupo de destino diretamente no Copiador WhatsApp.
            </p>
          </div>
          <Link
            href="/copiador"
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] font-bold shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 flex-shrink-0 cursor-pointer"
          >
            <span>Configurar Copiador Agora</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Área Opcional de Diagnóstico Técnico e Testes */}
        <details className="p-4 rounded-2xl bg-[#061225]/60 border border-[#18334D]/60 text-xs text-[#8EADC7] space-y-3">
          <summary className="font-bold text-[#8EADC7] hover:text-[#F8FBFF] cursor-pointer flex items-center justify-between">
            <span>⚙️ Diagnóstico Técnico e Opções Opcionais</span>
            <span className="text-[10px] uppercase font-semibold text-[#8EADC7]/60">Clique para expandir</span>
          </summary>
          <div className="pt-3 border-t border-[#18334D]/60 space-y-2 text-[11px]">
            <p><strong className="text-[#F8FBFF]">Instância Evolution:</strong> {wa?.instanceName || 'radar_ofertas'}</p>
            <p><strong className="text-[#F8FBFF]">Último Ping:</strong> {formatDateTime(wa?.lastPingAt)}</p>
            <p><strong className="text-[#F8FBFF]">Identificador da Conta (JID):</strong> {groups[0]?.userId || 'Conectado'}</p>
            <p className="text-[#8EADC7]/80">
              Esta área reúne parâmetros técnicos da Evolution API. A operação diária não necessita alterar esses dados.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
