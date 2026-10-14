"use client";

import { useMemo, useState } from "react";
import type { ScheduleDistribution, SchedulerMode, SchedulerSettings } from "@/lib/types";
import { IconClock, IconGear, IconSpinner, IconX } from "./icons";

interface SchedulerConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SchedulerSettings;
  onSave: (patch: Partial<SchedulerSettings>) => Promise<void>;
  isSaving: boolean;
}

export function SchedulerConfigModal({
  isOpen,
  onClose,
  settings,
  onSave,
  isSaving,
}: SchedulerConfigModalProps) {
  const [startHour, setStartHour] = useState(settings.startHour || "07:00");
  const [endHour, setEndHour] = useState(settings.endHour || "00:00");
  const [mode, setMode] = useState<SchedulerMode>(settings.mode || "interval_minutes");
  const [distribution, setDistribution] = useState<ScheduleDistribution>(settings.distribution || "fixed");
  const [dailyTarget, setDailyTarget] = useState<number>(settings.dailyTarget || 51);
  const [postsPerHour, setPostsPerHour] = useState<number>(settings.postsPerHour || 3);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(settings.intervalMinutes || 20);
  const [minPendingScore, setMinPendingScore] = useState<number>(settings.minPendingScore ?? 75);
  const [minAutoPublishScore, setMinAutoPublishScore] = useState<number>(
    settings.minAutoPublishScore ?? settings.minScore ?? 75
  );
  const [minManualPublishScore, setMinManualPublishScore] = useState<number>(settings.minManualPublishScore ?? 75);
  const [requireVerifiableDiscount, setRequireVerifiableDiscount] = useState<boolean>(
    settings.requireVerifiableDiscount ?? true
  );
  const [channelDestination, setChannelDestination] = useState<string>(
    settings.channelDestination || "Radar de Ofertas"
  );
  const [error, setError] = useState<string | null>(null);

  // Cálculo de Métricas e Preview de Horários em Tempo Real
  const preview = useMemo(() => {
    const [startH, startM] = (startHour || "07:00").split(":").map(Number);
    const startMinutes = (startH || 0) * 60 + (startM || 0);

    let endMinutes = 24 * 60;
    if (endHour && endHour !== "00:00" && endHour !== "24:00") {
      const [endH, endM] = endHour.split(":").map(Number);
      endMinutes = (endH || 0) * 60 + (endM || 0);
    }

    let totalWindowMinutes = 0;
    if (endMinutes > startMinutes) {
      totalWindowMinutes = endMinutes - startMinutes;
    } else {
      totalWindowMinutes = 24 * 60 - startMinutes + endMinutes;
    }
    totalWindowMinutes = Math.max(60, totalWindowMinutes);

    let calculatedInterval = 20;
    let totalPosts = 51;

    if (mode === "daily_target") {
      const target = Math.max(1, Math.min(150, dailyTarget || 30));
      calculatedInterval = Math.max(5, Math.floor(totalWindowMinutes / target));
      totalPosts = target;
    } else if (mode === "posts_per_hour") {
      const pph = Math.max(1, Math.min(30, postsPerHour || 2));
      calculatedInterval = Math.max(2, Math.round(60 / pph));
      totalPosts = Math.max(1, Math.floor(totalWindowMinutes / calculatedInterval));
    } else {
      // interval_minutes
      const interval = Math.max(5, Math.min(360, intervalMinutes || 20));
      calculatedInterval = interval;
      totalPosts = Math.max(1, Math.floor(totalWindowMinutes / interval));
    }

    // Gera lista dos próximos horários do dia
    const sampleSlots: string[] = [];
    let curMinute = startMinutes;
    for (let i = 0; i < Math.min(totalPosts, 12); i++) {
      let slotMinute = curMinute;
      if (distribution === "randomized" && i > 0) {
        // Exemplo visual do jitter
        const jitter = (i % 2 === 0 ? 1 : -1) * Math.min(2, Math.max(1, Math.floor(calculatedInterval / 10)));
        slotMinute = Math.max(startMinutes, slotMinute + jitter);
      }
      const norm = slotMinute % (24 * 60);
      const h = Math.floor(norm / 60);
      const m = norm % 60;
      sampleSlots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      curMinute += calculatedInterval;
      if (curMinute >= startMinutes + totalWindowMinutes) break;
    }

    const windowHours = Math.floor(totalWindowMinutes / 60);
    const windowRemMin = totalWindowMinutes % 60;
    const windowText = `${windowHours}h${windowRemMin > 0 ? ` ${windowRemMin}m` : ""}`;

    return {
      totalWindowMinutes,
      windowText,
      calculatedInterval,
      totalPosts,
      sampleSlots,
    };
  }, [startHour, endHour, mode, distribution, dailyTarget, postsPerHour, intervalMinutes]);

  if (!isOpen) return null;

  async function handleSave() {
    setError(null);
    try {
      await onSave({
        startHour,
        endHour,
        mode,
        distribution,
        dailyTarget: Number(dailyTarget),
        postsPerHour: Number(postsPerHour),
        intervalMinutes: Number(intervalMinutes),
        minScore: Number(minAutoPublishScore),
        minPendingScore: Number(minPendingScore),
        minAutoPublishScore: Number(minAutoPublishScore),
        minManualPublishScore: Number(minManualPublishScore),
        requireVerifiableDiscount: Boolean(requireVerifiableDiscount),
        channelDestination: channelDestination.trim() || "Radar de Ofertas",
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar configurações.");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-scheduler-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
    >
      <div className="glass relative flex flex-col w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-3xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/80">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30">
              <IconGear width={18} height={18} />
            </div>
            <div>
              <h2 id="modal-scheduler-title" className="text-base font-bold text-white sm:text-lg">
                Configurações do Agendador
              </h2>
              <p className="text-[11px] text-slate-400">
                Fuso horário: <strong className="text-slate-300">America/Sao_Paulo (UTC-3)</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <IconX width={18} height={18} />
          </button>
        </div>

        {/* Conteúdo com rolagem suave */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 space-y-5">
          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* 1. Janela Operacional */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <IconClock width={14} height={14} className="text-sky-400" /> Janela Operacional de Publicação
            </h3>
            <p className="text-[11px] text-slate-400">
              O agendador apenas publica automaticamente dentro deste período. Publicações manuais podem ser feitas a qualquer hora.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label htmlFor="sched-start-hour" className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Horário Inicial (Padrão: 07:00)
                </label>
                <input
                  id="sched-start-hour"
                  type="time"
                  value={startHour}
                  onChange={(e) => setStartHour(e.target.value)}
                  className="field text-sm py-2"
                />
              </div>
              <div>
                <label htmlFor="sched-end-hour" className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Horário Final (Padrão: 00:00)
                </label>
                <input
                  id="sched-end-hour"
                  type="time"
                  value={endHour}
                  onChange={(e) => setEndHour(e.target.value)}
                  className="field text-sm py-2"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-0.5">
              <span>Duração total da janela diária:</span>
              <strong className="text-emerald-300 font-mono">{preview.windowText} ({preview.totalWindowMinutes} min)</strong>
            </div>
          </section>

          {/* 2. Modos de Agendamento (Mutuamente Exclusivos) */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Modo de Agendamento (Escolha 1 de 3)
            </h3>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {/* Opção 1: Meta Diária */}
              <label
                className={`relative flex flex-col justify-between rounded-2xl border p-3 cursor-pointer transition ${
                  mode === "daily_target"
                    ? "border-emerald-400 bg-emerald-500/15 text-white ring-1 ring-emerald-400"
                    : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">1. Meta Diária</span>
                  <input
                    type="radio"
                    name="scheduler_mode"
                    value="daily_target"
                    checked={mode === "daily_target"}
                    onChange={() => setMode("daily_target")}
                    className="accent-emerald-400"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  Distribui uma quantidade fixa de anúncios ao longo do dia.
                </p>
                {mode === "daily_target" && (
                  <div className="mt-2 pt-2 border-t border-emerald-400/20">
                    <span className="block text-[10px] text-slate-300 mb-1">Posts no dia:</span>
                    <input
                      type="number"
                      min={1}
                      max={150}
                      value={dailyTarget}
                      onChange={(e) => setDailyTarget(Number(e.target.value))}
                      className="field text-xs py-1 text-center font-bold"
                    />
                  </div>
                )}
              </label>

              {/* Opção 2: Posts por Hora */}
              <label
                className={`relative flex flex-col justify-between rounded-2xl border p-3 cursor-pointer transition ${
                  mode === "posts_per_hour"
                    ? "border-emerald-400 bg-emerald-500/15 text-white ring-1 ring-emerald-400"
                    : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">2. Posts por Hora</span>
                  <input
                    type="radio"
                    name="scheduler_mode"
                    value="posts_per_hour"
                    checked={mode === "posts_per_hour"}
                    onChange={() => setMode("posts_per_hour")}
                    className="accent-emerald-400"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  Calcula o intervalo com base na quantidade por hora.
                </p>
                {mode === "posts_per_hour" && (
                  <div className="mt-2 pt-2 border-t border-emerald-400/20">
                    <span className="block text-[10px] text-slate-300 mb-1">Posts a cada hora:</span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={postsPerHour}
                      onChange={(e) => setPostsPerHour(Number(e.target.value))}
                      className="field text-xs py-1 text-center font-bold"
                    />
                  </div>
                )}
              </label>

              {/* Opção 3: Intervalo entre Posts */}
              <label
                className={`relative flex flex-col justify-between rounded-2xl border p-3 cursor-pointer transition ${
                  mode === "interval_minutes"
                    ? "border-emerald-400 bg-emerald-500/15 text-white ring-1 ring-emerald-400"
                    : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">3. Intervalo Fixo</span>
                  <input
                    type="radio"
                    name="scheduler_mode"
                    value="interval_minutes"
                    checked={mode === "interval_minutes"}
                    onChange={() => setMode("interval_minutes")}
                    className="accent-emerald-400"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  Define o intervalo exato em minutos entre publicações.
                </p>
                {mode === "interval_minutes" && (
                  <div className="mt-2 pt-2 border-t border-emerald-400/20">
                    <span className="block text-[10px] text-slate-300 mb-1">Minutos de intervalo:</span>
                    <input
                      type="number"
                      min={5}
                      max={360}
                      step={5}
                      value={intervalMinutes}
                      onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                      className="field text-xs py-1 text-center font-bold"
                    />
                  </div>
                )}
              </label>
            </div>
          </section>

          {/* 3. Tipo de Distribuição */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Distribuição Temporal
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition ${
                  distribution === "fixed"
                    ? "border-sky-400 bg-sky-500/15 text-white"
                    : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                }`}
              >
                <input
                  type="radio"
                  name="distribution_type"
                  value="fixed"
                  checked={distribution === "fixed"}
                  onChange={() => setDistribution("fixed")}
                  className="mt-0.5 accent-sky-400"
                />
                <div>
                  <span className="block text-xs font-bold">Agenda Fixa</span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    Horários previsíveis e distribuídos uniformemente.
                  </span>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition ${
                  distribution === "randomized"
                    ? "border-purple-400 bg-purple-500/15 text-white"
                    : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                }`}
              >
                <input
                  type="radio"
                  name="distribution_type"
                  value="randomized"
                  checked={distribution === "randomized"}
                  onChange={() => setDistribution("randomized")}
                  className="mt-0.5 accent-purple-400"
                />
                <div>
                  <span className="block text-xs font-bold">Aleatória Controlada</span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    Variação natural suave anti-rajada sem ultrapassar a meta.
                  </span>
                </div>
              </label>
            </div>
          </section>

          {/* 4. Regras de Qualidade e Limites de Score */}
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Limites de Qualidade e Score (0–100)
            </h3>

            {/* 4.1. Entrada na Fila (Pendentes) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="sched-min-pending" className="text-xs font-semibold text-slate-200">
                  Mínimo para Entrada na Fila (Pendentes):
                </label>
                <span className="rounded-lg bg-emerald-500/20 px-2 py-0.5 text-xs font-black text-emerald-300 border border-emerald-500/30">
                  {minPendingScore}/100
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Score mínimo para entrar na aba Pendentes. Ofertas abaixo deste score vão diretamente para Rejeitados.
              </p>
              <input
                id="sched-min-pending"
                type="range"
                min={50}
                max={95}
                step={1}
                value={minPendingScore}
                onChange={(e) => setMinPendingScore(Number(e.target.value))}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            {/* 4.2. Publicação Automática */}
            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between">
                <label htmlFor="sched-min-auto" className="text-xs font-semibold text-slate-200">
                  Mínimo para Publicação Automática (Scheduler):
                </label>
                <span className="rounded-lg bg-sky-500/20 px-2 py-0.5 text-xs font-black text-sky-300 border border-sky-500/30">
                  {minAutoPublishScore}/100
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Score mínimo para despacho automático para o WhatsApp. Produtos abaixo nunca são enviados sozinhos.
              </p>
              <input
                id="sched-min-auto"
                type="range"
                min={50}
                max={95}
                step={1}
                value={minAutoPublishScore}
                onChange={(e) => setMinAutoPublishScore(Number(e.target.value))}
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>

            {/* 4.3. Publicação Manual */}
            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between">
                <label htmlFor="sched-min-manual" className="text-xs font-semibold text-slate-200">
                  Mínimo para Aprovação e Publicação Manual:
                </label>
                <span className="rounded-lg bg-amber-500/20 px-2 py-0.5 text-xs font-black text-amber-300 border border-amber-500/30">
                  {minManualPublishScore}/100
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Score mínimo para permitir publicação manual. Bloqueia terminantemente tentativas manuais abaixo do limite.
              </p>
              <input
                id="sched-min-manual"
                type="range"
                min={50}
                max={95}
                step={1}
                value={minManualPublishScore}
                onChange={(e) => setMinManualPublishScore(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            {/* 4.4. Trava de Desconto Verificável */}
            <div className="pt-2 border-t border-white/5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireVerifiableDiscount}
                  onChange={(e) => setRequireVerifiableDiscount(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-emerald-500/50 bg-black/40 text-emerald-500 accent-emerald-500 cursor-pointer"
                />
                <div>
                  <span className="block text-xs font-bold text-white">Exigir Desconto Verificável</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">
                    Rejeita produtos com &quot;preço anterior indisponível&quot; se não houver histórico de queda ou cupom confirmado.
                  </span>
                </div>
              </label>
            </div>
          </section>

          {/* 5. Preview em Tempo Real dos Horários e Estimativas */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Preview em Tempo Real
              </span>
              <span className="text-[11px] font-mono font-semibold text-emerald-300">
                ~{preview.calculatedInterval} min por post · {preview.totalPosts} posts/dia
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-xl bg-black/30 p-2.5">
                <span className="text-slate-400 block text-[10px]">Intervalo calculado:</span>
                <strong className="text-white text-sm">A cada {preview.calculatedInterval} minutos</strong>
              </div>
              <div className="rounded-xl bg-black/30 p-2.5">
                <span className="text-slate-400 block text-[10px]">Quantidade diária:</span>
                <strong className="text-white text-sm">{preview.totalPosts} anúncios/dia</strong>
              </div>
            </div>

            <div>
              <span className="block text-[10px] uppercase font-semibold text-slate-400 mb-1.5">
                Próximos horários calculados para o dia:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {preview.sampleSlots.map((time, idx) => (
                  <span
                    key={`${time}-${idx}`}
                    className="rounded-lg bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[11px] font-mono font-bold text-sky-200"
                  >
                    {time}
                  </span>
                ))}
                {preview.totalPosts > preview.sampleSlots.length && (
                  <span className="rounded-lg bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
                    +{preview.totalPosts - preview.sampleSlots.length} horários
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Destino do Canal */}
          <div>
            <label htmlFor="sched-channel" className="block text-[11px] font-semibold text-slate-300 mb-1">
              Nome do Canal de Destino (WhatsApp)
            </label>
            <input
              id="sched-channel"
              type="text"
              value={channelDestination}
              onChange={(e) => setChannelDestination(e.target.value)}
              placeholder="Ex.: Radar de Ofertas"
              className="field text-xs py-2"
            />
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3.5 sm:px-6 bg-slate-950/60">
          <p className="text-[11px] text-slate-400">
            Recalcula apenas ofertas futuras. Não dispara nada imediatamente.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-950/50 hover:brightness-110 transition disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <IconSpinner width={14} height={14} /> Salvando…
                </>
              ) : (
                "Salvar Configurações"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
