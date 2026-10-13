"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { deleteRejectedOffers, discoverOffers, patchOffer, searchOffers } from "@/lib/api-client";
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
import {
  IconAlert,
  IconBolt,
  IconCheck,
  IconKey,
  IconPlus,
  IconSearch,
  IconSpinner,
  IconX,
} from "./icons";

type Filter = OfferStatus;
type QuickFilter = "todos" | "frete-gratis" | "comissao" | "prontos-publicar";
type SortKey = "oportunidade" | "recentes" | "desconto" | "comissao" | "menor-preco";

const FILTERS: { key: Filter; label: string }[] = [
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

interface SessionDiagnosticData {
  provider: "mercadolivre" | "shopee";
  status: "conectado" | "expirado" | "inexistente" | "chave_ausente" | "storage_indisponivel" | "bloqueado";
  updatedAt: string | null;
  expiresAt: string | null;
  lastValidationAt: string | null;
  lastErrorSanitized: string | null;
  actionRequired: string | null;
  environment: string;
}

export function OfferDashboard({ initial }: { initial: OffersResponse }) {
  const [offers, setOffers] = useState<Offer[]>(initial.offers);
  const [lastSearch, setLastSearch] = useState<LastSearchInfo | null>(initial.lastSearch);
  const [terms, setTerms] = useState<string[]>(initial.config.defaultTerms);
  const [newTerm, setNewTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("pendente");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("todos");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("oportunidade");
  const [discovering, setDiscovering] = useState(false);
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  // Seleção múltipla para exclusão em Rejeitados
  const [selectedRejected, setSelectedRejected] = useState<Set<string>>(new Set());
  const [deletingRejected, setDeletingRejected] = useState(false);

  // Diagnósticos seguros de sessão
  const [sessionDiagnostic, setSessionDiagnostic] = useState<{
    mercadolivre?: SessionDiagnosticData;
    shopee?: SessionDiagnosticData;
  } | null>(null);
  const [showSecureSessionModal, setShowSecureSessionModal] = useState(false);
  const [secureCookieInput, setSecureCookieInput] = useState("");
  const [savingSecureCookie, setSavingSecureCookie] = useState(false);

  const [isConnected, setIsConnected] = useState(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("ml_success")) return true;
    }
    return initial.config.mercadoLivreConnected;
  });

  // Automação e Agendador
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
  const [channelInput, setChannelInput] = useState(initial.automation?.channelDestination || "Grupo VIP de Ofertas");
  const [dailyTargetInput, setDailyTargetInput] = useState(initial.scheduler?.dailyTarget || 60);
  const [updatingScheduler, setUpdatingScheduler] = useState(false);
  const [dispatchingNow, setDispatchingNow] = useState(false);

  function notify(kind: Toast["kind"], text: string) {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }

  // Carrega status seguro de sessão (sem segredos)
  async function reloadSessionDiagnostics() {
    try {
      const res = await fetch("/api/auth/session/status", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSessionDiagnostic(data.providers);
      }
    } catch {
      // silencioso
    }
  }

  useEffect(() => {
    reloadSessionDiagnostics();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("ml_success")) {
      notify("ok", "Conta do Mercado Livre conectada com sucesso!");
      setIsConnected(true);
      reloadSessionDiagnostics();
      window.history.replaceState({}, "", "/");
    } else if (url.searchParams.get("ml_error")) {
      notify("erro", `Erro de autorização: ${url.searchParams.get("ml_error")}`);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // ---------- Contadores estritos ----------
  const counts = useMemo(() => {
    const c: Record<OfferStatus, number> = { pendente: 0, aprovado: 0, publicado: 0, rejeitado: 0 };
    for (const o of offers) {
      if (c[o.status] !== undefined) {
        c[o.status]++;
      }
    }
    return c;
  }, [offers]);

  const approvedWaitingCount = useMemo(() => {
    return offers.filter(
      (o) =>
        o.status === "aprovado" &&
        o.whatsappStatus !== "enviado" &&
        o.whatsappStatus !== "falhou"
    ).length;
  }, [offers]);

  // Recarrega ofertas e agendador
  async function reloadOffersAndScheduler() {
    try {
      const res = await fetch("/api/offers", { cache: "no-store" });
      if (res.ok) {
        const data: OffersResponse = await res.json();
        setOffers(data.offers);
        if (data.scheduler) setScheduler(data.scheduler);
        if (data.schedulerStats) setSchedulerStats(data.schedulerStats);
      }
    } catch {
      // silencioso
    }
  }

  useEffect(() => {
    if (scheduler.state !== "ativo") return;
    const interval = setInterval(() => {
      reloadOffersAndScheduler();
    }, 15_000);
    return () => clearInterval(interval);
  }, [scheduler.state]);

  // ---------- Filtro + busca por nome + ordenação ----------
  const visible = useMemo(() => {
    const q = query
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const list = offers.filter((o) => {
      // Filtro estrito de categoria
      if (o.status !== filter) return false;

      // Filtros rápidos
      if (quickFilter === "frete-gratis" && !o.freeShipping) return false;
      if (quickFilter === "comissao" && (!o.commission || o.commission.amount <= 0)) return false;
      if (quickFilter === "prontos-publicar" && o.status !== "aprovado" && o.whatsappStatus !== "pronto") return false;

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

  // ---------- Descoberta Automática (Radar) com trava de 500 pendentes ----------
  async function handleDiscoverRadar() {
    if (counts.pendente >= 500) {
      notify(
        "info",
        "Você já tem 500 ofertas pendentes para aprovar. Aprove, publique ou rejeite algumas ofertas antes de atualizar o Radar novamente."
      );
      return;
    }

    setDiscovering(true);
    setSearchError(null);
    try {
      const result = await discoverOffers();
      setOffers(result.offers);
      setLastSearch(result.lastSearch);
      const { added, updated } = result.lastSearch;
      notify("ok", `Radar de Ofertas atualizado: ${added} nova(s) pendente(s), ${updated} atualizada(s).`);
      for (const e of result.errors) notify("erro", `“${e.term}”: ${e.message}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao rodar descoberta automática.";
      setSearchError(msg);
      notify("erro", msg);
    } finally {
      setDiscovering(false);
    }
  }

  // ---------- Busca Manual por Termos ----------
  async function handleSearch() {
    if (counts.pendente >= 500) {
      notify(
        "info",
        "Você já tem 500 ofertas pendentes para aprovar. Aprove, publique ou rejeite algumas ofertas antes de atualizar o Radar novamente."
      );
      return;
    }

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
      const msg = err instanceof Error ? err.message : "Erro ao buscar ofertas.";
      setSearchError(msg);
      notify("erro", msg);
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

  // ---------- Exclusão definitiva de rejeitados com tombstone ----------
  async function handleDeleteRejectedList(idsToDelete: string[]) {
    if (idsToDelete.length === 0) return;
    const confirmed = window.confirm(
      `Excluir definitivamente ${idsToDelete.length} oferta(s) rejeitada(s)?\n\nElas serão registradas com tombstone seguro e não voltarão a ser capturadas pelo Radar.`
    );
    if (!confirmed) return;

    setDeletingRejected(true);
    try {
      const result = await deleteRejectedOffers(idsToDelete);
      const idsSet = new Set(idsToDelete);
      setOffers((list) => list.filter((o) => !idsSet.has(o.id)));
      setSelectedRejected((prev) => {
        const next = new Set(prev);
        for (const id of idsToDelete) next.delete(id);
        return next;
      });
      notify("ok", result.message || `${idsToDelete.length} oferta(s) excluída(s) definitivamente.`);
    } catch (err) {
      notify("erro", err instanceof Error ? err.message : "Erro ao excluir ofertas rejeitadas.");
    } finally {
      setDeletingRejected(false);
    }
  }

  function handleToggleSelect(id: string) {
    setSelectedRejected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAllVisible() {
    if (selectedRejected.size === visible.length) {
      setSelectedRejected(new Set());
    } else {
      setSelectedRejected(new Set(visible.map((o) => o.id)));
    }
  }

  // ---------- Salvamento seguro de sessão criptografada ----------
  async function handleSaveSecureSession(e: React.FormEvent) {
    e.preventDefault();
    if (!secureCookieInput.trim()) return;
    setSavingSecureCookie(true);
    try {
      const res = await fetch("/api/auth/cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: secureCookieInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar sessão");
      notify("ok", data.message || "Sessão criptografada ativada com sucesso!");
      setShowSecureSessionModal(false);
      setSecureCookieInput("");
      await reloadSessionDiagnostics();
      await reloadOffersAndScheduler();
    } catch (err) {
      notify("erro", err instanceof Error ? err.message : "Erro ao criptografar sessão");
    } finally {
      setSavingSecureCookie(false);
    }
  }

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
        headers: { "x-requested-with": "XMLHttpRequest" },
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

  function addTerm() {
    const t = newTerm.trim().toLowerCase();
    if (!t) return;
    if (!terms.includes(t) && terms.length < 10) setTerms([...terms, t]);
    setNewTerm("");
  }

  const mlStatus = sessionDiagnostic?.mercadolivre?.status || (isConnected ? "conectado" : "inexistente");
  const isQueueFull = counts.pendente >= 500;

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
            <p className="text-xs sm:text-sm text-slate-400">Seleção com Score 0–100 · Filtros Eliminatórios · Envio WhatsApp Preservado</p>
          </div>
        </div>
        {lastSearch && (
          <p className="text-xs text-slate-400">
            Última varredura: <span className="font-medium text-slate-300">{formatDateTime(lastSearch.at)}</span> ·{" "}
            {lastSearch.found} produto(s)
          </p>
        )}
      </header>

      {/* ================= Diagnóstico Seguro de Sessão e Provedores ================= */}
      <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`h-3 w-3 rounded-full ${
                mlStatus === "conectado" ? "bg-emerald-400 shadow-md shadow-emerald-400/50 animate-pulse" : "bg-amber-400"
              }`}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">Mercado Livre:</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    mlStatus === "conectado"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  {mlStatus === "conectado" ? "Sessão Ativa (AES-256-GCM)" : `Status: ${mlStatus}`}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Persistência server-side protegida · Cookies nunca expostos no navegador.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/auth/mercadolivre"
              className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 transition inline-flex items-center gap-1"
            >
              🔄 Reconectar OAuth
            </a>
            <button
              type="button"
              onClick={() => setShowSecureSessionModal(!showSecureSessionModal)}
              className="rounded-xl border border-teal-400/30 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-200 hover:bg-teal-500/20 transition"
            >
              🔒 Sessão meli.la
            </button>
            <button
              type="button"
              onClick={reloadSessionDiagnostics}
              className="rounded-xl border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/5 transition"
              title="Verificar status atualizado"
            >
              Validar
            </button>
          </div>
        </div>

        {/* Modal/Formulário Seguro de Sessão Criptografada */}
        {showSecureSessionModal && (
          <form
            onSubmit={handleSaveSecureSession}
            className="mt-3 border-t border-white/10 pt-3 flex flex-col sm:flex-row gap-2"
          >
            <input
              type="password"
              value={secureCookieInput}
              onChange={(e) => setSecureCookieInput(e.target.value)}
              placeholder="Cole o cookie de sessão para criptografar no cofre do servidor (AES-256-GCM)"
              className="field !bg-black/60 text-xs flex-1 font-mono"
            />
            <button
              type="submit"
              disabled={savingSecureCookie || !secureCookieInput.trim()}
              className="rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-bold text-xs px-4 py-2 transition disabled:opacity-50 shrink-0"
            >
              {savingSecureCookie ? "Criptografando…" : "Ativar Sessão Segura"}
            </button>
          </form>
        )}

        {/* Status Shopee */}
        <div className="mt-2.5 pt-2.5 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-slate-500" />
            <span>
              <strong className="text-slate-300">Shopee:</strong> Aprovado no programa de afiliados · Integração aguarda credenciais da API Open Platform.
            </span>
          </div>
          <span className="text-[10px] text-slate-500">Mecanismo oficial</span>
        </div>
      </section>

      {/* ================= Radar de Ofertas + Trava de 500 Pendentes ================= */}
      <section aria-labelledby="radar-titulo" className="glass mt-4 rounded-3xl p-4 sm:p-6 ring-1 ring-white/10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h2 id="radar-titulo" className="text-sm font-bold uppercase tracking-wider text-emerald-300">
                Descoberta Automática Recorrente
              </h2>
            </div>
            <p className="text-xs text-slate-300">
              Varre categorias prioritárias, aplica filtros eliminatórios (Preço &gt; R$ 50,00, estoque e descontos reais) e calcula score 0–100.
            </p>
            {/* Indicador de Capacidade da Fila */}
            <div className="pt-1 flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-400">Capacidade da Fila:</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isQueueFull
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                    : counts.pendente >= 400
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                }`}
              >
                {counts.pendente} / 500 pendentes {isQueueFull ? "(Limite atingido)" : ""}
              </span>
            </div>
          </div>

          <button
            type="button"
            id="descoberta-radar"
            onClick={handleDiscoverRadar}
            disabled={discovering || searching || isQueueFull}
            className={`group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-2xl px-6 py-3.5 text-sm sm:text-base font-black text-white shadow-xl shadow-emerald-950/50 transition shrink-0 ${
              isQueueFull
                ? "bg-slate-700 cursor-not-allowed opacity-60"
                : "bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:brightness-110 active:scale-95 disabled:cursor-wait disabled:opacity-80"
            }`}
            title={isQueueFull ? "Você já tem 500 ofertas pendentes. Aprove, publique ou rejeite antes de atualizar." : ""}
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            {discovering ? <IconSpinner width={18} height={18} /> : <IconBolt width={18} height={18} />}
            {discovering ? "Varrendo Categorias…" : isQueueFull ? "Fila Cheia (500 Pendentes)" : "Atualizar Radar de Ofertas"}
          </button>
        </div>

        {searchError && (
          <p role="alert" className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200 ring-1 ring-rose-400/20">
            {searchError}
          </p>
        )}
      </section>

      {/* ================= Abas Estritas (Sem aba 'Todos') ================= */}
      <section aria-label="Resumo" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FILTERS.map(({ key, label }) => {
          const color = STATUS_STYLES[key].text;
          const dot = STATUS_STYLES[key].dot;
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              id={`resumo-${key}`}
              onClick={() => setFilter(key)}
              className={`glass rounded-2xl p-3 text-left transition hover:bg-white/[0.07] ${
                active ? "ring-2 ring-emerald-400/50 bg-white/[0.05]" : ""
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
          {/* Linha 1: Abas Estritas */}
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
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    active ? "bg-white/15 text-white shadow font-bold" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[key].dot}`} />
                  {label}
                  <span className="rounded bg-black/40 px-1.5 text-[10px] tabular-nums text-slate-300 font-bold">{counts[key]}</span>
                </button>
              );
            })}
          </div>

          {/* Barra de Ações para REJEITADOS (Exclusão definitiva com Tombstones) */}
          {filter === "rejeitado" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-200">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  className="rounded-lg border border-rose-400/30 px-2.5 py-1 text-xs font-semibold hover:bg-rose-500/20 transition"
                >
                  {selectedRejected.size === visible.length && visible.length > 0
                    ? "Desmarcar Todos"
                    : "Selecionar Todos os Rejeitados"}
                </button>
                <span>
                  {selectedRejected.size} de {visible.length} selecionada(s)
                </span>
              </div>

              <button
                type="button"
                disabled={deletingRejected || selectedRejected.size === 0}
                onClick={() => handleDeleteRejectedList(Array.from(selectedRejected))}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 px-3.5 py-1.5 font-bold text-xs text-white transition disabled:opacity-40"
              >
                {deletingRejected ? "Excluindo…" : `Excluir Definitivamente (${selectedRejected.size})`}
              </button>
            </div>
          )}

          {/* Linha 2: Busca por nome + Ordenação */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" width={14} height={14} />
              <input
                id="busca-nome"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar produto nesta categoria…"
                className="field pl-8! text-xs py-1.5!"
              />
            </div>
            <select
              id="ordenar"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="field w-auto! cursor-pointer text-xs py-1.5!"
            >
              <option value="oportunidade">Pontuação de Score 0–100</option>
              <option value="recentes">Mais recentes</option>
              <option value="desconto">Maior desconto</option>
              <option value="menor-preco">Menor preço</option>
            </select>
          </div>
        </div>
      </div>

      {/* ================= Lista de ofertas ================= */}
      <section aria-label="Ofertas" className="mt-5">
        {/* Painel do Agendador (na aba Aprovados) */}
        {filter === "aprovado" && (
          <div className="glass mb-5 rounded-2xl p-4 ring-1 ring-white/10">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-white/5 pb-3">
              <div className="flex flex-wrap items-center gap-2.5">
                {scheduler.state === "ativo" ? (
                  <button
                    type="button"
                    onClick={() => handleToggleScheduler("pausado")}
                    disabled={updatingScheduler}
                    className="rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 px-3 py-1.5 text-xs font-bold hover:bg-amber-500/30 transition"
                  >
                    ⏸️ Pausar Agendador
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleToggleScheduler("ativo")}
                    disabled={updatingScheduler}
                    className="rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-3 py-1.5 text-xs font-bold hover:bg-emerald-500/30 transition"
                  >
                    ▶️ Iniciar Agendador
                  </button>
                )}
                <span className="text-xs text-slate-300">
                  Janela operacional: <strong>07:00 às 00:00</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="disparar-proxima-agora"
                  onClick={handleManualDispatch}
                  disabled={dispatchingNow || approvedWaitingCount === 0}
                  className="rounded-xl bg-sky-500/20 border border-sky-400/30 text-sky-200 px-3 py-1.5 text-xs font-bold hover:bg-sky-500/30 transition disabled:opacity-40"
                >
                  {dispatchingNow ? "Processando envio…" : "⚡ Processar Próxima Agora"}
                </button>
              </div>
            </div>

            {/* Indicadores em Tempo Real */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/5">
                <span className="block text-[10px] font-medium uppercase text-slate-400">📦 Aprovadas na Fila</span>
                <span className="mt-0.5 block text-xl font-black text-white">{schedulerStats.aprovadasFila}</span>
              </div>
              <div className="rounded-xl bg-sky-500/10 p-2.5 ring-1 ring-sky-500/20">
                <span className="block text-[10px] font-medium uppercase text-sky-300">🕒 Agendadas Hoje</span>
                <span className="mt-0.5 block text-xl font-black text-sky-200">{schedulerStats.agendadasHoje}</span>
              </div>
              <div className="rounded-xl bg-emerald-500/10 p-2.5 ring-1 ring-emerald-500/20">
                <span className="block text-[10px] font-medium uppercase text-emerald-300">🚀 Enviadas Hoje</span>
                <span className="mt-0.5 block text-xl font-black text-emerald-200">{schedulerStats.enviadasHoje}</span>
              </div>
              <div className="rounded-xl bg-rose-500/10 p-2.5 ring-1 ring-rose-500/20">
                <span className="block text-[10px] font-medium uppercase text-rose-300">⚠️ Com Falha</span>
                <span className="mt-0.5 block text-xl font-black text-rose-200">{schedulerStats.comFalha}</span>
              </div>
            </div>
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
            Nenhuma oferta nesta categoria ({filter}){query ? ` com o texto “${query}”` : ""}.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((offer, i) => (
              <OfferCard
                key={`${offer.id}:${offer.updatedAt}`}
                offer={offer}
                index={i}
                onUpdate={handleUpdate}
                onDelete={(id) => handleDeleteRejectedList([id])}
                isSelected={selectedRejected.has(offer.id)}
                onToggleSelect={handleToggleSelect}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="mt-16 text-center text-xs text-slate-500">
        Radar de Ofertas · Supabase PostgreSQL Compartilhado · Envio WhatsApp Oficial Preservado
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
