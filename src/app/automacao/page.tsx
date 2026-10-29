'use client';

import React, { useEffect, useState } from 'react';
import {
  Zap,
  ListOrdered,
  Bot,
  Play,
  Pause,
  Plus,
  Clock,
  Sparkles,
  Sliders,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  Save,
  Check,
} from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';

export default function AutomacaoPage() {
  const [activeTab, setActiveTab] = useState<'fila' | 'lista' | 'curador'>('fila');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Estado da Fila
  const [filaAtiva, setFilaAtiva] = useState(true);
  const [filaLoja, setFilaLoja] = useState('shopee');
  const [filaIntervalo, setFilaIntervalo] = useState(45);
  const [filaDiversidade, setFilaDiversidade] = useState<'off' | 'moderate' | 'high'>('moderate');
  const [filaRepeticao, setFilaRepeticao] = useState(15);
  const [filaPausaNoturna, setFilaPausaNoturna] = useState(true);
  const [filaMinRating, setFilaMinRating] = useState(4.5);
  const [filaMinReviews, setFilaMinReviews] = useState(10);
  const [filaMinSales, setFilaMinSales] = useState(5);

  // Estado da Lista
  const [listas, setListas] = useState([
    {
      id: 'lst_1',
      name: 'Campanha Fim de Mês — Achados Shopee',
      itemsCount: 14,
      sentCount: 6,
      intervalMinutes: 30,
      status: 'ativa',
    },
  ]);

  // Estado do Curador (Assistente Estratégico por Regras)
  const [curatorAudience, setCuratorAudience] = useState(
    'Público focado em tecnologia, gadgets e casa inteligente buscando custo-benefício.'
  );
  const [curatorDailyLimit, setCuratorDailyLimit] = useState(20);
  const [curatorScheduleMode, setCuratorScheduleMode] = useState<'ia' | 'fixo'>('fixo');
  const [curatorActive, setCuratorActive] = useState(false);
  const [curatorStores, setCuratorStores] = useState<string[]>(['shopee', 'mercadolivre', 'netshoes']);

  // Carregar configurações persistidas do servidor
  useEffect(() => {
    fetch('/api/automation')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          if (data.queueCampaigns && data.queueCampaigns.length > 0) {
            const q = data.queueCampaigns[0];
            setFilaAtiva(q.isActive);
            setFilaLoja(q.storeName);
            setFilaIntervalo(q.sendIntervalMinutes);
            setFilaDiversidade(q.diversityMode || 'moderate');
            setFilaRepeticao(q.repeatAfterDays);
            setFilaPausaNoturna(q.nightPause);
            if (q.minRating) setFilaMinRating(q.minRating);
            if (q.minReviews) setFilaMinReviews(q.minReviews);
            if (q.minSales) setFilaMinSales(q.minSales);
          }
          if (data.listCampaigns && data.listCampaigns.length > 0) {
            setListas(
              data.listCampaigns.map((l: any) => ({
                id: l.id,
                name: l.name,
                itemsCount: l.totalItems || (l.items || []).length,
                sentCount: l.sentItems || 0,
                intervalMinutes: l.intervalMinutes || 30,
                status: l.status || 'ativa',
              }))
            );
          }
          if (data.curatorPlans && data.curatorPlans.length > 0) {
            const c = data.curatorPlans[0];
            setCuratorAudience(c.audienceProfile);
            setCuratorDailyLimit(c.dailyOffersLimit);
            setCuratorScheduleMode(c.scheduleMode);
            setCuratorActive(c.isActive);
            if (c.selectedStores) setCuratorStores(c.selectedStores);
          }
        }
      })
      .catch(() => {});
  }, []);

  const triggerSaveNotification = (msg: string) => {
    setSaveStatus(msg);
    setTimeout(() => setSaveStatus(null), 3500);
  };

  const handleSaveQueue = async (activeOverride?: boolean) => {
    const isAct = activeOverride !== undefined ? activeOverride : filaAtiva;
    try {
      const res = await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_queue',
          queueData: {
            id: 'queue_primary',
            name: 'Fila Contínua de Garimpo',
            storeName: filaLoja,
            sendIntervalMinutes: filaIntervalo,
            diversityMode: filaDiversidade,
            repeatAfterDays: filaRepeticao,
            nightPause: filaPausaNoturna,
            minRating: filaMinRating,
            minReviews: filaMinReviews,
            minSales: filaMinSales,
            isActive: isAct,
          },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        triggerSaveNotification('Configurações da Fila salvas no banco com sucesso!');
      }
    } catch {
      triggerSaveNotification('Erro ao persistir configurações da Fila.');
    }
  };

  const handleSaveCurator = async (activeOverride?: boolean) => {
    const isAct = activeOverride !== undefined ? activeOverride : curatorActive;
    try {
      const res = await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_curator',
          curatorData: {
            id: 'curator_primary',
            name: 'Plano do Curador Estratégico',
            audienceProfile: curatorAudience,
            dailyOffersLimit: curatorDailyLimit,
            scheduleMode: curatorScheduleMode,
            selectedStores: curatorStores,
            isActive: isAct,
          },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        triggerSaveNotification(
          isAct
            ? 'Plano do Curador Estratégico ativado e persistido!'
            : 'Plano do Curador Estratégico pausado e salvo.'
        );
      }
    } catch {
      triggerSaveNotification('Erro ao salvar plano do Curador.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] tracking-tight">
            Central de Automação
          </h1>
          <p className="text-xs sm:text-sm text-[#8EADC7] mt-0.5">
            Garimpo contínuo (Fila), disparos sequenciais programados (Lista) e curadoria estratégica por público (Curador).
          </p>
        </div>

        {saveStatus && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#20C997]/15 border border-[#20C997]/30 text-[#20C997] text-xs font-semibold animate-fade-in">
            <Check className="w-4 h-4" />
            <span>{saveStatus}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex rounded-2xl bg-[#0D1B31] border border-[#18334D] p-1.5 gap-1.5">
        <button
          onClick={() => setActiveTab('fila')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all min-h-[44px] ${
            activeTab === 'fila'
              ? 'bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] shadow-md shadow-[#1CCAF2]/15'
              : 'text-[#8EADC7] hover:text-[#F8FBFF]'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Fila (Garimpo)</span>
        </button>

        <button
          onClick={() => setActiveTab('lista')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all min-h-[44px] ${
            activeTab === 'lista'
              ? 'bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] shadow-md shadow-[#1CCAF2]/15'
              : 'text-[#8EADC7] hover:text-[#F8FBFF]'
          }`}
        >
          <ListOrdered className="w-4 h-4" />
          <span>Lista (Lote)</span>
        </button>

        <button
          onClick={() => setActiveTab('curador')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all min-h-[44px] ${
            activeTab === 'curador'
              ? 'bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] shadow-md shadow-[#1CCAF2]/15'
              : 'text-[#8EADC7] hover:text-[#F8FBFF]'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span>Curador Estratégico</span>
        </button>
      </div>

      {/* ABA 1: FILA */}
      {activeTab === 'fila' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#18334D] pb-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[#F8FBFF]">Configuração da Fila Contínua</h2>
                  <StatusBadge
                    label={filaAtiva ? 'Fila Operacional' : 'Fila Pausada'}
                    variant={filaAtiva ? 'success' : 'neutral'}
                    size="sm"
                  />
                </div>
                <p className="text-xs text-[#8EADC7] mt-0.5">
                  Garimpo autônomo respeitando intervalo, diversidade de produtos e filtros mínimos de qualidade.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const nextState = !filaAtiva;
                    setFilaAtiva(nextState);
                    handleSaveQueue(nextState);
                  }}
                  className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                    filaAtiva
                      ? 'bg-[#F87171]/15 text-[#F87171] border border-[#F87171]/30 hover:bg-[#F87171]/25'
                      : 'bg-[#20C997] text-[#061225] hover:opacity-90'
                  }`}
                >
                  {filaAtiva ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{filaAtiva ? 'Pausar Fila' : 'Ativar Fila'}</span>
                </button>

                <button
                  onClick={() => handleSaveQueue()}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-[#0D1B31] border border-[#1CCAF2]/40 text-[#1CCAF2] hover:bg-[#1CCAF2]/10 flex items-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Salvar</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-[#8EADC7] block mb-1">Marketplace Principal</label>
                <select
                  value={filaLoja}
                  onChange={(e) => setFilaLoja(e.target.value)}
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2.5 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                >
                  <option value="shopee">Shopee (Filtros de Vendas e Reputação)</option>
                  <option value="mercadolivre">Mercado Livre (Full & Melhores Preços)</option>
                  <option value="netshoes">Netshoes / Rakuten LinkShare</option>
                  <option value="amazon" disabled>Amazon (Aguardando Configuração)</option>
                  <option value="magalu" disabled>Magazine Luiza (Aguardando Configuração)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                  Intervalo entre Envios (Minutos)
                </label>
                <input
                  type="number"
                  min="15"
                  max="180"
                  value={filaIntervalo}
                  onChange={(e) => setFilaIntervalo(Number(e.target.value))}
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2.5 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                  Modo de Diversidade de Produtos
                </label>
                <select
                  value={filaDiversidade}
                  onChange={(e) => setFilaDiversidade(e.target.value as any)}
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2.5 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                >
                  <option value="off">Desligado (Pode repetir nicho)</option>
                  <option value="moderate">Moderado (Alterna categorias sequencialmente)</option>
                  <option value="high">Alto (Nunca posta dois nichos iguais seguidos)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                  Não Repetir o Mesmo Produto Antes de (Dias)
                </label>
                <input
                  type="number"
                  min="3"
                  max="60"
                  value={filaRepeticao}
                  onChange={(e) => setFilaRepeticao(Number(e.target.value))}
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2.5 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                  Nota Mínima do Produto
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="3.0"
                  max="5.0"
                  value={filaMinRating}
                  onChange={(e) => setFilaMinRating(Number(e.target.value))}
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2.5 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                  Avaliações Mínimas (Prova Social)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={filaMinReviews}
                  onChange={(e) => setFilaMinReviews(Number(e.target.value))}
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2.5 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                />
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-[#18334D] flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#F8FBFF]">
                <input
                  type="checkbox"
                  checked={filaPausaNoturna}
                  onChange={(e) => setFilaPausaNoturna(e.target.checked)}
                  className="rounded border-[#18334D] text-[#1CCAF2] focus:ring-0"
                />
                <span>Respeitar Pausa Noturna (Silêncio das 22h30 às 07h30)</span>
              </label>

              <button
                onClick={() => handleSaveQueue()}
                className="min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] shadow-md shadow-[#1CCAF2]/15 hover:opacity-95 transition-all flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Salvar Configurações</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: LISTA */}
      {activeTab === 'lista' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#18334D] pb-4 mb-4">
              <div>
                <h2 className="text-sm font-bold text-[#F8FBFF]">Campanhas em Lista (Lote Programado)</h2>
                <p className="text-xs text-[#8EADC7] mt-0.5">
                  Organize listas de produtos manuais para disparar em lote com intervalo constante.
                </p>
              </div>

              <button
                onClick={() => {
                  const novaLista = {
                    id: `lst_${Date.now()}`,
                    name: `Nova Lista #${listas.length + 1}`,
                    itemsCount: 0,
                    sentCount: 0,
                    intervalMinutes: 20,
                    status: 'ativa',
                  };
                  setListas([...listas, novaLista]);
                  triggerSaveNotification('Nova lista criada. Adicione links para iniciar os disparos.');
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Criar Nova Lista</span>
              </button>
            </div>

            <div className="space-y-3">
              {listas.map((lst) => (
                <div
                  key={lst.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-[#061225] border border-[#18334D] gap-3"
                >
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-[#F8FBFF]">{lst.name}</h3>
                    <div className="flex items-center gap-3 text-[11px] text-[#8EADC7] mt-1">
                      <span>Progresso: {lst.sentCount} de {lst.itemsCount} disparados</span>
                      <span>•</span>
                      <span>Intervalo: {lst.intervalMinutes} min</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadge
                      label={lst.status === 'ativa' ? 'Em Andamento' : 'Pausada'}
                      variant={lst.status === 'ativa' ? 'success' : 'neutral'}
                      size="sm"
                    />
                    <button
                      onClick={() => {
                        const nextStatus = lst.status === 'ativa' ? 'pausada' : 'ativa';
                        setListas(listas.map((l) => (l.id === lst.id ? { ...l, status: nextStatus } : l)));
                        triggerSaveNotification(`Lista ${lst.name} atualizada para: ${nextStatus}.`);
                      }}
                      className="min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0D1B31] border border-[#18334D] text-[#8EADC7] hover:text-[#1CCAF2]"
                    >
                      {lst.status === 'ativa' ? 'Pausar' : 'Retomar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: CURADOR ESTRATÉGICO */}
      {activeTab === 'curador' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#18334D] pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#1CCAF2]/15 text-[#1CCAF2]">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#F8FBFF]">Curador Estratégico por Regras</h2>
                  <p className="text-xs text-[#8EADC7]">
                    Algoritmo de planejamento baseado no perfil de audiência e horários nobres de engajamento
                  </p>
                </div>
              </div>

              <StatusBadge
                label={curatorActive ? 'Curador Operando' : 'Curador em Planejamento'}
                variant={curatorActive ? 'success' : 'neutral'}
                size="sm"
              />
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                  1. Descrição do Perfil e Interesses da sua Audiência
                </label>
                <textarea
                  rows={3}
                  value={curatorAudience}
                  onChange={(e) => setCuratorAudience(e.target.value)}
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl p-3 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                  placeholder="Ex: Pessoas interessadas em achadinhos de tecnologia, casa inteligente e cupons de desconto..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                    2. Volume Máximo de Ofertas por Dia
                  </label>
                  <select
                    value={curatorDailyLimit}
                    onChange={(e) => setCuratorDailyLimit(Number(e.target.value))}
                    className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2.5 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                  >
                    <option value={5}>5 ofertas/dia (Modo Leve)</option>
                    <option value={10}>10 ofertas/dia (Moderado)</option>
                    <option value={20}>20 ofertas/dia (Recomendado)</option>
                    <option value={30}>30 ofertas/dia (Alta Frequência)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                    3. Estratégia de Distribuição dos Horários
                  </label>
                  <select
                    value={curatorScheduleMode}
                    onChange={(e) => setCuratorScheduleMode(e.target.value as any)}
                    className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2.5 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                  >
                    <option value="fixo">Intervalo Uniforme (Espaçamento regular ao longo do dia)</option>
                    <option value="ia">Picos Nobres de Engajamento (11h-13h, 18h-21h)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-[#18334D] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs text-[#8EADC7]">
                  Plano com proteção anti-ban e filtro de repetição de produtos ativo.
                </span>

                <button
                  onClick={() => {
                    const nextAct = !curatorActive;
                    setCuratorActive(nextAct);
                    handleSaveCurator(nextAct);
                  }}
                  className={`min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    curatorActive
                      ? 'bg-[#F87171]/15 text-[#F87171] border border-[#F87171]/30 hover:bg-[#F87171]/25'
                      : 'bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] shadow-md shadow-[#1CCAF2]/15'
                  }`}
                >
                  {curatorActive ? 'Pausar Plano do Curador' : 'Ativar Plano do Curador'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
