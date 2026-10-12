"use client";

import Image from "next/image";
import { useState } from "react";
import { formatDateTime, formatPrice, largerThumbnail } from "@/lib/format";
import { LIMITS, validateAffiliateUrl } from "@/lib/offer-rules";
import { formatWhatsAppMessage } from "@/lib/whatsapp-format";
import type { Offer, OfferStatus, OfferUpdate } from "@/lib/types";
import {
  IconCheck,
  IconExternal,
  IconImage,
  IconSpinner,
  IconTruck,
} from "./icons";
import { STATUS_STYLES, StatusBadge } from "./StatusBadge";

interface OfferCardProps {
  offer: Offer;
  index: number;
  onUpdate: (id: string, update: OfferUpdate) => Promise<void>;
}

function ProductImage({ offer }: { offer: Offer }) {
  const [src, setSrc] = useState(largerThumbnail(offer.thumbnail));
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center text-slate-400">
        <IconImage width={40} height={40} />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={offer.title}
      fill
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      className="object-contain p-3 transition-transform duration-300 group-hover:scale-105"
      onError={() => {
        if (offer.thumbnail && src !== offer.thumbnail) setSrc(offer.thumbnail);
        else setFailed(true);
      }}
    />
  );
}

export function OfferCard({ offer, index, onUpdate }: OfferCardProps) {
  const [affiliateUrl, setAffiliateUrl] = useState(offer.affiliateUrl ?? "");
  const [coupon, setCoupon] = useState(offer.coupon ?? "");
  const [couponDescription, setCouponDescription] = useState(offer.couponDescription ?? "");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState<OfferStatus | "salvar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

  const styles = STATUS_STYLES[offer.status] || STATUS_STYLES.pendente;

  // Link ativo preferencial: link curto se pronto, senão affiliateUrl
  const activeLink = offer.shortUrl || affiliateUrl.trim() || offer.originalUrl;
  const hasAffiliate = Boolean(offer.shortUrl || affiliateUrl.trim());

  const linkCheck = validateAffiliateUrl(affiliateUrl, offer.originalUrl);
  const linkError = affiliateUrl.trim() && !linkCheck.ok ? linkCheck.error : null;
  const canApprove = hasAffiliate && !linkError;

  const dirty =
    affiliateUrl.trim() !== (offer.affiliateUrl ?? "") ||
    coupon.trim().toUpperCase() !== (offer.coupon ?? "") ||
    couponDescription.trim() !== (offer.couponDescription ?? "");

  async function handleCopyWhatsApp() {
    const text = formatWhatsAppMessage({
      ...offer,
      affiliateUrl: affiliateUrl.trim() || offer.affiliateUrl,
      coupon: coupon.trim() || offer.coupon,
      couponDescription: couponDescription.trim() || offer.couponDescription,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWhatsApp(true);
      setTimeout(() => setCopiedWhatsApp(false), 2500);
    } catch {
      setError("Não foi possível copiar o texto para o WhatsApp.");
    }
  }

  async function submit(kind: OfferStatus | "salvar") {
    setError(null);
    if (linkError) {
      setError(linkError);
      return;
    }
    if ((kind === "aprovado" || kind === "publicado") && !canApprove) {
      setError("Teste ou configure o link oficial antes de aprovar.");
      return;
    }

    const update: OfferUpdate = {
      affiliateUrl: affiliateUrl.trim() || null,
      coupon: coupon.trim() || null,
      couponDescription: couponDescription.trim() || null,
    };
    if (kind !== "salvar") update.status = kind;

    setBusy(kind);
    try {
      await onUpdate(offer.id, update);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(null);
    }
  }

  const fieldId = (name: string) => `${name}-${offer.externalId}`;

  return (
    <article
      id={`oferta-${offer.externalId}`}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      className={`group glass relative flex w-full animate-fade-up flex-col overflow-hidden rounded-2xl ring-1 transition-all duration-200 ${styles.ring} ${
        offer.status === "rejeitado" ? "opacity-75" : ""
      }`}
    >
      {/* Barra superior de status */}
      <div className={`h-1 w-full bg-gradient-to-r ${styles.bar}`} />

      {/* Área da Imagem Mobile-First */}
      <div className="relative h-44 sm:h-48 w-full overflow-hidden bg-white">
        <ProductImage offer={offer} />

        <div className="absolute left-2.5 top-2.5 flex flex-col gap-1">
          {offer.discountPercent && offer.discountPercent > 0 ? (
            <span className="rounded-lg bg-emerald-600 px-2 py-0.5 text-xs font-black text-white shadow-md">
              -{offer.discountPercent}%
            </span>
          ) : null}
        </div>

        <div className="absolute right-2.5 top-2.5">
          <StatusBadge status={offer.status} />
        </div>

        {offer.freeShipping && (
          <span className="absolute bottom-2 left-2.5 inline-flex items-center gap-1 rounded-full bg-ink-950/85 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
            <IconTruck width={11} height={11} /> Frete grátis
          </span>
        )}
      </div>

      {/* Conteúdo compacto */}
      <div className="flex flex-1 flex-col gap-2.5 p-3.5 sm:p-4">
        {/* Motivo de recomendação e atualização */}
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="truncate font-medium text-amber-300/90">
            {offer.opportunityReason || `Oportunidade · ${offer.searchTerm}`}
          </span>
          <span className="shrink-0 text-[10px] text-slate-500" title="Última verificação de preço">
            {formatDateTime(offer.lastSeenAt)}
          </span>
        </div>

        {/* Título */}
        <h3 className="line-clamp-2 text-sm sm:text-base font-semibold leading-snug text-slate-100">
          {offer.title}
        </h3>

        {/* Bloco de Preços */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-xl sm:text-2xl font-black text-white">
            {formatPrice(offer.price, offer.currency)}
          </span>
          {offer.originalPrice && offer.originalPrice > offer.price ? (
            <span className="text-xs text-slate-400 line-through">
              {formatPrice(offer.originalPrice, offer.currency)}
            </span>
          ) : (
            <span className="text-[11px] text-slate-500">preço anterior indisponível</span>
          )}
        </div>

        {/* Avaliação e Comissão */}
        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] py-1 border-y border-white/5 text-slate-300">
          <div>
            {typeof offer.rating === "number" && offer.rating > 0 ? (
              <span className="font-semibold text-amber-300">
                ⭐ {offer.rating.toFixed(1)}
                {offer.reviewsCount ? ` (${offer.reviewsCount})` : ""}
              </span>
            ) : (
              <span className="text-slate-500">Avaliação indisponível</span>
            )}
          </div>
          <div>
            {offer.commission ? (
              <span className="font-semibold text-emerald-300">
                Comissão: {offer.commission.percentage}% · {formatPrice(offer.commission.amount, "BRL")}
              </span>
            ) : (
              <span className="text-slate-500">Comissão: Aguardando dados da rede</span>
            )}
          </div>
        </div>

        {/* Aviso de link meli.la se em processamento ou erro */}
        {offer.shortUrlStatus === "falhou" && (
          <div className="rounded bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300 border border-rose-500/20">
            Link meli.la indisponível após 2 tentativas. Link oficial preservado.
          </div>
        )}
        {offer.shortUrlStatus === "gerando" && (
          <div className="rounded bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300 border border-sky-500/20 flex items-center gap-1.5">
            <IconSpinner width={12} height={12} /> Gerando meli.la na fila segura…
          </div>
        )}

        {/* Status de Envio Automático */}
        {offer.whatsappStatus === "falhou" && (
          <div className="rounded bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300 border border-rose-500/20">
            ⚠️ Envio falhou: {offer.whatsappError || "Erro ao despachar oferta"}
          </div>
        )}
        {offer.whatsappStatus === "enviado" && (
          <div className="rounded bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
            <IconCheck width={11} height={11} /> Enviada automaticamente
          </div>
        )}

        {/* Área "Ver detalhes" (fechada por padrão) */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition underline-offset-2"
          >
            {detailsOpen ? "▲ Ocultar detalhes" : "▼ Ver detalhes (cupom e links)"}
          </button>

          {detailsOpen && (
            <div className="mt-2 space-y-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs">
              <div>
                <label htmlFor={fieldId("afiliado")} className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Link de afiliado
                </label>
                <input
                  id={fieldId("afiliado")}
                  type="url"
                  value={affiliateUrl}
                  maxLength={LIMITS.affiliateUrl}
                  onChange={(e) => setAffiliateUrl(e.target.value)}
                  placeholder="URL oficial de afiliado"
                  className="field text-xs py-1.5"
                />
                {offer.shortUrl && (
                  <p className="mt-1 text-[10px] text-emerald-300 font-mono truncate">
                    Curto: {offer.shortUrl}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={fieldId("cupom")} className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Cupom
                  </label>
                  <input
                    id={fieldId("cupom")}
                    value={coupon}
                    maxLength={LIMITS.coupon}
                    onChange={(e) => setCoupon(e.target.value)}
                    placeholder="Ex.: PROMO10"
                    className="field font-mono uppercase text-xs py-1.5"
                  />
                </div>
                <div>
                  <label htmlFor={fieldId("regra")} className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Regra do cupom
                  </label>
                  <input
                    id={fieldId("regra")}
                    value={couponDescription}
                    maxLength={LIMITS.couponDescription}
                    onChange={(e) => setCouponDescription(e.target.value)}
                    placeholder="Ex.: acima de R$ 99"
                    className="field text-xs py-1.5"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <a
                  href={offer.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-sky-400 hover:underline inline-flex items-center gap-1"
                >
                  Link original no Mercado Livre <IconExternal width={10} height={10} />
                </a>
                {dirty && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => submit("salvar")}
                    className="rounded bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/20"
                  >
                    Salvar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300 ring-1 ring-rose-400/20">
            {error}
          </p>
        )}

        {/* AÇÕES PRINCIPAIS MOBILE-FIRST */}
        <div className="mt-auto space-y-2 pt-2">
          {/* BOTÃO DISCRETO 'TESTAR LINK' ACIMA DE 'APROVAR' */}
          <a
            href={hasAffiliate ? activeLink : undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (!hasAffiliate) {
                e.preventDefault();
                setError("Nenhum link de afiliado disponível para testar.");
              }
            }}
            className={`flex w-full items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold transition ${
              hasAffiliate
                ? "border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20"
                : "border-slate-700 bg-slate-800/40 text-slate-500 cursor-not-allowed"
            }`}
          >
            <IconExternal width={13} height={13} /> Testar link
          </a>

          {/* Linha com botões de decisão */}
          <div className="flex gap-2">
            {offer.status !== "rejeitado" && (
              <button
                type="button"
                id={fieldId("rejeitar")}
                disabled={busy !== null}
                onClick={() => submit("rejeitado")}
                className="flex-1 rounded-xl border border-rose-400/25 py-2.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
              >
                Rejeitar
              </button>
            )}

            {offer.status !== "pendente" && (
              <button
                type="button"
                id={fieldId("pendente")}
                disabled={busy !== null}
                onClick={() => submit("pendente")}
                className="flex-1 rounded-xl border border-amber-400/25 py-2.5 text-xs font-bold text-amber-300 transition hover:bg-amber-400/10 disabled:opacity-50"
              >
                Pendente
              </button>
            )}

            {offer.status !== "aprovado" && offer.status !== "publicado" && (
              <button
                type="button"
                id={fieldId("aprovar")}
                disabled={busy !== null || !canApprove}
                onClick={() => submit("aprovado")}
                className="flex-[1.5] flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-xs font-black text-white shadow-md shadow-emerald-950/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400"
              >
                {busy === "aprovado" ? <IconSpinner width={14} height={14} /> : <IconCheck width={14} height={14} />}
                Aprovar
              </button>
            )}

            {offer.status === "aprovado" && (
              <button
                type="button"
                id={fieldId("publicar")}
                disabled={busy !== null}
                onClick={() => submit("publicado")}
                className="flex-[1.5] rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 py-2.5 text-xs font-black text-white transition hover:brightness-110"
              >
                Marcar Publicado
              </button>
            )}
          </div>

          {/* Botão de Copiar para o WhatsApp (quando aprovado ou publicado) */}
          {(offer.status === "aprovado" || offer.status === "publicado") && (
            <button
              type="button"
              id={fieldId("copiar-whatsapp")}
              onClick={handleCopyWhatsApp}
              className={`flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-bold transition ${
                copiedWhatsApp
                  ? "border-emerald-500/60 bg-emerald-500/25 text-emerald-200"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
              }`}
            >
              {copiedWhatsApp ? (
                <>
                  <IconCheck width={14} height={14} /> Mensagem do WhatsApp Copiada! 🎉
                </>
              ) : (
                <>
                  Copiar Mensagem para WhatsApp
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
