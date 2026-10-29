'use client';

import React, { useEffect, useState } from 'react';
import { Users, UserPlus, UserMinus, MessageSquare, Clock, BarChart2, Info, RefreshCw } from 'lucide-react';
import { MetricCard } from '@/components/MetricCard';
import { StatusBadge } from '@/components/StatusBadge';

interface GroupData {
  id: string;
  groupJid: string;
  name: string;
  participantCount: number;
  isAdmin: boolean;
  isDestination: boolean;
  isOrigin: boolean;
  messagesSent: number;
  lastSyncedAt: string;
}

export default function AnalyticsGruposPage() {
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [selectedJid, setSelectedJid] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics/groups');
      const data = await res.json();
      if (data.ok && data.groups.length > 0) {
        setGroups(data.groups);
        if (!selectedJid) {
          setSelectedJid(data.groups[0].groupJid);
        }
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const current = groups.find((g) => g.groupJid === selectedJid) || groups[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] tracking-tight">
            Analytics dos Grupos WhatsApp
          </h1>
          <p className="text-xs sm:text-sm text-[#8EADC7] mt-0.5">
            Métricas de disparos confirmados e participantes monitorados na sua instância.
          </p>
        </div>

        {groups.length > 0 && (
          <select
            value={selectedJid}
            onChange={(e) => setSelectedJid(e.target.value)}
            className="min-h-[44px] bg-[#0D1B31] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2] self-start sm:self-auto"
          >
            {groups.map((g) => (
              <option key={g.groupJid} value={g.groupJid}>
                {g.name} ({g.participantCount} membros)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Banner Informativo */}
      <div className="rounded-2xl bg-[#0D1B31] border border-[#1CCAF2]/30 p-4 sm:p-5 flex items-start gap-3">
        <Info className="w-5 h-5 text-[#1CCAF2] flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h2 className="text-xs sm:text-sm font-bold text-[#F8FBFF]">
            Dados Reais de Disparos e Membros da Instância
          </h2>
          <p className="text-xs text-[#8EADC7] leading-relaxed">
            As mensagens enviadas correspondem aos jobs disparados e confirmados via WhatsApp pelo Radar de Ofertas para cada grupo. As taxas detalhadas de entrada/saída de membros (joins/leaves em tempo real) serão registradas conforme os eventos de grupo chegarem pelo webhook da Evolution API.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-[#8EADC7] text-xs">
          <RefreshCw className="w-6 h-6 animate-spin text-[#1CCAF2] mb-2" />
          <span>Carregando dados dos grupos...</span>
        </div>
      ) : !current ? (
        <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-8 text-center text-xs text-[#8EADC7]">
          Nenhum grupo sincronizado no momento. Conecte sua instância da Evolution API em Ajustes para sincronizar a lista de grupos autorizados.
        </div>
      ) : (
        <>
          {/* Métricas do Grupo Selecionado */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard
              title="Participantes Ativos"
              value={String(current.participantCount)}
              subtitle="Na última sincronização"
              icon={Users}
              color="#1CCAF2"
            />
            <MetricCard
              title="Mensagens Disparadas"
              value={String(current.messagesSent)}
              subtitle="Enviadas pelo Radar"
              icon={MessageSquare}
              color="#20C997"
            />
            <MetricCard
              title="Status do Grupo"
              value={current.isAdmin ? 'Admin' : 'Membro'}
              subtitle={current.isDestination ? 'Canal de Destino' : 'Canal Monitorado'}
              icon={BarChart2}
              color="#0879DF"
            />
            <MetricCard
              title="Horário Nobre"
              value="19:00 - 21:00"
              subtitle="Janela de maior abertura"
              icon={Clock}
              color="#F7B84B"
            />
          </div>

          <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 sm:p-5">
            <h2 className="text-sm font-bold text-[#F8FBFF] mb-2">Identificador Técnico do Grupo</h2>
            <div className="p-3 rounded-xl bg-[#061225] border border-[#18334D] font-mono text-xs text-[#1CCAF2] break-all">
              {current.groupJid}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
