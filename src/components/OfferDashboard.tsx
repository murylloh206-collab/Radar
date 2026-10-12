"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { discoverOffers, patchOffer, searchOffers } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type {
  AutomationSettings,
  LastSearchInfo,
  Offer,
  OfferStatus,
  OfferUpdate,
  OffersResponse,
  SchedulerSettings,
  SchedulerStats,
} from "@/lib/types";
import { OfferCard } from "./OfferCard";
import { STATUS_STYLES } from "./StatusBadge";
import { IconAlert, IconBolt, IconCheck, IconKey, IconLink, IconPlus, IconSearch, IconSpinner, IconX } from "./icons";

type Filter = "todos" | OfferStatus;
type QuickFilter = "todos" | "frete-gratis" | "comissao" | "prontos-publicar";
type SortKey = "oportunidade" | "recentes" | "desconto" | "comissao" | "menor-preco";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendente", label: "Pendentes" },
  { key: "aprovado", label: "Aprovados" },
  { key: "publicado", label: "Publicados" },
  { key: "rejeitado", label: "Rejeitados" },
];

interface Toast {
  id: number;
  kind: "ok" | "erro" | "info";
  text: string;
}

export function OfferDashboard({ initial }: { initial: OffersResponse }) {
  const [offers, setOffers] = useState<Offer[]>(initial.offers);
  const [lastSearch, setLastSearch] = useState<LastSearchInfo | null>(initial.lastSearch);
  const [terms, setTerms] = useState<string[]>(initial.config.defaultTerms);
  const [newTerm, setNewTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("todos");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("oportunidade");
  const [discovering, setDiscovering] = useState(false);
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const [showManualToken, setShowManualToken] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [showManualCookie, setShowManualCookie] = useState(false);
  const [manualCookie, setManualCookie] = useState("");
  const [savingCookie, setSavingCookie] = useState(false);
  const [isConnected, setIsConnected] = useState(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("ml_success")) return true;
    }
    return initial.config.mercadoLivreConnected;
  });

  // Automação de envio a cada 5 minutos
  const [automation, setAutomation] = useState<AutomationSettings>(
    initial.automation ?? {
      autoSendEnabled: false,
      channelDestination: "Grupo VIP de Ofertas",
      intervalMinutes: 5,
      lastDispatchedAt: null,
      nextScheduledAt: null,
      lastDispatchedOfferTitle: null,
      lastError: null,
    }
  );
  const [channelInput, setChannelInput] = useState(initial.automation?.channelDestination || "Grupo VIP de Ofertas");
  const [updatingAutomation, setUpdatingAutomation] = useState(false);
  const [dispatchingNow, setDispatchingNow] = useState(false);

  // Agendador de Publicações Automáticas
  const [scheduler, setScheduler] = useState<SchedulerSettings>(
    initial.scheduler ?? {
      state: "ativo",
      startHour: "07:00",
      endHour: "00:00",
      dailyTarget: 60,
      maxPerHour: 5,
      timezone: "America/Sao_Paulo",
      channelDestination: "Grupo VIP de Ofertas",
      consecutiveFailures: 0,
      maxConsecutiveFailures: 3,
      lastDispatchedAt: null,
      lastDispatchedOfferTitle: null,
      lastError: null,
    }
  );
  const [schedulerStats, setSchedulerStats] = useState<SchedulerStats>(
    initial.schedulerStats ?? {
      aprovadasFila: 0,
      agendadasHoje: 0,
      enviadasHoje: 0,
      pendentesProximaJanela: 0,
      comFalha: 0,
      proximoEnvio: null,
      metaDiaria: 60,
      limiteHora: 5,
    }
  );
  const [dailyTargetInput, setDailyTargetInput] = useState(initial.scheduler?.dailyTarget || 60);
  const [updatingScheduler, setUpdatingScheduler] = useState(false);

  const configured = initial.config.mercadoLivreConfigured;
  const connected = isConnected;

  function notify(kind: Toast["kind"], text: string) {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("ml_success")) {
      notify("ok", "Conta do Mercado Livre conectada com sucesso!");
      window.history.replaceState({}, "", "/");
    } else if (url.searchParams.get("ml_error")) {
      notify("erro", `Erro de autorização: ${url.searchParams.get("ml_error")}`);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  async function handleSaveManualToken(e: React.FormEvent) {
    e.preventDefault();
    if (!manualToken.trim()) return;
    setSavingToken(true);
    try {
      const res = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: manualToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar token");
      notify("ok", "Token do Mercado Livre ativado com sucesso!");
      setIsConnected(true);
      setShowManualToken(false);
      setManualToken("");
    } catch (err) {
      notify("erro", err instanceof Error ? err.message : "Erro ao salvar token");
    } finally {
      setSavingToken(false);
    }
  }

  async function handleSaveManualCookie(e: React.FormEvent) {
    e.preventDefault();
    if (!manualCookie.trim()) return;
    setSavingCookie(true);
    try {
      const res = await fetch("/api/auth/cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: manualCookie.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar cookie");
      notify("ok", data.message || "Cookie do Mercado Livre salvo com sucesso!");
      setShowManualCookie(false);
      setManualCookie("");
      const refRes = await fetch("/api/offers");
      const refData = await refRes.json().catch(() => ({}));
      if (refData.offers) setOffers(refData.offers);
    } catch (err) {
      notify("erro", err instanceof Error ? err.message : "Erro ao salvar cookie");
    } finally {
      setSavingCookie(false);
    }
  }

  async function handleDisconnect() {
    try {
      await fetch("/api/auth/disconnect", { method: "POST" });
      setIsConnected(false);
      notify("ok", "Desconectado do Mercado Livre. Modo Demonstração reativado!");
    } catch {
      notify("erro", "Erro ao desconectar.");
    }
  }

  // ---------- Contadores ----------
  const counts = useMemo(() => {
    const c = { todos: offers.length, pendente: 0, aprovado: 0, publicado: 0, rejeitado: 0 };
    for (const o of offers) {
      if (c[o.status] !== undefined) {
        c[o.status]++;
      }
    }
    return c;
  }, [offers]);

  // Contador de ofertas aprovadas aguardando envio
  const approvedWaitingCount = useMemo(() => {
    return offers.filter(
      (o) =>
        o.status === "aprovado" &&
        o.whatsappStatus !== "enviado" &&
        o.whatsappStatus !== "falhou"
    ).length;
  }, [offers]);

  // Indicador de próximo envio formatado no fuso America/Sao_Paulo
  const nextDispatchFormatted = useMemo(() => {
    if (scheduler.state !== "ativo") {
      return scheduler.state === "interrompido_erro" ? "Interrompido por Falhas" : "Pausado";
    }
    if (!schedulerStats.proximoEnvio) return "--:--";
    try {
      const d = new Date(schedulerStats.proximoEnvio);
      return d.toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "--:--";
    }
  }, [scheduler.state, schedulerStats.proximoEnvio]);

  // Recarrega dados e sincroniza agendador e ofertas compartilhadas
  async function reloadOffersAndScheduler() {
    try {
      const res = await fetch("/api/offers", { cache: "no-store" });
      if (res.ok) {
        const data: OffersResponse = await res.json();
        setOffers(data.offers);
        if (data.scheduler) setScheduler(data.scheduler);
        if (data.schedulerStats) setSchedulerStats(data.schedulerStats);
        if (data.automation) setAutomation(data.automation);
      }
    } catch {
      // Silencioso
    }
  }

  // Polling a cada 15s quando o agendador estiver ativo
  useEffect(() => {
    if (scheduler.state !== "ativo") return;
    const interval = setInterval(() => {
      reloadOffersAndScheduler();
    }, 15_000);
    return () => clearInterval(interval);
  }, [scheduler.state]);

  async function handleToggleScheduler(desiredState?: "ativo" | "pausado") {
    const nextVal = desiredState ?? (scheduler.state === "ativo" ? "pausado" : "ativo");
    setUpdatingScheduler(true);
    try {
      const res = await fetch("/api/scheduler", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: nextVal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar agendador");
      setScheduler(data.settings);
      setSchedulerStats(data.stats);
      notify(
        "ok",
        nextVal === "ativo"
          ? "Agendador INICIADO! Ofertas distribuídas automaticamente das 07:00 às 00:00."
          : "Agendador PAUSADO com sucesso."
      );
    } catch (err) {
      notify("erro", err instanceof Error ? err.message : "Erro ao alterar agendador");
    } finally {
      setUpdatingScheduler(false);
    }
  }

  async function handleSaveDailyTarget(target: number) {
    if (isNaN(target) || target < 10 || target > 150) return;
    setUpdatingScheduler(true);
    try {
      const res = await fetch("/api/scheduler", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyTarget: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar meta diária");
      setScheduler(data.settings);
      setSchedulerStats(data.stats);
      notify("ok", `Meta diária configurada para ${target} ofertas/dia.`);
    } catch (err) {
      notify("erro", err instanceof Error ? err.message : "Erro ao salvar meta");
    } finally {
      setUpdatingScheduler(false);
    }
  }

  async function handleSaveChannel(newChannel: string) {
    const trimmed = newChannel.trim();
    if (!trimmed) return;
    setUpdatingScheduler(true);
    try {
      const res = await fetch("/api/scheduler", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelDestination: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar canal");
      setScheduler(data.settings);
      notify("ok", `Canal de destino salvo: "${data.settings.channelDestination}"`);
    } catch (err) {
      notify("erro", err instanceof Error ? err.message : "Erro ao salvar canal");
    } finally {
      setUpdatingScheduler(false);
    }
  }

  async function handleManualDispatch() {
    setDispatchingNow(true);
    try {
      const res = await fetch("/api/cron/process-scheduled", {
        method: "POST",
        headers: {
          "x-requested-with": "XMLHttpRequest",
        },
      });
      const data = await res.json();
      if (data.ok && data.processed) {
        notify("ok", `Oferta "${data.title}" enviada com sucesso!`);
      } else if (data.ok && !data.processed) {
        notify("info", data.reason || "Nenhuma oferta vencida para envio no momento.");
      } else {
        notify("erro", data.error || data.reason || "Falha no envio da oferta.");
      }
      await reloadOffersAndScheduler();
    } catch (err) {
      notify("erro", err instanceof Error ? err.message : "Falha ao processar envio imediato");
    } finally {
      setDispatchingNow(false);
    }
  }

  // ---------- Filtro + busca por nome + ordenação ----------
  const visible = useMemo(() => {
    const q = query
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const list = offers.filter((o) => {
      // Filtro de status principal
      if (filter !== "todos" && o.status !== filter) return false;

      // Filtro rápido extra
      if (quickFilter === "frete-gratis" && !o.freeShipping) return false;
      if (quickFilter === "comissao" && (!o.commission || o.commission.amount <= 0)) return false;
      if (quickFilter === "prontos-publicar" && o.status !== "aprovado" && o.whatsappStatus !== "pronto") return false;

      // Filtro por texto
      if (!q) return true;
      const title = o.title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return title.includes(q);
    });

    if (sort === "oportunidade") {
      list.sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0));
    } else if (sort === "desconto") {
      list.sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0));
    } else if (sort === "comissao") {
      list.sort((a, b) => (b.commission?.amount ?? 0) - (a.commission?.amount ?? 0));
    } else if (sort === "menor-preco") {
      list.sort((a, b) => a.price - b.price);
    }
    return list;
  }, [offers, filter, quickFilter, query, sort]);

  // ---------- Descoberta Automática de Categorias (Radar de Ofertas) ----------
  async function handleDiscoverRadar() {
    setDiscovering(true);
    setSearchError(null);
    try {
      const result = await discoverOffers();
      setOffers(result.offers);
      setLastSearch(result.lastSearch);
      const { added, updated } = result.lastSearch;
      notify("ok", `Radar de Ofertas atualizado: ${added} nova(s), ${updated} atualizada(s).`);
      for (const e of result.errors) notify("erro", `“${e.term}”: ${e.message}`);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Erro ao rodar descoberta automática.");
    } finally {
      setDiscovering(false);
    }
  }

  // ---------- Busca Manual por Termos ----------
  async function handleSearch() {
    if (terms.length === 0) {
      setSearchError("Adicione pelo menos um termo de busca.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const result = await searchOffers(terms);
      setOffers(result.offers);
      setLastSearch(result.lastSearch);
      const { added, updated } = result.lastSearch;
      notify("ok", `Busca manual concluída: ${added} nova(s), ${updated} atualizada(s).`);
      for (const e of result.errors) notify("erro", `“${e.term}”: ${e.message}`);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Erro ao buscar ofertas.");
    } finally {
      setSearching(false);
    }
  }

  async function handleUpdate(id: string, update: OfferUpdate) {
    const saved = await patchOffer(id, update);
    setOffers((list) => list.map((o) => (o.id === id ? saved : o)));
    if (update.status === "aprovado") notify("ok", "Oferta aprovada e enviada para a fila de publicação!");
    else if (update.status === "publicado") notify("ok", "Oferta marcada como publicada.");
    else if (update.status === "rejeitado") notify("ok", "Oferta rejeitada.");
    else if (update.status === "pendente") notify("ok", "Oferta retornou para pendente.");
    else notify("ok", "Alterações salvas.");
  }

  function addTerm() {
    const t = newTerm.trim().toLowerCase();
    if (!t) return;
    if (!terms.includes(t) && terms.length < 10) setTerms([...terms, t]);
    setNewTerm("");
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-3 pb-24 pt-4 sm:px-6 lg:px-8">
      {/* ================= Cabeçalho ================= */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-900/40">
            <IconBolt width={24} height={24} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-3xl">
              Radar de Ofertas <span className="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent">Afiliadas</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">Achados que valem a pena · Revisão ágil · Publicação segura</p>
          </div>
        </div>
        {lastSearch && (
          <p className="text-xs text-slate-400">
            Última varredura: <span className="font-medium text-slate-300">{formatDateTime(lastSearch.at)}</span> ·{" "}
            {lastSearch.found} produto(s)
          </p>
        )}
      </header>

      {/* ================= Aviso obrigatório ================= */}
      <div
        role="note"
        className="mt-4 flex items-start gap-2.5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-3.5 py-2.5 text-xs text-amber-100 sm:text-sm"
      >
        <IconAlert className="mt-0.5 shrink-0 text-amber-300" width={16} height={16} />
        <p>
          <strong className="font-semibold text-amber-200">Atenção:</strong> Preço, estoque e regras podem mudar. Sempre valide o link com <strong>“Testar link”</strong> antes de aprovar.
        </p>
      </div>

      {/* ================= Status de Conexão com o Mercado Livre ================= */}
      {connected ? (
        <div className="mt-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.08] p-3 text-xs sm:text-sm text-emerald-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <IconCheck width={12} height={12} />
              </span>
              <p>
                <strong className="font-semibold text-emerald-200">Mercado Livre Conectado:</strong> Descoberta e consultas ativas na API oficial.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/api/auth/mercadolivre"
                className="rounded-lg bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/30 transition inline-flex items-center gap-1"
                title="Renovar autorização no Mercado Livre"
              >
                🔄 Reconectar
              </a>
              <button
                type="button"
                onClick={() => setShowManualCookie(!showManualCookie)}
                className="rounded-lg border border-teal-400/30 px-2.5 py-1 text-[11px] font-semibold text-teal-300 hover:bg-teal-400/10 transition"
              >
                {showManualCookie ? "Fechar Cookie" : "Cookie meli.la"}
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                className="rounded-lg border border-emerald-400/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-400/10 transition"
              >
                Desconectar
              </button>
              <span className="inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                Online Oficial
              </span>
            </div>
          </div>

          {showManualCookie && (
            <form onSubmit={handleSaveManualCookie} className="mt-2.5 border-t border-emerald-400/20 pt-2.5 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={manualCookie}
                onChange={(e) => setManualCookie(e.target.value)}
                placeholder="Cole aqui seu Cookie de Sessão atualizado do Mercado Livre (ex: c_Z2aREDu=1; ...)"
                className="field !bg-black/40 text-xs flex-1"
              />
              <button
                type="submit"
                disabled={savingCookie || !manualCookie.trim()}
                className="rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-bold text-xs px-3.5 py-1.5 transition disabled:opacity-50 shrink-0"
              >
                {savingCookie ? "Salvando…" : "Ativar Cookie meli.la"}
              </button>
            </form>
          )}
        </div>
      ) : configured ? (
        <div className="mt-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.08] p-3 text-xs sm:text-sm text-amber-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-0.5">
              <p className="font-semibold text-amber-200">
                Credenciais configuradas! Autorize sua conta do Mercado Livre.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowManualToken(!showManualToken)}
                className="text-xs font-medium text-amber-300 underline-offset-2 hover:underline px-2 py-1"
              >
                {showManualToken ? "Ocultar" : "Colar token"}
              </button>
              <a
                href="/api/auth/mercadolivre"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2 text-xs font-bold text-white shadow-lg transition hover:brightness-110 shrink-0"
              >
                <IconLink width={14} height={14} /> Conectar Mercado Livre
              </a>
            </div>
          </div>

          {showManualToken && (
            <form onSubmit={handleSaveManualToken} className="mt-3 pt-2.5 border-t border-amber-400/20 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Cole aqui seu Access Token do Mercado Livre"
                className="field !bg-black/40 text-xs flex-1"
              />
              <button
                type="submit"
                disabled={savingToken || !manualToken.trim()}
                className="rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs px-3.5 py-1.5 transition disabled:opacity-50"
              >
                {savingToken ? "Salvando…" : "Salvar Token"}
              </button>
            </form>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-sky-400/20 bg-sky-400/[0.07] px-3.5 py-2.5 text-xs sm:text-sm text-sky-100">
          <IconKey className="mt-0.5 shrink-0 text-sky-300" width={16} height={16} />
          <div>
            <p className="font-semibold text-sky-200">Modo Demonstração Ativo</p>
            <p className="text-sky-100/80 text-[11px] sm:text-xs">
              Você pode descobrir ofertas e testar o radar com dados de demonstração oficiais.
            </p>
          </div>
        </div>
      )}

      {/* ================= DESCOBERTA AUTOMÁTICA PRINCIPAL ================= */}
      <section aria-labelledby="radar-titulo" className="glass mt-5 rounded-3xl p-4 sm:p-6 ring-1 ring-emerald-500/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h2 id="radar-titulo" className="text-sm font-bold uppercase tracking-wider text-emerald-300">
                Descoberta Automática Recorrente
              </h2>
            </div>
            <p className="text-xs text-slate-300">
              Varre automaticamente as 7 categorias prioritárias: Eletrônicos, Celulares/Informática, Games, Casa/Cozinha, Ferramentas, Beleza e Utilidades.
            </p>
          </div>

          <button
            type="button"
            id="descoberta-radar"
            onClick={handleDiscoverRadar}
            disabled={discovering || searching}
            className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 px-6 py-3.5 text-sm sm:text-base font-black text-white shadow-xl shadow-emerald-950/50 transition hover:brightness-110 active:scale-95 disabled:cursor-wait disabled:opacity-80 shrink-0"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            {discovering ? <IconSpinner width={18} height={18} /> : <IconBolt width={18} height={18} />}
            {discovering ? "Varrendo Categorias…" : "Atualizar Radar de Ofertas"}
          </button>
        </div>

        {/* Busca manual secundária / colapsável */}
        <div className="mt-4 pt-3 border-t border-white/5">
          <button
            type="button"
            onClick={() => setShowManualSearch(!showManualSearch)}
            className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition flex items-center gap-1.5"
          >
            <span>{showManualSearch ? "▲ Ocultar busca manual por termos" : "▼ Busca manual alternativa por termos (opcional)"}</span>
          </button>

          {showManualSearch && (
            <div className="mt-3 space-y-3 rounded-2xl bg-black/25 p-3.5 ring-1 ring-white/5">
              <div className="flex flex-wrap items-center gap-2">
                {terms.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] py-0.5 pl-2.5 pr-1 text-xs text-slate-200 ring-1 ring-white/10"
                  >
                    {t}
                    <button
                      type="button"
                      aria-label={`Remover termo ${t}`}
                      onClick={() => setTerms(terms.filter((x) => x !== t))}
                      className="rounded-full p-0.5 text-slate-400 hover:text-rose-300"
                    >
                      <IconX width={10} height={10} />
                    </button>
                  </span>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addTerm();
                  }}
                  className="flex items-center gap-1"
                >
                  <input
                    value={newTerm}
                    onChange={(e) => setNewTerm(e.target.value)}
                    placeholder="Adicionar termo…"
                    maxLength={60}
                    className="field w-32! rounded-full! py-1! text-xs"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-white/[0.06] p-1.5 text-slate-300 hover:text-emerald-300"
                  >
                    <IconPlus width={12} height={12} />
                  </button>
                </form>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Até {initial.config.resultsPerTerm} itens por termo</span>
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={searching || discovering}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 transition disabled:opacity-50"
                >
                  {searching ? <IconSpinner width={12} height={12} /> : <IconSearch width={12} height={12} />}
                  {searching ? "Buscando…" : "Buscar termos manuais"}
                </button>
              </div>
            </div>
          )}
        </div>

        {searchError && (
          <p role="alert" className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200 ring-1 ring-rose-400/20">
            {searchError}
          </p>
        )}
      </section>

      {/* ================= Estatísticas ================= */}
      <section aria-label="Resumo" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {FILTERS.map(({ key, label }) => {
          const color = key === "todos" ? "text-white" : STATUS_STYLES[key].text;
          const dot = key === "todos" ? "bg-slate-300" : STATUS_STYLES[key].dot;
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              id={`resumo-${key}`}
              onClick={() => setFilter(key)}
              className={`glass rounded-2xl p-3 text-left transition hover:bg-white/[0.07] ${
                active ? "ring-1 ring-white/25" : ""
              }`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                <span className={`h-2 w-2 rounded-full ${dot}`} /> {label}
              </span>
              <span className={`mt-0.5 block text-2xl font-black tabular-nums ${color}`}>{counts[key]}</span>
            </button>
          );
        })}
      </section>

      {/* ================= Filtros Rápidos e Barra de Ações (Mobile-First) ================= */}
      <div className="sticky top-0 z-20 -mx-3 mt-5 border-b border-white/5 bg-ink-950/85 px-3 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-2.5">
          {/* Linha 1: Status */}
          <div role="tablist" aria-label="Filtrar por status" className="flex gap-1 overflow-x-auto rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/5 scrollbar-none">
            {FILTERS.map(({ key, label }) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`filtro-${key}`}
                  aria-selected={active}
                  onClick={() => setFilter(key)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    active ? "bg-white/10 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {key !== "todos" && <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[key].dot}`} />}
                  {label}
                  <span className="rounded bg-black/30 px-1 text-[10px] tabular-nums text-slate-300">{counts[key]}</span>
                </button>
              );
            })}
          </div>

          {/* Linha 2: Filtros Rápidos (Melhores Oportunidades, Frete Grátis, Comissão, Prontos para publicar) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs">
            <button
              type="button"
              onClick={() => {
                setQuickFilter("todos");
                setSort("oportunidade");
              }}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition border ${
                sort === "oportunidade" && quickFilter === "todos"
                  ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
                  : "border-white/5 bg-white/[0.03] text-slate-400 hover:text-white"
              }`}
            >
              ⭐ Melhores Oportunidades
            </button>
            <button
              type="button"
              onClick={() => {
                setQuickFilter(quickFilter === "frete-gratis" ? "todos" : "frete-gratis");
              }}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition border ${
                quickFilter === "frete-gratis"
                  ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                  : "border-white/5 bg-white/[0.03] text-slate-400 hover:text-white"
              }`}
            >
              🚚 Frete Grátis
            </button>
            <button
              type="button"
              onClick={() => {
                setQuickFilter(quickFilter === "comissao" ? "todos" : "comissao");
                if (quickFilter !== "comissao") setSort("comissao");
              }}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition border ${
                quickFilter === "comissao"
                  ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                  : "border-white/5 bg-white/[0.03] text-slate-400 hover:text-white"
              }`}
            >
              💰 Maior Comissão
            </button>
            <button
              type="button"
              onClick={() => {
                setSort(sort === "desconto" ? "recentes" : "desconto");
              }}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition border ${
                sort === "desconto"
                  ? "border-teal-400/40 bg-teal-400/15 text-teal-200"
                  : "border-white/5 bg-white/[0.03] text-slate-400 hover:text-white"
              }`}
            >
              🔥 Maior Desconto
            </button>
            <button
              type="button"
              onClick={() => {
                setQuickFilter(quickFilter === "prontos-publicar" ? "todos" : "prontos-publicar");
              }}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition border ${
                quickFilter === "prontos-publicar"
                  ? "border-sky-400/40 bg-sky-400/15 text-sky-200"
                  : "border-white/5 bg-white/[0.03] text-slate-400 hover:text-white"
              }`}
            >
              📲 Prontos para Publicar
            </button>
          </div>

          {/* Linha 3: Busca por nome + Ordenação */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" width={14} height={14} />
              <input
                id="busca-nome"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome do produto…"
                className="field pl-8! text-xs py-1.5!"
              />
            </div>
            <select
              id="ordenar"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="field w-auto! cursor-pointer text-xs py-1.5!"
            >
              <option value="oportunidade">Pontuação de Oportunidade</option>
              <option value="recentes">Mais recentes</option>
              <option value="desconto">Maior desconto</option>
              <option value="comissao">Maior comissão</option>
              <option value="menor-preco">Menor preço</option>
            </select>
          </div>
        </div>
      </div>

      {/* ================= Lista de ofertas (Mobile-First: 1 coluna no celular) ================= */}
      <section aria-label="Ofertas" className="mt-5">
        {/* ================= Agendador de Publicações Automáticas (Fila Compartilhada) ================= */}
        {filter === "aprovado" && (
          <div className="glass mb-5 rounded-2xl p-4 ring-1 ring-white/10">
            {/* Linha 1: Cabeçalho com Status, Botões de Controle e Janela */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-white/5 pb-3">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Botões Iniciar / Pausar / Retomar */}
                {scheduler.state === "ativo" ? (
                  <button
                    type="button"
                    id="pausar-agendador"
                    onClick={() => handleToggleScheduler("pausado")}
                    disabled={updatingScheduler}
                    className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-200 ring-1 ring-amber-400/30 transition hover:bg-amber-500/30"
                  >
                    <span>⏸️</span> Pausar Agendador
                  </button>
                ) : scheduler.state === "pausado" ? (
                  <button
                    type="button"
                    id="iniciar-agendador"
                    onClick={() => handleToggleScheduler("ativo")}
                    disabled={updatingScheduler}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-ink-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-400"
                  >
                    <span>▶️</span> Iniciar Agendador
                  </button>
                ) : (
                  <button
                    type="button"
                    id="retomar-agendador"
                    onClick={() => handleToggleScheduler("ativo")}
                    disabled={updatingScheduler}
                    className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-rose-500/30 transition hover:bg-rose-400"
                  >
                    <span>🔄</span> Retomar após Falhas
                  </button>
                )}

                {/* Badge de Estado Atual */}
                <span
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                    scheduler.state === "ativo"
                      ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
                      : scheduler.state === "pausado"
                      ? "bg-amber-500/10 text-amber-300 ring-amber-500/20"
                      : "bg-rose-500/10 text-rose-300 ring-rose-500/20"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      scheduler.state === "ativo"
                        ? "bg-emerald-400 animate-pulse"
                        : scheduler.state === "pausado"
                        ? "bg-amber-400"
                        : "bg-rose-400 animate-ping"
                    }`}
                  />
                  {scheduler.state === "ativo"
                    ? "Agendador Ativo"
                    : scheduler.state === "pausado"
                    ? "Agendador Pausado"
                    : "Interrompido por Falhas"}
                </span>

                {/* Janela Operacional & Fuso */}
                <span className="flex items-center gap-1 rounded-lg bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-300 ring-1 ring-white/5">
                  🛡️ Janela: <strong className="text-white">07:00 às 00:00</strong>{" "}
                  <span className="text-[10px] text-slate-400">(SP UTC-3)</span>
                </span>

                {/* Próximo Envio Previsto */}
                <span className="flex items-center gap-1 rounded-lg bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-300 ring-1 ring-white/5">
                  🕒 Próximo envio:{" "}
                  <strong className={scheduler.state === "ativo" ? "text-emerald-300" : "text-slate-400"}>
                    {nextDispatchFormatted}
                  </strong>
                </span>
              </div>

              {/* Lado Direito: Canal de Destino + Disparo Imediato */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <label htmlFor="canal-destino-sched" className="text-[11px] font-medium text-slate-400 shrink-0">
                    Canal:
                  </label>
                  <input
                    id="canal-destino-sched"
                    type="text"
                    value={channelInput}
                    onChange={(e) => setChannelInput(e.target.value)}
                    onBlur={() => {
                      if (channelInput !== scheduler.channelDestination) {
                        handleSaveChannel(channelInput);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSaveChannel(channelInput);
                      }
                    }}
                    placeholder="Grupo VIP de Ofertas"
                    className="field w-40! py-1! px-2.5! text-xs"
                  />
                </div>

                <button
                  type="button"
                  id="disparar-proxima-agora"
                  onClick={handleManualDispatch}
                  disabled={dispatchingNow || approvedWaitingCount === 0}
                  className="btn-ghost py-1! px-2.5! text-[11px] hover:text-emerald-300 disabled:opacity-40"
                  title="Executa imediatamente a verificação e o envio da próxima oferta agendada"
                >
                  {dispatchingNow ? (
                    <span className="flex items-center gap-1">
                      <IconSpinner width={12} height={12} className="animate-spin" /> Processando...
                    </span>
                  ) : (
                    "⚡ Processar Próxima Agora"
                  )}
                </button>
              </div>
            </div>

            {/* Linha 2: Os 5 Indicadores em Tempo Real */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {/* Card 1: Aprovadas na Fila */}
              <div className="rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/5">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  📦 Aprovadas na Fila
                </span>
                <span className="mt-0.5 block text-xl font-black text-white tabular-nums">
                  {schedulerStats.aprovadasFila}
                </span>
                <span className="text-[10px] text-slate-500">Prontas para saída</span>
              </div>

              {/* Card 2: Agendadas Hoje */}
              <div className="rounded-xl bg-sky-500/10 p-2.5 ring-1 ring-sky-500/20">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-sky-300">
                  🕒 Agendadas Hoje
                </span>
                <span className="mt-0.5 block text-xl font-black text-sky-200 tabular-nums">
                  {schedulerStats.agendadasHoje}
                </span>
                <span className="text-[10px] text-sky-400/80">Janela até 00:00</span>
              </div>

              {/* Card 3: Enviadas Hoje */}
              <div className="rounded-xl bg-emerald-500/10 p-2.5 ring-1 ring-emerald-500/20">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-emerald-300">
                  🚀 Enviadas Hoje
                </span>
                <span className="mt-0.5 block text-xl font-black text-emerald-200 tabular-nums">
                  {schedulerStats.enviadasHoje}
                </span>
                <span className="text-[10px] text-emerald-400/80">
                  Meta: {scheduler.dailyTarget}/dia
                </span>
              </div>

              {/* Card 4: Pendentes Próxima Janela */}
              <div className="rounded-xl bg-purple-500/10 p-2.5 ring-1 ring-purple-500/20">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-purple-300">
                  ⏳ Pendentes Próx. Janela
                </span>
                <span className="mt-0.5 block text-xl font-black text-purple-200 tabular-nums">
                  {schedulerStats.pendentesProximaJanela}
                </span>
                <span className="text-[10px] text-purple-400/80">A partir das 07:00</span>
              </div>

              {/* Card 5: Com Falha */}
              <div
                className={`rounded-xl p-2.5 ring-1 ${
                  schedulerStats.comFalha > 0
                    ? "bg-rose-500/15 ring-rose-500/30"
                    : "bg-white/[0.03] ring-white/5"
                }`}
              >
                <span
                  className={`block text-[10px] font-medium uppercase tracking-wider ${
                    schedulerStats.comFalha > 0 ? "text-rose-300" : "text-slate-400"
                  }`}
                >
                  ⚠️ Com Falha
                </span>
                <span
                  className={`mt-0.5 block text-xl font-black tabular-nums ${
                    schedulerStats.comFalha > 0 ? "text-rose-200" : "text-slate-300"
                  }`}
                >
                  {schedulerStats.comFalha}
                </span>
                <span className="text-[10px] text-slate-500">
                  {scheduler.consecutiveFailures > 0
                    ? `${scheduler.consecutiveFailures}/3 falhas consec.`
                    : "Nenhuma falha ativa"}
                </span>
              </div>
            </div>

            {/* Linha 3: Ajuste de Meta Diária (50 a 70 ofertas) */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Meta diária operacional:</span>
                <div className="flex items-center gap-1">
                  {[50, 60, 70].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setDailyTargetInput(val);
                        handleSaveDailyTarget(val);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ring-1 ${
                        scheduler.dailyTarget === val
                          ? "bg-emerald-400/20 text-emerald-200 ring-emerald-400/40"
                          : "bg-white/[0.04] text-slate-400 ring-white/5 hover:text-white"
                      }`}
                    >
                      {val} ofertas
                    </button>
                  ))}
                  <input
                    type="number"
                    min={10}
                    max={150}
                    value={dailyTargetInput}
                    onChange={(e) => setDailyTargetInput(Number(e.target.value))}
                    onBlur={() => handleSaveDailyTarget(dailyTargetInput)}
                    className="field w-16! py-0.5! px-2! text-center! text-xs tabular-nums"
                  />
                  <span className="text-[10px] text-slate-500">ofertas/dia (limite: 5/hora)</span>
                </div>
              </div>

              <span className="text-[10px] text-slate-500">
                Fila sincronizada no Supabase PostgreSQL entre você e seu irmão.
              </span>
            </div>

            {/* Alerta de Circuit Breaker (3 falhas consecutivas ou erro ativo) */}
            {(scheduler.state === "interrompido_erro" || scheduler.lastError) && (
              <div
                role="alert"
                className={`mt-3 rounded-xl p-3 text-xs ring-1 ${
                  scheduler.state === "interrompido_erro"
                    ? "bg-rose-500/15 text-rose-200 ring-rose-500/30"
                    : "bg-amber-500/10 text-amber-200 ring-amber-500/20"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="text-base">🚨</span>
                    <div>
                      <strong className="block font-bold">
                        {scheduler.state === "interrompido_erro"
                          ? "Agendador Pausado Automaticamente (Circuit Breaker)"
                          : "Atenção: Registro de Falha Recente"}
                      </strong>
                      <p className="mt-0.5 text-[11px] opacity-90">
                        {scheduler.lastError || "Ocorreram falhas consecutivas de publicação."}
                      </p>
                      {scheduler.state === "interrompido_erro" && (
                        <p className="mt-1 text-[10px] opacity-75">
                          O sistema pausou o envio para proteger seu canal e evitar bloqueios.
                          Verifique o serviço de WhatsApp e clique em <strong>Retomar após Falhas</strong> acima.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {offers.length === 0 ? (
          <div className="glass flex flex-col items-center rounded-3xl px-4 py-12 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20">
              <IconBolt width={26} height={26} />
            </div>
            <h2 className="text-base font-bold text-white">Nenhuma oferta no radar</h2>
            <p className="mt-1 max-w-sm text-xs text-slate-400">
              Clique em <strong className="text-emerald-300">Atualizar Radar de Ofertas</strong> para descobrir oportunidades automáticas das categorias prioritárias.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="glass rounded-3xl px-4 py-10 text-center text-xs text-slate-400">
            Nenhuma oferta encontrada com este filtro{query ? ` e o texto “${query}”` : ""}.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((offer, i) => (
              <OfferCard key={`${offer.id}:${offer.updatedAt}`} offer={offer} index={i} onUpdate={handleUpdate} />
            ))}
          </div>
        )}
      </section>

      <footer className="mt-16 text-center text-xs text-slate-500">
        Radar de Ofertas · Supabase PostgreSQL Compartilhado · Agendador Automático (07:00 às 00:00)
      </footer>

      {/* ================= Notificações ================= */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-toast-in rounded-xl px-4 py-3 text-sm font-medium shadow-2xl ring-1 backdrop-blur-xl ${
              t.kind === "ok"
                ? "bg-emerald-950/90 text-emerald-100 ring-emerald-400/30"
                : t.kind === "info"
                ? "bg-sky-950/90 text-sky-100 ring-sky-400/30"
                : "bg-rose-950/90 text-rose-100 ring-rose-400/30"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
