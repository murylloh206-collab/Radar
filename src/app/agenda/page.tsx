'use client';

import React, { useEffect, useState } from 'react';
import { Calendar, Clock, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Send } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { PublicationJob } from '@/lib/types';

export default function AgendaPage() {
  const [jobs, setJobs] = useState<PublicationJob[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [loading, setLoading] = useState(true);

  const loadJobs = async () => {
    try {
      const res = await fetch('/api/copier/jobs');
      const data = await res.json();
      if (data.ok) setJobs(data.jobs || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSendNow = async (jobId: string) => {
    try {
      const resJob = await fetch('/api/copier/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_now', jobId }),
      });
      const dataJob = await resJob.json();
      if (!dataJob.ok) {
        setFeedback({
          type: 'error',
          message: dataJob.error || 'Erro ao preparar mensagem para envio imediato.',
        });
        return;
      }

      const triggerRes = await fetch('/api/worker/trigger', { method: 'POST' });
      if (triggerRes.status === 401) {
        setFeedback({
          type: 'error',
          message: 'Ação não autorizada: É necessária uma sessão de administrador ativa para disparar o envio imediato. Por favor, autentique-se no painel.',
        });
        return;
      }

      if (!triggerRes.ok) {
        setFeedback({
          type: 'error',
          message: 'Falha ao acionar worker de envio imediato. Tente novamente.',
        });
        return;
      }

      setFeedback({
        type: 'success',
        message: 'Envio imediato acionado com sucesso!',
      });
      loadJobs();
    } catch {
      setFeedback({
        type: 'error',
        message: 'Erro de comunicação ao disparar envio imediato.',
      });
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      await fetch('/api/copier/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', jobId }),
      });
      loadJobs();
    } catch {}
  };

  const filtered = jobs.filter((j) => {
    if (filterStatus === 'todos') return true;
    return j.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#f6f2e8] tracking-tight">
            Agenda de Disparos
          </h1>
          <p className="text-xs sm:text-sm text-[#a8a39a] mt-0.5">
            Acompanhe postagens agendadas, disparadas e eventuais tentativas de reenvio.
          </p>
        </div>

        <button
          onClick={loadJobs}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#161616] border border-[#2c2c2c] text-[#a8a39a] hover:text-[#f5c542] self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Alerta de Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-[#5fd0a0]/15 border-[#5fd0a0]/30 text-[#5fd0a0]'
              : 'bg-[#f07878]/15 border-[#f07878]/30 text-[#f07878]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs hover:underline opacity-80 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { label: 'Todos', val: 'todos' },
          { label: 'Agendados', val: 'agendado' },
          { label: 'Aguardando Aprovação', val: 'aguardando_aprovacao' },
          { label: 'Enviados', val: 'enviado' },
          { label: 'Falhas', val: 'falha' },
          { label: 'Cancelados', val: 'cancelado' },
        ].map((item) => (
          <button
            key={item.val}
            onClick={() => setFilterStatus(item.val)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              filterStatus === item.val
                ? 'bg-[#f5c542] text-[#0c0c0d]'
                : 'bg-[#161616] border border-[#2c2c2c] text-[#a8a39a] hover:text-[#f6f2e8]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Lista de Jobs */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-[#161616] border border-[#2c2c2c] p-8 text-center text-[#a8a39a]">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs font-bold text-[#f6f2e8]">Nenhum disparo encontrado</p>
            <p className="text-[11px] mt-0.5">Nenhum job registrado com o filtro selecionado.</p>
          </div>
        ) : (
          filtered.map((job) => (
            <div
              key={job.id}
              className="rounded-2xl bg-[#161616] border border-[#2c2c2c] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[#f5c542]/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#f5c542]">
                    Destino: {job.targetName}
                  </span>
                  <StatusBadge
                    label={job.status.replace('_', ' ').toUpperCase()}
                    variant={
                      job.status === 'enviado'
                        ? 'success'
                        : job.status === 'agendado'
                        ? 'cyan'
                        : job.status === 'falha'
                        ? 'danger'
                        : 'warning'
                    }
                    size="sm"
                  />
                </div>

                <p className="text-xs text-[#f6f2e8] mt-1 line-clamp-2 leading-relaxed">
                  {job.messageText}
                </p>

                <div className="mt-2 flex items-center gap-3 text-[11px] text-[#a8a39a]">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Programado para: {new Date(job.scheduledFor).toLocaleString('pt-BR')}
                  </span>
                  {job.sentAt && (
                    <span className="text-[#5fd0a0]">
                      Disparado às: {new Date(job.sentAt).toLocaleTimeString('pt-BR')}
                    </span>
                  )}
                </div>

                {job.errorDetails && (
                  <p className="mt-1 text-[10px] text-[#f07878] bg-[#f07878]/10 px-2 py-0.5 rounded">
                    Erro: {job.errorDetails}
                  </p>
                )}
              </div>

              {/* Botões de Ação */}
              {job.status === 'agendado' || job.status === 'aguardando_aprovacao' ? (
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    onClick={() => handleCancel(job.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0c0c0d] border border-[#2c2c2c] text-[#a8a39a] hover:text-[#f07878]"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleSendNow(job.id)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#f5c542] text-[#0c0c0d] hover:opacity-90 flex items-center gap-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Disparar Agora</span>
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
