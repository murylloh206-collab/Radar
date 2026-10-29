'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Send,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Share2,
  FileEdit,
  Sliders,
  Copy,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';
import { MetricCard } from '@/components/MetricCard';
import { StatusBadge } from '@/components/StatusBadge';
import { IncomingMessage, PublicationJob } from '@/lib/types';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    offersToday: 0,
    sentToday: 0,
    pendingReview: 0,
    scheduledJobs: 0,
    failedJobs: 0,
    successRatePct: 100,
  });
  const [waHealth, setWaHealth] = useState({
    status: 'disconnected',
    phoneNumber: '',
    batteryLevel: 0,
    profileName: '',
  });
  const [nextJob, setNextJob] = useState<{
    id: string;
    targetName: string;
    scheduledFor: string;
  } | null>(null);

  const [recentMessages, setRecentMessages] = useState<IncomingMessage[]>([]);
  const [recentJobs, setRecentJobs] = useState<PublicationJob[]>([]);

  const loadData = async () => {
    try {
      const [resStatus, resMsg, resJobs] = await Promise.all([
        fetch('/api/copier/status'),
        fetch('/api/copier/messages'),
        fetch('/api/copier/jobs'),
      ]);

      const dataStatus = await resStatus.json();
      const dataMsg = await resMsg.json();
      const dataJobs = await resJobs.json();

      if (dataStatus?.ok) {
        // Mapeamento compatível e seguro de saúde da conexão WhatsApp
        if (dataStatus.connection) {
          setWaHealth({
            status: dataStatus.connection.status || 'disconnected',
            phoneNumber: dataStatus.connection.phoneNumber || '',
            batteryLevel: dataStatus.connection.batteryLevel ?? 0,
            profileName: dataStatus.connection.profileName || '',
          });
        } else if (dataStatus.waHealth) {
          setWaHealth(dataStatus.waHealth);
        }

        // Mapeamento seguro de métricas do dashboard
        if (dataStatus.stats) {
          setStats(dataStatus.stats);
        } else if (dataStatus.queue || dataStatus.receiving) {
          const sent = dataStatus.queue?.sentTodayCount || 0;
          const failed = dataStatus.queue?.failedCount || 0;
          const totalDispatches = sent + failed;
          const successRate = totalDispatches > 0 ? Math.round((sent / totalDispatches) * 100) : 100;
          setStats({
            offersToday: dataStatus.receiving?.todayCount || 0,
            sentToday: sent,
            pendingReview: dataStatus.queue?.pendingReviewCount || 0,
            scheduledJobs: dataStatus.queue?.scheduledCount || 0,
            failedJobs: failed,
            successRatePct: successRate,
          });
        }

        // Mapeamento seguro de próximo envio
        if (dataStatus.nextJob) {
          setNextJob(dataStatus.nextJob);
        } else if (dataStatus.queue?.nextSendAt) {
          setNextJob({
            id: 'next_scheduled',
            targetName: 'Fila de Disparo',
            scheduledFor: dataStatus.queue.nextSendAt,
          });
        }
      }

      if (dataMsg?.ok && Array.isArray(dataMsg.messages)) {
        setRecentMessages(dataMsg.messages.slice(0, 5));
      }

      if (dataJobs?.ok && Array.isArray(dataJobs.jobs)) {
        setRecentJobs(dataJobs.jobs.slice(0, 5));
      }
    } catch (err) {
      console.error('Erro ao carregar dados do dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleApproveJob = async (jobId: string) => {
    try {
      await fetch('/api/copier/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', jobId }),
      });
      loadData();
    } catch {}
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0D1B31] via-[#0A2244] to-[#0D1B31] border border-[#18334D] p-5 sm:p-6 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-2 w-2 rounded-full bg-[#1CCAF2] animate-pulse" />
              <p className="text-xs font-bold uppercase tracking-wider text-[#1CCAF2]">
                Monitoramento em Tempo Real
              </p>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] tracking-tight">
              Radar de Ofertas
            </h1>
            <p className="text-xs sm:text-sm text-[#8EADC7] mt-1 max-w-xl">
              Captura inteligente, conversão oficial de afiliados e curadoria rigorosa com prova social para o WhatsApp.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href="/copiador"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#061225] border border-[#18334D] text-[#F8FBFF] text-xs font-bold hover:border-[#1CCAF2]/40 transition-all"
            >
              <Copy className="w-4 h-4 text-[#1CCAF2]" />
              <span>Modo Copiador</span>
            </Link>

            <Link
              href="/gerar-postagem"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] text-xs font-black shadow-lg shadow-[#1CCAF2]/20 hover:opacity-95 transition-all"
            >
              <Share2 className="w-4 h-4" />
              <span>Gerar Postagem</span>
            </Link>
          </div>
        </div>
      </div>

      {/* WhatsApp Health Status Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="md:col-span-2 rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
                waHealth?.status === 'connected'
                  ? 'bg-[#20C997]/15 border-[#20C997]/30 text-[#20C997]'
                  : 'bg-[#F87171]/15 border-[#F87171]/30 text-[#F87171]'
              }`}
            >
              {waHealth?.status === 'connected' ? (
                <CheckCircle2 className="w-6 h-6" />
              ) : (
                <AlertTriangle className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#F8FBFF]">
                  {waHealth?.phoneNumber ? `WhatsApp +${waHealth.phoneNumber}` : 'Conta WhatsApp'}
                </h3>
                <StatusBadge
                  label={waHealth?.status === 'connected' ? 'Conectado' : 'Desconectado'}
                  variant={waHealth?.status === 'connected' ? 'success' : 'danger'}
                  size="sm"
                />
              </div>
              <p className="text-xs text-[#8EADC7] mt-0.5">
                {waHealth?.profileName
                  ? `Nome do perfil: ${waHealth.profileName}`
                  : 'Nome do perfil não informado pelo gateway'}
                {waHealth?.batteryLevel ? ` • Bateria: ${waHealth.batteryLevel}%` : ''}
              </p>
            </div>
          </div>

          <Link
            href="/ajustes"
            className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#061225] border border-[#18334D] text-[#1CCAF2] hover:bg-[#122440] transition-colors"
          >
            Ajustar Gateway
          </Link>
        </div>

        {/* Próximo Envio */}
        <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#8EADC7]">
              Próximo Envio
            </span>
            <Clock className="w-4 h-4 text-[#1CCAF2]" />
          </div>

          <div className="mt-2">
            {nextJob ? (
              <div>
                <p className="text-sm font-bold text-[#F8FBFF] truncate">
                  {nextJob.targetName}
                </p>
                <p className="text-xs text-[#1CCAF2] font-semibold mt-0.5">
                  {new Date(nextJob.scheduledFor).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-[#8EADC7]">Nenhum disparo na fila imediata</p>
                <Link
                  href="/gerar-postagem"
                  className="text-xs font-bold text-[#1CCAF2] hover:underline mt-1 inline-block"
                >
                  Agendar agora →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <MetricCard
          title="Ofertas Hoje"
          value={stats.offersToday}
          subtitle="Detectadas pelo Copiador"
          icon={<Flame className="w-5 h-5" />}
          highlight={true}
        />
        <MetricCard
          title="Enviadas Hoje"
          value={stats.sentToday}
          subtitle="Para grupos VIP"
          icon={<Send className="w-5 h-5" />}
        />
        <MetricCard
          title="Revisão Manual"
          value={stats.pendingReview}
          subtitle="Aguardando curador"
          icon={<Clock className="w-5 h-5" />}
        />
        <MetricCard
          title="Taxa de Sucesso"
          value={`${stats.successRatePct}%`}
          subtitle={`${stats.failedJobs} falhas registradas`}
          icon={<TrendingUp className="w-5 h-5" />}
        />
      </div>

      {/* Atalhos Rápidos */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-[#8EADC7] mb-3">
          Ações Rápidas
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/gerar-postagem"
            className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-[#0D1B31] border border-[#18334D] hover:border-[#1CCAF2]/40 text-center transition-all group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#061225] border border-[#18334D] text-[#1CCAF2] group-hover:scale-105 transition-transform">
              <Share2 className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-[#F8FBFF] mt-2">Gerar Post</span>
            <span className="text-[10px] text-[#8EADC7]">Converter link cru</span>
          </Link>

          <Link
            href="/mensagem-avulsa"
            className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-[#0D1B31] border border-[#18334D] hover:border-[#1CCAF2]/40 text-center transition-all group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#061225] border border-[#18334D] text-[#1CCAF2] group-hover:scale-105 transition-transform">
              <FileEdit className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-[#F8FBFF] mt-2">Mensagem Avulsa</span>
            <span className="text-[10px] text-[#8EADC7]">Texto livre e mídia</span>
          </Link>

          <Link
            href="/copiador"
            className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-[#0D1B31] border border-[#18334D] hover:border-[#1CCAF2]/40 text-center transition-all group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#061225] border border-[#18334D] text-[#1CCAF2] group-hover:scale-105 transition-transform">
              <Copy className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-[#F8FBFF] mt-2">Copiador</span>
            <span className="text-[10px] text-[#8EADC7]">Origem e destinos</span>
          </Link>

          <Link
            href="/ajustes"
            className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-[#0D1B31] border border-[#18334D] hover:border-[#1CCAF2]/40 text-center transition-all group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#061225] border border-[#18334D] text-[#1CCAF2] group-hover:scale-105 transition-transform">
              <Sliders className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-[#F8FBFF] mt-2">Regras & Filtros</span>
            <span className="text-[10px] text-[#8EADC7]">Lojas e notas mínimas</span>
          </Link>
        </div>
      </div>

      {/* Duas colunas: Fila de Revisão Manual + Últimas Capturas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Coluna 1: Fila de Revisão Manual */}
        <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3.5">
            <div>
              <h3 className="text-sm font-bold text-[#F8FBFF]">Fila de Revisão Manual</h3>
              <p className="text-[11px] text-[#8EADC7]">Ofertas qualificadas aguardando clique de aprovação</p>
            </div>
            <Link href="/copiador" className="text-xs font-bold text-[#1CCAF2] hover:underline">
              Ver todos →
            </Link>
          </div>

          {recentJobs.filter((j) => j.status === 'aguardando_aprovacao' || j.status === 'rascunho')
            .length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[#8EADC7] bg-[#061225]/40 rounded-xl border border-[#18334D]/60">
              <CheckCircle2 className="w-8 h-8 text-[#20C997] mb-2 opacity-80" />
              <p className="text-xs font-semibold text-[#F8FBFF]">Fila de revisão zerada</p>
              <p className="text-[11px] text-[#8EADC7] mt-0.5">
                Nenhuma oferta pendente no momento. As novas mensagens de origem aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentJobs
                .filter((j) => j.status === 'aguardando_aprovacao' || j.status === 'rascunho')
                .map((job) => (
                  <div
                    key={job.id}
                    className="p-3 rounded-xl bg-[#061225] border border-[#18334D] flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#1CCAF2]">
                          Destino: {job.targetName}
                        </span>
                        <p className="text-xs font-bold text-[#F8FBFF] line-clamp-2 mt-0.5">
                          {job.messageText.split('\n')[2] || job.messageText.split('\n')[0]}
                        </p>
                      </div>
                      <StatusBadge label="Aguardando" variant="warning" size="sm" />
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-[#18334D]/60">
                      <span className="text-[10px] text-[#8EADC7]">
                        {new Date(job.createdAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <button
                        onClick={() => handleApproveJob(job.id)}
                        className="px-3 py-1 rounded-lg text-xs font-bold bg-[#20C997] text-[#061225] hover:opacity-90 transition-opacity"
                      >
                        Aprovar e Agendar
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Coluna 2: Últimas Mensagens Recebidas / Avaliações */}
        <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3.5">
            <div>
              <h3 className="text-sm font-bold text-[#F8FBFF]">Histórico de Mensagens</h3>
              <p className="text-[11px] text-[#8EADC7]">Últimos eventos do webhook e motivo de descarte/aprovação</p>
            </div>
            <Link href="/copiador" className="text-xs font-bold text-[#1CCAF2] hover:underline">
              Histórico →
            </Link>
          </div>

          {recentMessages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[#8EADC7] bg-[#061225]/40 rounded-xl border border-[#18334D]/60">
              <Clock className="w-8 h-8 text-[#8EADC7] mb-2 opacity-50" />
              <p className="text-xs font-semibold text-[#F8FBFF]">Aguardando mensagens da origem</p>
              <p className="text-[11px] text-[#8EADC7] mt-0.5">
                Envie uma mensagem no grupo cadastrado para testar a recepção ao vivo.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="p-2.5 rounded-xl bg-[#061225] border border-[#18334D] text-xs flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#F8FBFF] truncate">
                      {msg.extractedStore ? msg.extractedStore.toUpperCase() : 'MENSAGEM'}
                    </span>
                    <StatusBadge
                      label={msg.status === 'processada' ? 'Processada' : 'Descartada'}
                      variant={msg.status === 'processada' ? 'success' : 'neutral'}
                      size="sm"
                    />
                  </div>
                  <p className="text-[#8EADC7] text-[11px] line-clamp-1">
                    {msg.cleanText || msg.rawText}
                  </p>
                  {msg.discardReason && (
                    <p className="text-[10px] text-[#F87171] bg-[#F87171]/10 px-2 py-0.5 rounded">
                      Motivo: {msg.discardReason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
