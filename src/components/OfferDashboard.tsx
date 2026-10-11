"use client";

import { useMemo, useRef, useState } from "react";
import { patchOffer, searchOffers } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { LastSearchInfo, Offer, OfferStatus, OfferUpdate, OffersResponse } from "@/lib/types";
import { OfferCard } from "./OfferCard";
import { STATUS_STYLES } from "./StatusBadge";
import { IconAlert, IconBolt, IconKey, IconPlus, IconSearch, IconSpinner, IconX } from "./icons";

type Filter = "todos" | OfferStatus;
type SortKey = "recentes" | "desconto" | "menor-preco";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendente", label: "Pendentes" },
  { key: "aprovado", label: "Aprovados" },
  { key: "rejeitado", label: "Rejeitados" },
];

interface Toast {
  id: number;
  kind: "ok" | "erro";
  text: string;
}

export function OfferDashboard({ initial }: { initial: OffersResponse }) {
  const [offers, setOffers] = useState<Offer[]>(initial.offers);
  const [lastSearch, setLastSearch] = useState<LastSearchInfo | null>(initial.lastSearch);
  const [terms, setTerms] = useState<string[]>(initial.config.defaultTerms);
  const [newTerm, setNewTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recentes");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const configured = initial.config.mercadoLivreConfigured;

  function notify(kind: Toast["kind"], text: string) {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }

  // ---------- Contadores ----------
  const counts = useMemo(() => {
    const c = { todos: offers.length, pendente: 0, aprovado: 0, rejeitado: 0 };
    for (const o of offers) c[o.status]++;
    return c;
  }, [offers]);

  // ---------- Filtro + busca por nome + ordenação ----------
  const visible = useMemo(() => {
    const q = query
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const list = offers.filter((o) => {
      if (filter !== "todos" && o.status !== filter) return false;
      if (!q) return true;
      const title = o.title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return title.includes(q);
    });
    if (sort === "desconto") list.sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0));
    if (sort === "menor-preco") list.sort((a, b) => a.price - b.price);
    return list;
  }, [offers, filter, query, sort]);

  // ---------- Ações ----------
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
      notify("ok", `Busca concluída: ${added} nova(s), ${updated} atualizada(s).`);
      for (const e of result.errors) notify("erro", `“${e.term}”: ${e.message}`);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Erro ao buscar ofertas.");
    } finally {
      setSearching(false);
    }
  }

  async function handleUpdate(id: string, update: OfferUpdate) {
    const saved = await patchOffer(id, update); // se falhar, o card mostra o erro
    setOffers((list) => list.map((o) => (o.id === id ? saved : o)));
    if (update.status === "aprovado") notify("ok", "Oferta aprovada e salva.");
    else if (update.status === "rejeitado") notify("ok", "Oferta rejeitada.");
    else if (update.status === "pendente") notify("ok", "Oferta voltou para pendente.");
    else notify("ok", "Alterações salvas.");
  }

  function addTerm() {
    const t = newTerm.trim().toLowerCase();
    if (!t) return;
    if (!terms.includes(t) && terms.length < 10) setTerms([...terms, t]);
    setNewTerm("");
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      {/* ================= Cabeçalho ================= */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-900/40">
            <IconBolt width={24} height={24} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Painel de Ofertas <span className="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent">Afiliadas</span>
            </h1>
            <p className="text-sm text-slate-400">Pesquise, revise e aprove ofertas antes de publicar.</p>
          </div>
        </div>
        {lastSearch && (
          <p className="text-xs text-slate-400">
            Última busca: <span className="font-medium text-slate-300">{formatDateTime(lastSearch.at)}</span> ·{" "}
            {lastSearch.found} produto(s)
          </p>
        )}
      </header>

      {/* ================= Aviso obrigatório ================= */}
      <div
        role="note"
        className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-100"
      >
        <IconAlert className="mt-0.5 shrink-0 text-amber-300" />
        <p>
          <strong className="font-semibold text-amber-200">Atenção:</strong> Preço, estoque e regras de cupom podem
          mudar. Use apenas links oficiais de afiliado.
        </p>
      </div>

      {/* ================= Aviso de credenciais ================= */}
      {!configured && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/[0.07] px-4 py-3 text-sm text-sky-100">
          <IconKey className="mt-0.5 shrink-0 text-sky-300" />
          <div className="space-y-1">
            <p className="font-semibold text-sky-200">Falta configurar o acesso à API do Mercado Livre</p>
            <p className="text-sky-100/80">
              A API oficial exige um aplicativo gratuito. Crie em{" "}
              <a
                className="underline hover:text-white"
                href="https://developers.mercadolivre.com.br/devcenter"
                target="_blank"
                rel="noopener noreferrer"
              >
                developers.mercadolivre.com.br
              </a>
              , copie o <code className="rounded bg-black/30 px-1">Client ID</code> e o{" "}
              <code className="rounded bg-black/30 px-1">Client Secret</code> para o arquivo{" "}
              <code className="rounded bg-black/30 px-1">.env.local</code> e reinicie o painel. Veja o README.
            </p>
          </div>
        </div>
      )}

      {/* ================= Busca no Mercado Livre ================= */}
      <section aria-labelledby="titulo-busca" className="glass mt-6 rounded-3xl p-4 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <h2 id="titulo-busca" className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Termos de busca no Mercado Livre
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {terms.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] py-1 pl-3 pr-1 text-sm text-slate-200 ring-1 ring-white/10"
                >
                  {t}
                  <button
                    type="button"
                    aria-label={`Remover termo ${t}`}
                    onClick={() => setTerms(terms.filter((x) => x !== t))}
                    className="rounded-full p-1 text-slate-400 transition hover:bg-white/10 hover:text-rose-300"
                  >
                    <IconX width={12} height={12} />
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
                <label htmlFor="novo-termo" className="sr-only">
                  Novo termo de busca
                </label>
                <input
                  id="novo-termo"
                  value={newTerm}
                  onChange={(e) => setNewTerm(e.target.value)}
                  placeholder="Adicionar termo…"
                  maxLength={80}
                  className="field w-40! rounded-full! py-1.5!"
                />
                <button
                  type="submit"
                  aria-label="Adicionar termo"
                  className="rounded-full bg-white/[0.06] p-2 text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-emerald-300"
                >
                  <IconPlus width={14} height={14} />
                </button>
              </form>
            </div>
            <p className="text-xs text-slate-500">
              Padrão definido em <code>SEARCH_TERMS</code> no .env.local · até {initial.config.resultsPerTerm} produtos
              por termo.
            </p>
          </div>

          <button
            type="button"
            id="buscar-ofertas"
            onClick={handleSearch}
            disabled={searching}
            className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-500 to-teal-500 px-7 py-4 text-base font-bold text-white shadow-xl shadow-emerald-900/40 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-80 lg:min-w-56"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            {searching ? <IconSpinner width={20} height={20} /> : <IconSearch width={20} height={20} />}
            {searching ? "Buscando ofertas…" : "Buscar ofertas"}
          </button>
        </div>

        {searchError && (
          <p role="alert" className="mt-4 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-400/20">
            {searchError}
          </p>
        )}
      </section>

      {/* ================= Estatísticas ================= */}
      <section aria-label="Resumo" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {FILTERS.map(({ key, label }) => {
          const color =
            key === "todos" ? "text-white" : STATUS_STYLES[key].text;
          const dot = key === "todos" ? "bg-slate-300" : STATUS_STYLES[key].dot;
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              id={`resumo-${key}`}
              onClick={() => setFilter(key)}
              className={`glass rounded-2xl p-4 text-left transition hover:bg-white/[0.07] ${
                active ? "ring-1 ring-white/25" : ""
              }`}
            >
              <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                <span className={`h-2 w-2 rounded-full ${dot}`} /> {label}
              </span>
              <span className={`mt-1 block text-3xl font-extrabold tabular-nums ${color}`}>{counts[key]}</span>
            </button>
          );
        })}
      </section>

      {/* ================= Filtros (fixos ao rolar) ================= */}
      <div className="sticky top-0 z-20 -mx-4 mt-6 border-b border-white/5 bg-ink-950/80 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div role="tablist" aria-label="Filtrar por status" className="flex gap-1 overflow-x-auto rounded-2xl bg-white/[0.04] p-1 ring-1 ring-white/5">
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
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                    active ? "bg-white/10 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {key !== "todos" && <span className={`h-2 w-2 rounded-full ${STATUS_STYLES[key].dot}`} />}
                  {label}
                  <span className="rounded-md bg-black/30 px-1.5 text-xs tabular-nums text-slate-300">{counts[key]}</span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1 md:w-72">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" width={16} height={16} />
              <label htmlFor="busca-nome" className="sr-only">
                Buscar por nome do produto
              </label>
              <input
                id="busca-nome"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome do produto…"
                className="field pl-9!"
              />
            </div>
            <label htmlFor="ordenar" className="sr-only">
              Ordenar
            </label>
            <select
              id="ordenar"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="field w-auto! cursor-pointer"
            >
              <option value="recentes">Mais recentes</option>
              <option value="desconto">Maior desconto</option>
              <option value="menor-preco">Menor preço</option>
            </select>
          </div>
        </div>
      </div>

      {/* ================= Lista de ofertas ================= */}
      <section aria-label="Ofertas" className="mt-6">
        {offers.length === 0 ? (
          <div className="glass flex flex-col items-center rounded-3xl px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20">
              <IconSearch width={28} height={28} />
            </div>
            <h2 className="text-lg font-bold text-white">Nenhuma oferta ainda</h2>
            <p className="mt-1 max-w-md text-sm text-slate-400">
              Clique em <strong className="text-slate-200">Buscar ofertas</strong> para trazer produtos reais do Mercado
              Livre. Eles chegam como <span className="text-amber-300">pendentes</span> para você revisar.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="glass rounded-3xl px-6 py-12 text-center text-sm text-slate-400">
            Nenhuma oferta encontrada com este filtro{query ? ` e o texto “${query}”` : ""}.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((offer, i) => (
              <OfferCard key={`${offer.id}:${offer.updatedAt}`} offer={offer} index={i} onUpdate={handleUpdate} />
            ))}
          </div>
        )}
      </section>

      <footer className="mt-16 text-center text-xs text-slate-500">
        MVP local · Dados salvos em <code>data/ofertas.json</code> · Nenhuma publicação automática
      </footer>

      {/* ================= Notificações ================= */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-toast-in rounded-xl px-4 py-3 text-sm font-medium shadow-2xl ring-1 backdrop-blur-xl ${
              t.kind === "ok"
                ? "bg-emerald-950/90 text-emerald-100 ring-emerald-400/30"
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
