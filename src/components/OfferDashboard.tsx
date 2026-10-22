"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { deleteRejectedOffers, discoverOffers, patchOffer, searchOffers, updateOffers } from "@/lib/api-client";
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
import { SchedulerConfigModal } from "./SchedulerConfigModal";
import { ManualPublishModal } from "./ManualPublishModal";
import { LearnedPreferencesModal } from "./LearnedPreferencesModal";
import {
  IconAlert,
  IconBolt,
  IconBrain,
  IconCheck,
  IconClock,
  IconGear,
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
  const [filter, setFilter] = useState<Filter>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("active_offer_tab") as Filter | null;
      if (saved && ["pendente", "aprovado", "publicado", "rejeitado"].includes(saved)) {
        return saved;
      }
    }
    return "pendente";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("active_offer_tab", filter);
    }
  }, [filter]);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("todos");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("oportunidade");
  const [discovering, setDiscovering] = useState(false);
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  // Seleção múltipla para exclusão em Rejeitados e publicação imediata em Aprovados
  const [selectedRejected, setSelectedRejected] = useState<Set<string>>(new Set());
  const [deletingRejected, setDeletingRejected] = useState(false);
  const [selectedApproved, setSelectedApproved] = useState<Set<string>>(new Set());
  const [showSchedulerModal, setShowSchedulerModal] = useState(false);
  const [showManualPublishModal, setShowManualPublishModal] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [isPublishingManual, setIsPublishingManual] = useState(false);

  // Diagnósticos seguros de sessão
  const [sessionDiagnostic, setSessionDiagnostic] = useState<{
    mercadolivre?: SessionDiagnosticData;
    shopee?: SessionDiagnosticData;
  } | null>(null);
  const [showSecureSessionModal, setShowSecureSessionModal] = useState(false);
  const [secureCookieInput, setSecureCookieInput] = useState("");
  const [savingSecureCookie, setSavingSecureCookie] = useState(false);
  const [syncingFavorites, setSyncingFavorites] = useState(false);

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
      dailyTarget: 51,
      maxPerHour: 5,
      timezone: "America/Sao_Paulo",
      channelDestination: "Radar de Ofertas",
      consecutiveFailures: 0,
      maxConsecutiveFailures: 3,
      lastDispatchedAt: null,
      lastDispatchedOfferTitle: null,
      lastError: null,
      mode: "interval_minutes",
      distribution: "fixed",
      intervalMinutes: 20,
      postsPerHour: 3,
      minScore: 75,
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
      metaDiaria: 51,
      limiteHora: 5,
      mode: "interval_minutes",
      distribution: "fixed",
      intervalMinutes: 20,
      totalEstimadoDia: 51,
      proximosHorarios: [],
      minScore: 75,
      minPendingScore: 75,
      minAutoPublishScore: 75,
      minManualPublishScore: 75,
      requireVerifiableDiscount: true,
      windowStart: "07:00",
      windowEnd: "00:00",
    }
  );
  const [channelInput, setChannelInput] = useState(initial.automation?.channelDestination || "Radar de Ofertas");
  const [dailyTargetInput, setDailyTargetInput] = useState(initial.scheduler?.dailyTarget || 51);
  const [updatingScheduler, setUpdatingScheduler] = useState(false);
  const [dispatchingNow, setDispatchingNow] = useState(false);
  const [isSanitizing, setIsSanitizing] = useState(false);

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
    const interval = setInterval(reloadSessionDiagnostics, 60_000);
    return () => clearInterval(interval);
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

  const minPending = scheduler.minPendingScore ?? 75;
  const minManual = scheduler.minManualPublishScore ?? 75;

  const inconsistentOffers: Offer[] = [];

  // ---------- Contadores de ofertas ----------
  const counts = useMemo(() => {
    const c: Record<OfferStatus, number> = { pendente: 0, aprovado: 0, publicado: 0, rejeitado: 0 };
    for (const o of offers) {
      if (c[o.status] !== undefined) {
        c[o.status]++;
      } else if ((o.status as string) === "oferta_encontrada_agora") {
        c.pendente++;
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

  const hasLowScoreSelected = false;

  const schedulerSummaryText = useMemo(() => {
    const mode = scheduler.mode || "interval_minutes";
    const distText = scheduler.distribution === "randomized" ? " · Aleatório" : " · Fixo";
    if (mode === "daily_target") {
      return `Meta: ${scheduler.dailyTarget} posts/dia${distText}`;
    }
    if (mode === "posts_per_hour") {
      const postsPerHour = scheduler.postsPerHour || 3;
      const totalEstimado = schedulerStats.totalEstimadoDia || postsPerHour * 17;
      return `${postsPerHour} posts/hora · ${totalEstimado} posts/dia${distText}`;
    }
    const interval = scheduler.intervalMinutes || 20;
    const totalEstimado = schedulerStats.totalEstimadoDia || 51;
    return `A cada ${interval} min · ${totalEstimado} posts/dia${distText}`;
  }, [scheduler, schedulerStats]);

  const schedulerStatusBadge = useMemo(() => {
    if (scheduler.state === "pausado") {
      return {
        label: "Pausado",
        color: "bg-amber-500/20 text-amber-300 border-amber-400/30",
        dot: "bg-amber-400",
      };
    }
    if ((scheduler.consecutiveFailures ?? 0) >= 3) {
      return {
        label: "Com Falha Consecutiva",
        color: "bg-rose-500/20 text-rose-300 border-rose-400/30",
        dot: "bg-rose-400 animate-pulse",
      };
    }
    if (schedulerStats.aprovadasFila === 0) {
      return {
        label: "Sem Ofertas Elegíveis (Score ≥ 75)",
        color: "bg-sky-500/20 text-sky-300 border-sky-400/30",
        dot: "bg-sky-400",
      };
    }
    return {
      label: "Ativo e Operando",
      color: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
      dot: "bg-emerald-400 animate-pulse",
    };
  }, [scheduler.state, scheduler.consecutiveFailures, schedulerStats.aprovadasFila]);

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
      // Filtro de categoria com suporte a pendente e oferta_encontrada_agora
      const isPendenteMatch =
        filter === "pendente" &&
        (o.status === "pendente" || (o.status as string) === "oferta_encontrada_agora");
      if (o.status !== filter && !isPendenteMatch) return false;

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

  // ---------- Puxar Favoritos da Conta do Mercado Livre ----------
  async function handleSyncFavorites() {
    if (syncingFavorites) return;
    setSyncingFavorites(true);
    try {
      const res = await fetch("/api/preferences/sync-bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createOffers: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao puxar favoritos da sua conta.");
      }

      if (data.offers && Array.isArray(data.offers)) {
        setOffers(data.offers);
        if (data.lastSearch) setLastSearch(data.lastSearch);
      } else {
        await reloadOffersAndScheduler();
      }

      // Direciona o usuário para a aba de pendentes para visualizar as ofertas puxadas
      setFilter("pendente");

      const savedCount = data.offersSaved ?? data.imported ?? 0;
      notify(
        "ok",
        `⭐ ${data.imported || 0} produto(s) favorito(s) puxado(s) com sucesso! (${savedCount} adicionado(s)/atualizado(s) na fila de Pendentes)`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao puxar favoritos.";
      notify("erro", msg);
    } finally {
      setSyncingFavorites(false);
    }
  }

  // ---------- Atualização de Ofertas pelo Mercado Livre Brasil (MLB) ----------
  async function handleUpdateOffers() {
    if (discovering) return;

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
      const result = await updateOffers();
      // Atualiza o estado das ofertas diretamente com o retorno da API sem depender de dados antigos
      setOffers(result.offers);
      if (result.lastSearch) setLastSearch(result.lastSearch);
      
      const added = result.added ?? result.lastSearch?.added ?? 0;
      const updated = result.updated ?? result.lastSearch?.updated ?? 0;
      const found = result.found ?? result.stageCounts?.etapa1_itens_retornados_api ?? 0;
      const noBuyBox = result.skippedNoBuyBox ?? 0;
      const blocked = result.skippedBlocked ?? 0;
      const replica = result.skippedReplica ?? 0;
      const priceLow = result.skippedPrice ?? 0;

      // Notifica o usuário preservando a aba atual que ele está navegando
      if (added > 0) {
        notify(
          "ok",
          `Atualização concluída: ${added} nova(s) oferta(s) inserida(s), ${updated} atualizada(s)! (${found} analisadas)`
        );
      } else {
        // Se nenhuma nova foi criada, mantém a aba atual e exibe contagens de descarte
        notify(
          "info",
          `0 novas ofertas adicionadas (${found} analisadas): ${noBuyBox} sem Buy Box, ${blocked} bloqueadas, ${priceLow} < R$25, ${replica} réplicas, ${updated} já existentes atualizadas.`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao atualizar ofertas do Mercado Livre.";
      setSearchError(msg);
      notify("erro", msg);
    } finally {
      setDiscovering(false);
    }
  }

  // Alias para retrocompatibilidade
  const handleDiscoverRadar = handleUpdateOffers;

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
    if (filter === "aprovado") {
      setSelectedApproved((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setSelectedRejected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  }

  function handleSelectAllVisible() {
    if (filter === "aprovado") {
      if (selectedApproved.size === visible.length) {
        setSelectedApproved(new Set());
      } else {
        setSelectedApproved(new Set(visible.map((o) => o.id)));
      }
    } else {
      if (selectedRejected.size === visible.length) {
        setSelectedRejected(new Set());
      } else {
        setSelectedRejected(new Set(visible.map((o) => o.id)));
      }
    }
  }

  async function handleSaveSchedulerConfig(patch: Partial<SchedulerSettings>) {
    setUpdatingScheduler(true);
    try {
      const res = await fetch("/api/scheduler", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar agendador");
      setScheduler(data.settings);
      setSchedulerStats(data.stats);
      notify("ok", "Configurações do agendador salvas com sucesso!");
      await reloadOffersAndScheduler();
    } catch (err) {
      notify("erro", err instanceof Error ? err.message : "Erro ao salvar agendador");
      throw err;
    } finally {
      setUpdatingScheduler(false);
    }
  }

  async function handleExecuteManualPublish(offerIds: string[]) {
    setIsPublishingManual(true);
    try {
      const res = await fetch("/api/offers/publish-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao publicar ofertas");

      setSelectedApproved((prev) => {
        const next = new Set(prev);
        for (const item of data.results) {
          if (item.success) next.delete(item.id);
        }
        return next;
      });

      notify(
        data.totalSuccess > 0 ? "ok" : "info",
        `${data.totalSuccess} oferta(s) enviada(s) para o WhatsApp com sucesso!`
      );
      await reloadOffersAndScheduler();
      return data;
    } catch (err) {
      notify("erro", err instanceof Error ? err.message : "Erro no envio manual");
      throw err;
    } finally {
      setIsPublishingManual(false);
    }
  }

  // ---------- Rotina de Saneamento de Dados Idempotente ----------
  async function handleRunSanitize() {
    setIsSanitizing(true);
    try {
      const res = await fetch("/api/offers/sanitize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minPendingScore: scheduler.minPendingScore ?? 75,
          minManualPublishScore: scheduler.minManualPublishScore ?? 75,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao executar saneamento");
      notify("ok", `Saneamento concluído: ${data.movedToRejected} oferta(s) movida(s) para Rejeitados.`);
      await reloadOffersAndScheduler();
    } catch (err) {
      notify("erro", err instanceof Error ? err.message : "Erro no saneamento de dados");
    } finally {
      setIsSanitizing(false);
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
      {/* ================= Alerta Visível de Sessão do ML Expirada ================= */}
      {sessionDiagnostic?.mercadolivre &&
        (sessionDiagnostic.mercadolivre.status === "expirado" ||
          sessionDiagnostic.mercadolivre.status === "bloqueado") && (
          <aside
            role="alert"
            aria-live="assertive"
            className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-2xl border-2 border-rose-500/70 bg-gradient-to-r from-rose-950/90 via-red-900/60 to-slate-900/95 p-4 shadow-xl shadow-rose-950/40 backdrop-blur-md"
          >
            <div className="flex items-start sm:items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/30 text-rose-300 border border-rose-400/50 shadow-inner">
                <IconAlert width={24} height={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-400 animate-ping" />
                  <h2 className="text-sm sm:text-base font-extrabold text-white tracking-wide">
                    ⚠️ Atenção: A sessão do Mercado Livre expirou!
                  </h2>
                  <span className="rounded-full bg-rose-500/30 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-200 border border-rose-400/40">
                    {sessionDiagnostic.mercadolivre.status}
                  </span>
                </div>
                <p className="text-xs text-rose-200/90 mt-1">
                  {sessionDiagnostic.mercadolivre.lastErrorSanitized ||
                    "A sessão de afiliados expirou. As requisições de encurtamento meli.la e consultas de afiliados estão inativas até a renovação."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={() => setShowSecureSessionModal(true)}
                className="rounded-xl border border-rose-400/50 bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-500 shadow-md transition"
              >
                🔒 Renovar Sessão meli.la
              </button>
              <a
                href="/api/auth/mercadolivre"
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition"
              >
                OAuth
              </a>
            </div>
          </aside>
        )}

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
            <span className="h-2 w-2 rounded-full bg-orange-400 shadow-sm shadow-orange-400/50 animate-pulse" />
            <span>
              <strong className="text-white">Shopee:</strong> Conectado via API Oficial (Open Platform · AppID 18303261388)
            </span>
          </div>
          <span className="rounded-full bg-orange-500/10 border border-orange-500/30 px-2 py-0.5 text-[10px] font-bold text-orange-300 uppercase tracking-wider">
            API Oficial Ativa
          </span>
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
              Varre categorias prioritárias, aplica filtros eliminatórios (Preço ≥ R$ 24,99, estoque e descontos reais) e calcula score 0–100.
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

            {/* Indicador dos 3 Limites de Qualidade */}
            <div className="pt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-emerald-300 font-medium">
                Fila (Pendentes): <strong>Score ≥ {scheduler.minPendingScore ?? 75}</strong>
              </span>
              <span className="rounded-lg bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-sky-300 font-medium">
                Auto-Publicação: <strong>Score ≥ {scheduler.minAutoPublishScore ?? scheduler.minScore ?? 75}</strong>
              </span>
              <span className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-amber-300 font-medium">
                Publicação Manual: <strong>Score ≥ {scheduler.minManualPublishScore ?? 75}</strong>
              </span>
              <span className="rounded-lg bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-purple-300 font-medium">
                Desconto Verificável: <strong>{scheduler.requireVerifiableDiscount !== false ? "Obrigatório" : "Opcional"}</strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              id="btn-puxar-favoritos"
              onClick={handleSyncFavorites}
              disabled={syncingFavorites}
              title="Puxar produtos favoritados da sua conta do Mercado Livre e inserir como ofertas pendentes na sua fila"
              className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-600/15 px-4 py-3.5 text-xs sm:text-sm font-bold text-amber-200 hover:brightness-125 hover:border-amber-400 active:scale-95 transition shadow-lg shadow-amber-950/20 shrink-0 disabled:opacity-50"
            >
              {syncingFavorites ? <IconSpinner width={15} height={15} /> : <span className="text-sm">⭐</span>}
              {syncingFavorites ? "Puxando favoritos…" : "Puxar Meus Favoritos"}
            </button>

            <button
              type="button"
              onClick={() => setShowPreferencesModal(true)}
              title="Visualizar e gerenciar marcas, vendedores e categorias bloqueadas"
              className="inline-flex items-center gap-1.5 rounded-2xl border border-teal-500/30 bg-teal-500/10 px-4 py-3.5 text-xs font-semibold text-teal-200 hover:bg-teal-500/20 transition"
            >
              <IconBrain width={14} height={14} />
              Preferências Aprendidas
            </button>

            <button
              type="button"
              onClick={handleRunSanitize}
              disabled={isSanitizing}
              title="Reavaliar itens pendentes e mover ofertas abaixo do score para Rejeitados"
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition disabled:opacity-50"
            >
              {isSanitizing ? <IconSpinner width={14} height={14} /> : "🧹"}
              {isSanitizing ? "Saneando…" : "Sanear Fila"}
            </button>

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
              {discovering ? "Atualizando ofertas…" : isQueueFull ? "Fila Cheia (500 Pendentes)" : "Atualizar ofertas"}
            </button>
          </div>
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

          {/* Barra de Ações para APROVADOS (Publicação Imediata Manual) */}
          {filter === "aprovado" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-200">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  className="rounded-lg border border-emerald-400/30 px-2.5 py-1 text-xs font-semibold hover:bg-emerald-500/20 transition text-emerald-200"
                >
                  {selectedApproved.size === visible.length && visible.length > 0
                    ? "Desmarcar Todas"
                    : "Selecionar Todas as Aprovadas"}
                </button>
                <span className="text-slate-300">
                  {selectedApproved.size} de {visible.length} selecionada(s)
                </span>
                {hasLowScoreSelected && (
                  <span className="rounded-md bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    ⚠️ Contém itens com score &lt; {scheduler.minScore ?? 75}
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={isPublishingManual || selectedApproved.size === 0}
                onClick={() => setShowManualPublishModal(true)}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 px-3.5 py-1.5 font-bold text-xs text-white shadow-md shadow-emerald-950/40 transition disabled:opacity-40"
              >
                🚀 Enviar Agora para o WhatsApp ({selectedApproved.size})
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
                    className="rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 px-3 py-1.5 text-xs font-bold hover:bg-amber-500/30 transition shrink-0"
                  >
                    ⏸️ Pausar Agendador
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleToggleScheduler("ativo")}
                    disabled={updatingScheduler}
                    className="rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-3 py-1.5 text-xs font-bold hover:bg-emerald-500/30 transition shrink-0"
                  >
                    ▶️ Iniciar Agendador
                  </button>
                )}

                {/* Box compacta e elegante de configurações com ícone SVG de engrenagem próprio */}
                <button
                  type="button"
                  id="btn-configurar-agendador"
                  onClick={() => setShowSchedulerModal(true)}
                  className="group flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200 hover:border-emerald-400/50 hover:bg-white/[0.08] transition shadow-sm cursor-pointer"
                  title="Clique para configurar modos de agenda, janela de horário e aleatoriedade"
                >
                  <IconGear
                    width={15}
                    height={15}
                    className="text-emerald-400 group-hover:rotate-90 transition-transform duration-300 shrink-0"
                  />
                  <span className="font-bold text-white tracking-tight">{schedulerSummaryText}</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    · Janela {scheduler.startHour} às {scheduler.endHour}
                  </span>
                  <span className="text-[10px] text-emerald-300/80 underline underline-offset-2 ml-1">
                    Editar
                  </span>
                </button>

                {/* Badge de Status Transparente */}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${schedulerStatusBadge.color}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${schedulerStatusBadge.dot}`} />
                  {schedulerStatusBadge.label}
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
                  {dispatchingNow ? "Processando envio…" : "⚡ Processar Próxima da Fila"}
                </button>
              </div>
            </div>

            {/* Motivo quando não há ofertas elegíveis */}
            {schedulerStats.aprovadasFila === 0 && (
              <div className="mt-3 rounded-xl bg-sky-500/10 border border-sky-500/20 px-3 py-2 text-xs text-sky-200 flex items-start gap-2">
                <span className="font-bold text-sky-400">ℹ️ Diagnóstico:</span>
                <span>
                  {schedulerStats.motivoSemElegivel ||
                    `Nenhuma oferta aprovada elegível encontrada com score ≥ ${scheduler.minScore ?? 75} e dentro das categorias prioritárias permitidas.`}
                </span>
              </div>
            )}

            {/* Indicadores em Tempo Real Expandidos */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/5">
                <span className="block text-[10px] font-medium uppercase text-slate-400">📦 Elegíveis na Fila</span>
                <span className="mt-0.5 block text-xl font-black text-white">{schedulerStats.aprovadasFila}</span>
                <span className="text-[10px] text-slate-400">Score ≥ {scheduler.minScore ?? 75}</span>
              </div>
              <div className="rounded-xl bg-sky-500/10 p-2.5 ring-1 ring-sky-500/20">
                <span className="block text-[10px] font-medium uppercase text-sky-300">🕒 Agendadas Hoje</span>
                <span className="mt-0.5 block text-xl font-black text-sky-200">{schedulerStats.agendadasHoje}</span>
                <span className="text-[10px] text-sky-400/80">Janela operacional</span>
              </div>
              <div className="rounded-xl bg-emerald-500/10 p-2.5 ring-1 ring-emerald-500/20">
                <span className="block text-[10px] font-medium uppercase text-emerald-300">🚀 Enviadas Hoje</span>
                <span className="mt-0.5 block text-xl font-black text-emerald-200">{schedulerStats.enviadasHoje}</span>
                <span className="text-[10px] text-emerald-400/80">Meta: {schedulerStats.metaDiaria}</span>
              </div>
              <div className="rounded-xl bg-purple-500/10 p-2.5 ring-1 ring-purple-500/20">
                <span className="block text-[10px] font-medium uppercase text-purple-300">⏰ Próximo Envio</span>
                <span className="mt-0.5 block text-sm font-black text-purple-200 truncate">
                  {schedulerStats.proximoEnvio ? formatDateTime(schedulerStats.proximoEnvio) : "Aguardando"}
                </span>
                <span className="text-[10px] text-purple-400/80">
                  {scheduler.state === "pausado" ? "Pausado" : "Automático"}
                </span>
              </div>
              <div className="rounded-xl bg-teal-500/10 p-2.5 ring-1 ring-teal-500/20">
                <span className="block text-[10px] font-medium uppercase text-teal-300">✅ Último Envio</span>
                <span className="mt-0.5 block text-sm font-black text-teal-200 truncate" title={scheduler.lastDispatchedOfferTitle || ""}>
                  {scheduler.lastDispatchedAt ? formatDateTime(scheduler.lastDispatchedAt) : "Nenhum ainda"}
                </span>
                <span className="text-[10px] text-teal-400/80 truncate block">
                  {scheduler.lastDispatchedOfferTitle ? scheduler.lastDispatchedOfferTitle.slice(0, 18) + "…" : "Hoje"}
                </span>
              </div>
              <div className="rounded-xl bg-rose-500/10 p-2.5 ring-1 ring-rose-500/20">
                <span className="block text-[10px] font-medium uppercase text-rose-300">⚠️ Com Falha</span>
                <span className="mt-0.5 block text-xl font-black text-rose-200">{schedulerStats.comFalha}</span>
                <span className="text-[10px] text-rose-400/80">
                  {scheduler.consecutiveFailures > 0 ? `${scheduler.consecutiveFailures} consec.` : "Zero falhas"}
                </span>
              </div>
            </div>

            {/* Próximos horários previstos hoje */}
            {schedulerStats.proximosHorarios && schedulerStats.proximosHorarios.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-white/5 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-slate-400 text-[11px]">Próximos horários previstos:</span>
                {schedulerStats.proximosHorarios.slice(0, 8).map((hora, idx) => (
                  <span
                    key={idx}
                    className="rounded-md bg-white/[0.04] border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300"
                  >
                    {hora}
                  </span>
                ))}
                {schedulerStats.proximosHorarios.length > 8 && (
                  <span className="text-[10px] text-slate-500">
                    +{schedulerStats.proximosHorarios.length - 8} horários
                  </span>
                )}
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
                isSelected={filter === "aprovado" ? selectedApproved.has(offer.id) : selectedRejected.has(offer.id)}
                onToggleSelect={handleToggleSelect}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="mt-16 text-center text-xs text-slate-500">
        Radar de Ofertas · Supabase PostgreSQL Compartilhado · Envio WhatsApp Oficial Preservado
      </footer>

      {/* ================= Modais de Configuração e Publicação Manual ================= */}
      {showSchedulerModal && (
        <SchedulerConfigModal
          isOpen={showSchedulerModal}
          settings={scheduler}
          onClose={() => setShowSchedulerModal(false)}
          onSave={handleSaveSchedulerConfig}
          isSaving={updatingScheduler}
        />
      )}

      {showManualPublishModal && (
        <ManualPublishModal
          isOpen={showManualPublishModal}
          selectedOffers={offers.filter((o) => selectedApproved.has(o.id))}
          channelDestination={scheduler.channelDestination}
          minScore={scheduler.minManualPublishScore ?? 75}
          onClose={() => setShowManualPublishModal(false)}
          onConfirm={handleExecuteManualPublish}
          isPublishing={isPublishingManual}
        />
      )}

      {showPreferencesModal && (
        <LearnedPreferencesModal
          isOpen={showPreferencesModal}
          onClose={() => setShowPreferencesModal(false)}
          onLearningReset={async () => {
            notify("ok", "Aprendizado redefinido. Atualizando ofertas...");
            await reloadOffersAndScheduler();
          }}
        />
      )}

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
