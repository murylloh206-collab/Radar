"use client";

import { useEffect, useState } from "react";
import type { LearnedPreferences } from "@/lib/types";
import { IconBrain, IconSpinner, IconX, IconBan } from "./icons";

interface LearnedPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLearningReset?: () => void;
}

interface PreferencesStats {
  totalFeedbacks: number;
  totalApprovals: number;
  totalRejections: number;
  blockedBrandsCount: number;
  blockedSellersCount: number;
  blockedKeywordsCount: number;
  blockedCategoriesCount: number;
  modelTrained: boolean;
  lastTrainedAt: string | null;
}

export function LearnedPreferencesModal({
  isOpen,
  onClose,
  onLearningReset,
}: LearnedPreferencesModalProps) {
  const [preferences, setPreferences] = useState<LearnedPreferences | null>(null);
  const [stats, setStats] = useState<PreferencesStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadPreferences() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/preferences");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar preferências");
      setPreferences(data.preferences);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar preferências.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadPreferences();
    }
  }, [isOpen]);

  async function handleUnblock(type: "brand" | "seller" | "keyword" | "category", value: string) {
    setUnblocking(`${type}:${value}`);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/preferences", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao desbloquear item");
      setPreferences(data.preferences);
      setSuccess(`"${value}" foi removido dos bloqueios.`);
      setTimeout(() => setSuccess(null), 3000);
      loadPreferences();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao desbloquear.");
    } finally {
      setUnblocking(null);
    }
  }

  async function handleResetAll() {
    const confirmed = window.confirm(
      "Tem certeza que deseja redefinir todo o aprendizado de preferências?\n\nIsso limpará todas as marcas, vendedores e termos bloqueados, além de zerar os pesos do classificador para que você recomece do zero."
    );
    if (!confirmed) return;

    setResetting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao resetar");
      setPreferences(data.preferences);
      setSuccess("Todo o aprendizado foi redefinido com sucesso! O algoritmo recomeçou do zero.");
      if (onLearningReset) onLearningReset();
      loadPreferences();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao resetar aprendizado.");
    } finally {
      setResetting(false);
    }
  }

  if (!isOpen) return null;

  const totalDecisions = (stats?.totalApprovals ?? 0) + (stats?.totalRejections ?? 0);
  const modelStatusLabel =
    totalDecisions >= 50
      ? "Classificador Linear Treinado Ativo (>= 50 decisões)"
      : totalDecisions >= 30
      ? "Similaridade Híbrida & Calibração de Pesos (30–49 decisões)"
      : "Similaridade Direta de Cosseno (< 30 decisões)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="glass ring-1 ring-white/10 max-w-2xl w-full rounded-3xl p-6 shadow-2xl bg-ink-950 text-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <IconBrain width={22} height={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Preferências Aprendidas</h3>
              <p className="text-xs text-slate-400">
                Padrões aprendidos com suas aprovações, rejeições e bloqueios manuais.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition"
            aria-label="Fechar"
          >
            <IconX width={20} height={20} />
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-300">
            {success}
          </div>
        )}

        {loading && !preferences ? (
          <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
            <IconSpinner width={20} height={20} /> Carregando preferências…
          </div>
        ) : (
          <div className="space-y-6">
            {/* Status do Modelo de Aprendizado */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-teal-300 uppercase tracking-wider">
                  Status do Algoritmo de Aprendizado
                </span>
                <span className="rounded-full bg-teal-500/15 border border-teal-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-teal-200">
                  {modelStatusLabel}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
                <div className="rounded-xl bg-white/[0.02] border border-white/5 p-2">
                  <span className="text-xs text-slate-400 block">Total Decisões</span>
                  <strong className="text-base font-bold text-white">{totalDecisions}</strong>
                </div>
                <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-2">
                  <span className="text-xs text-emerald-300 block">Aprovadas</span>
                  <strong className="text-base font-bold text-emerald-300">
                    {stats?.totalApprovals ?? 0}
                  </strong>
                </div>
                <div className="rounded-xl bg-rose-500/5 border border-rose-500/20 p-2">
                  <span className="text-xs text-rose-300 block">Rejeitadas</span>
                  <strong className="text-base font-bold text-rose-300">
                    {stats?.totalRejections ?? 0}
                  </strong>
                </div>
                <div className="rounded-xl bg-purple-500/5 border border-purple-500/20 p-2">
                  <span className="text-xs text-purple-300 block">Exploração</span>
                  <strong className="text-base font-bold text-purple-300">15%</strong>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 pt-1">
                ℹ️ <strong>15% das ofertas</strong> são sempre reservadas para exploração (novos testes de categoria) para descobrir novas oportunidades fora do padrão atual.
              </p>
            </div>

            {/* Marcas Bloqueadas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <IconBan width={14} height={14} className="text-rose-400" />
                  Marcas Bloqueadas ({preferences?.blockedBrands?.length || 0})
                </h4>
              </div>

              {preferences?.blockedBrands && preferences.blockedBrands.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {preferences.blockedBrands.map((brand) => (
                    <span
                      key={brand}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-200"
                    >
                      <span>{brand}</span>
                      <button
                        type="button"
                        disabled={unblocking !== null}
                        onClick={() => handleUnblock("brand", brand)}
                        className="text-rose-400 hover:text-white transition p-0.5"
                        title="Desbloquear marca"
                      >
                        <IconX width={12} height={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">Nenhuma marca bloqueada no momento.</p>
              )}
            </div>

            {/* Vendedores Bloqueados */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <IconBan width={14} height={14} className="text-rose-400" />
                Vendedores Bloqueados ({preferences?.blockedSellers?.length || 0})
              </h4>

              {preferences?.blockedSellers && preferences.blockedSellers.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {preferences.blockedSellers.map((seller) => (
                    <span
                      key={seller}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-200"
                    >
                      <span>{seller}</span>
                      <button
                        type="button"
                        disabled={unblocking !== null}
                        onClick={() => handleUnblock("seller", seller)}
                        className="text-rose-400 hover:text-white transition p-0.5"
                        title="Desbloquear vendedor"
                      >
                        <IconX width={12} height={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">Nenhum vendedor bloqueado no momento.</p>
              )}
            </div>

            {/* Palavras-chave Bloqueadas */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <IconBan width={14} height={14} className="text-rose-400" />
                Palavras-chave Bloqueadas ({preferences?.blockedKeywords?.length || 0})
              </h4>

              {preferences?.blockedKeywords && preferences.blockedKeywords.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {preferences.blockedKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-200"
                    >
                      <span>{kw}</span>
                      <button
                        type="button"
                        disabled={unblocking !== null}
                        onClick={() => handleUnblock("keyword", kw)}
                        className="text-rose-400 hover:text-white transition p-0.5"
                        title="Desbloquear palavra"
                      >
                        <IconX width={12} height={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">Nenhuma palavra-chave bloqueada no momento.</p>
              )}
            </div>

            {/* Ação Perigosa: Redefinir todo o aprendizado */}
            <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <strong className="text-xs font-bold text-slate-300 block">
                  Redefinir todo o aprendizado
                </strong>
                <p className="text-[11px] text-slate-500">
                  Limpa todo o histórico de aprovações/rejeições e zera todos os bloqueios.
                </p>
              </div>

              <button
                type="button"
                disabled={resetting}
                onClick={handleResetAll}
                className="rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold px-4 py-2 transition disabled:opacity-50 shrink-0"
              >
                {resetting ? "Redefinindo…" : "Resetar Aprendizado do Zero"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
