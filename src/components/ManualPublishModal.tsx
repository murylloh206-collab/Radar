"use client";

import { useMemo, useState } from "react";
import type { Offer } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { IconAlert, IconCheck, IconSpinner, IconX } from "./icons";
import type { PublishNowItemResult } from "@/app/api/offers/publish-now/route";

interface ManualPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOffers: Offer[];
  channelDestination: string;
  minScore: number;
  onConfirm: (offerIds: string[]) => Promise<{
    results: PublishNowItemResult[];
    totalSuccess: number;
    totalFailed: number;
    totalAlreadySent: number;
  }>;
  isPublishing: boolean;
}

export function ManualPublishModal({
  isOpen,
  onClose,
  selectedOffers,
  channelDestination,
  minScore,
  onConfirm,
  isPublishing,
}: ManualPublishModalProps) {
  const [resultsReport, setResultsReport] = useState<PublishNowItemResult[] | null>(null);

  const lowScoreOffers = useMemo(() => {
    return selectedOffers.filter((o) => (o.opportunityScore ?? 0) < minScore);
  }, [selectedOffers, minScore]);

  const hasLowScore = lowScoreOffers.length > 0;

  if (!isOpen) return null;

  async function handleExecute() {
    try {
      const ids = selectedOffers.map((o) => o.id);
      const res = await onConfirm(ids);
      setResultsReport(res.results);
    } catch {
      // tratado no componente pai
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-manual-publish-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
    >
      <div className="glass relative flex flex-col w-full max-w-xl max-h-[90vh] overflow-hidden rounded-3xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/80">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
          <div>
            <h2 id="modal-manual-publish-title" className="text-base font-bold text-white sm:text-lg">
              {resultsReport ? "Relatório de Envio Imediato" : "Confirmar Publicação Manual"}
            </h2>
            <p className="text-[11px] text-slate-400">
              Canal de destino: <strong className="text-sky-300">{channelDestination}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            aria-label="Fechar modal"
            className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition disabled:opacity-40"
          >
            <IconX width={18} height={18} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 space-y-4">
          {resultsReport ? (
            // Relatório pós-envio
            <div className="space-y-3">
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 space-y-2">
                <span className="block text-xs font-bold text-slate-200">Resultado do Processamento:</span>
                <div className="divide-y divide-white/5">
                  {resultsReport.map((res) => (
                    <div key={res.id} className="py-2 flex items-start justify-between gap-2 text-xs">
                      <div className="flex-1">
                        <p className="font-semibold text-white line-clamp-1">{res.title}</p>
                        {res.error ? (
                          <p className="text-[11px] text-rose-300 mt-0.5">{res.error}</p>
                        ) : res.alreadySent ? (
                          <p className="text-[11px] text-amber-300 mt-0.5">Já enviado previamente (idempotência preservada)</p>
                        ) : (
                          <p className="text-[11px] text-emerald-300 mt-0.5">Publicado no canal com sucesso!</p>
                        )}
                      </div>
                      <span className="shrink-0 mt-0.5">
                        {res.success && !res.alreadySent ? (
                          <span className="rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold">
                            Sucesso
                          </span>
                        ) : res.alreadySent ? (
                          <span className="rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold">
                            Já Enviado
                          </span>
                        ) : (
                          <span className="rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold">
                            Falhou
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // Confirmação pré-envio
            <>
              <div className="rounded-2xl bg-sky-500/10 border border-sky-500/20 p-3.5 text-xs text-sky-200">
                Você selecionou <strong>{selectedOffers.length} oferta(s)</strong> para publicação imediata no WhatsApp. As ofertas serão revalidadas no Mercado Livre e enviadas sequencialmente.
              </div>

              {/* Alerta estrito de bloqueio de score baixo (sem bypass) */}
              {hasLowScore && (
                <div className="rounded-2xl bg-rose-500/15 border border-rose-500/30 p-3.5 space-y-1.5">
                  <div className="flex items-start gap-2 text-rose-300">
                    <IconAlert width={18} height={18} className="shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <strong className="block font-bold">Publicação Bloqueada por Qualidade</strong>
                      <p className="mt-0.5 text-[11px] text-rose-200">
                        {lowScoreOffers.length} produto(s) selecionado(s) possuem pontuação abaixo do mínimo permitido ({minScore}/100).
                        Publicações com score baixo são bloqueadas por padrão sem exceção para garantir a integridade do grupo.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Lista dos produtos selecionados */}
              <div className="space-y-2">
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Produtos Selecionados ({selectedOffers.length}):
                </span>
                <div className="divide-y divide-white/5 max-h-56 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-2.5">
                  {selectedOffers.map((offer) => (
                    <div key={offer.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white p-0.5">
                          {offer.thumbnail ? (
                            <img
                              src={offer.thumbnail}
                              alt={offer.title}
                              className="h-full w-full object-contain"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate text-xs">{offer.title}</p>
                          <p className="text-[11px] text-slate-400">
                            {formatPrice(offer.price, offer.currency)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-black border ${
                          (offer.opportunityScore ?? 0) >= minScore
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                        }`}
                      >
                        Score {offer.opportunityScore ?? 0}/100
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3.5 sm:px-6 bg-slate-950/60">
          {resultsReport ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-400 transition"
            >
              Fechar Relatório
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isPublishing}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 transition disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecute}
                disabled={isPublishing || hasLowScore}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-sky-950/50 hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPublishing ? (
                  <>
                    <IconSpinner width={14} height={14} /> Enviando para WhatsApp…
                  </>
                ) : (
                  <>
                    <IconCheck width={14} height={14} /> Enviar Agora ({selectedOffers.length})
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
