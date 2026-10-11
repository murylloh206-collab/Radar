"use client";

import Image from "next/image";
import { useState } from "react";
import { formatDateTime, formatPrice, largerThumbnail } from "@/lib/format";
import { LIMITS, validateAffiliateUrl } from "@/lib/offer-rules";
import type { Offer, OfferStatus, OfferUpdate } from "@/lib/types";
import {
  IconCheck,
  IconExternal,
  IconImage,
  IconLink,
  IconSpinner,
  IconTicket,
  IconTruck,
  IconUndo,
  IconX,
} from "./icons";
import { STATUS_STYLES, StatusBadge } from "./StatusBadge";

interface OfferCardProps {
  offer: Offer;
  index: number;
  onUpdate: (id: string, update: OfferUpdate) => Promise<void>;
}

/** Imagem do produto com plano B se a versão grande não existir. */
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
      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
      className="object-contain p-4 transition-transform duration-500 group-hover:scale-105"
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
  const [couponOpen, setCouponOpen] = useState(Boolean(offer.coupon || offer.couponDescription));
  const [busy, setBusy] = useState<OfferStatus | "salvar" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const styles = STATUS_STYLES[offer.status];
  const dirty =
    affiliateUrl.trim() !== (offer.affiliateUrl ?? "") ||
    coupon.trim().toUpperCase() !== (offer.coupon ?? "") ||
    couponDescription.trim() !== (offer.couponDescription ?? "");

  const linkCheck = validateAffiliateUrl(affiliateUrl, offer.originalUrl);
  const linkError = affiliateUrl.trim() && !linkCheck.ok ? linkCheck.error : null;
  const hasValidLink = linkCheck.ok && linkCheck.value !== null;

  async function submit(kind: OfferStatus | "salvar") {
    setError(null);
    if (linkError) {
      setError(linkError);
      return;
    }
    if (kind === "aprovado" && !hasValidLink) {
      setError("Cole seu link oficial de afiliado antes de aprovar.");
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
      setBusy(null);
    }
  }

  const fieldId = (name: string) => `${name}-${offer.externalId}`;

  return (
    <article
      id={`oferta-${offer.externalId}`}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
      className={`group glass relative flex animate-fade-up flex-col overflow-hidden rounded-2xl ring-1 ring-transparent transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-black/40 ${styles.ring} ${
        offer.status === "rejeitado" ? "opacity-75 hover:opacity-100" : ""
      }`}
    >
      {/* Faixa colorida do status */}
      <div className={`h-1 w-full bg-gradient-to-r ${styles.bar}`} />

      {/* Imagem */}
      <div className="relative h-48 overflow-hidden bg-white">
        <ProductImage offer={offer} />
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {offer.discountPercent ? (
            <span className="rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 px-2 py-1 text-sm font-extrabold text-white shadow-lg shadow-emerald-900/30">
              -{offer.discountPercent}%
            </span>
          ) : null}
        </div>
        <div className="absolute right-3 top-3">
          <StatusBadge status={offer.status} />
        </div>
        {offer.freeShipping && (
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-ink-900/85 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
            <IconTruck width={12} height={12} /> Frete grátis
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Título e preço */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            <span className="rounded-md bg-white/5 px-1.5 py-0.5">{offer.searchTerm}</span>
            <span title="Última atualização de preço">• {formatDateTime(offer.lastSeenAt)}</span>
          </div>
          <h3 className="line-clamp-2 min-h-[2.75rem] text-[15px] font-semibold leading-snug text-slate-100">
            {offer.title}
          </h3>
          <div className="flex flex-wrap items-end gap-x-2 gap-y-0.5">
            <span className="text-2xl font-extrabold tracking-tight text-white">
              {formatPrice(offer.price, offer.currency)}
            </span>
            {offer.originalPrice && offer.originalPrice > offer.price ? (
              <span className="pb-1 text-sm text-slate-400 line-through">
                {formatPrice(offer.originalPrice, offer.currency)}
              </span>
            ) : (
              <span className="pb-1 text-xs text-slate-500">sem preço anterior</span>
            )}
          </div>
          <a
            href={offer.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:text-sky-200 hover:underline"
          >
            Ver link original no Mercado Livre <IconExternal width={12} height={12} />
          </a>
        </div>

        {/* Formulário */}
        <div className="mt-auto space-y-3">
          <div>
            <label
              htmlFor={fieldId("afiliado")}
              className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-300"
            >
              <IconLink width={14} height={14} /> Link oficial de afiliado
            </label>
            <input
              id={fieldId("afiliado")}
              type="url"
              inputMode="url"
              placeholder="Cole aqui o link gerado na sua conta de afiliado"
              value={affiliateUrl}
              maxLength={LIMITS.affiliateUrl}
              onChange={(e) => setAffiliateUrl(e.target.value)}
              aria-invalid={Boolean(linkError)}
              className={`field ${linkError ? "border-rose-400/60!" : ""}`}
            />
            {linkError ? (
              <p className="mt-1 text-xs text-rose-300">{linkError}</p>
            ) : !hasValidLink && offer.status === "pendente" ? (
              <p className="mt-1 text-xs text-slate-500">Necessário para aprovar. Nunca é gerado automaticamente.</p>
            ) : null}
          </div>

          {couponOpen ? (
            <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <label
                htmlFor={fieldId("cupom")}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-300"
              >
                <IconTicket width={14} height={14} /> Cupom (opcional)
              </label>
              <input
                id={fieldId("cupom")}
                placeholder="Ex.: PROMO10"
                value={coupon}
                maxLength={LIMITS.coupon}
                onChange={(e) => setCoupon(e.target.value)}
                className="field font-mono uppercase"
              />
              <label htmlFor={fieldId("regra")} className="sr-only">
                Descrição ou regra do cupom
              </label>
              <textarea
                id={fieldId("regra")}
                rows={2}
                placeholder="Regra do cupom (ex.: válido acima de R$ 200, até domingo)"
                value={couponDescription}
                maxLength={LIMITS.couponDescription}
                onChange={(e) => setCouponDescription(e.target.value)}
                className="field resize-none"
              />
            </div>
          ) : (
            <button
              type="button"
              id={fieldId("abrir-cupom")}
              onClick={() => setCouponOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-amber-300"
            >
              <IconTicket width={14} height={14} /> Adicionar cupom
            </button>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200 ring-1 ring-rose-400/20">
              {error}
            </p>
          )}

          {/* Ações */}
          <div className="flex flex-wrap gap-2 pt-1">
            {offer.status !== "rejeitado" && (
              <button
                type="button"
                id={fieldId("rejeitar")}
                disabled={busy !== null}
                onClick={() => submit("rejeitado")}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-400/25 px-3 py-2.5 text-sm font-semibold text-rose-300/90 transition hover:bg-rose-500/10 disabled:opacity-50"
              >
                {busy === "rejeitado" ? <IconSpinner width={16} height={16} /> : <IconX width={16} height={16} />}
                Rejeitar
              </button>
            )}

            {offer.status !== "pendente" && (
              <button
                type="button"
                id={fieldId("pendente")}
                disabled={busy !== null}
                onClick={() => submit("pendente")}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-400/25 px-3 py-2.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/10 disabled:opacity-50"
              >
                {busy === "pendente" ? <IconSpinner width={16} height={16} /> : <IconUndo width={16} height={16} />}
                {offer.status === "rejeitado" ? "Reconsiderar" : "Voltar a pendente"}
              </button>
            )}

            {offer.status !== "aprovado" ? (
              <button
                type="button"
                id={fieldId("aprovar")}
                disabled={busy !== null || !hasValidLink}
                title={hasValidLink ? "Aprovar oferta" : "Cole o link de afiliado para aprovar"}
                onClick={() => submit("aprovado")}
                className="inline-flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400 disabled:shadow-none"
              >
                {busy === "aprovado" ? <IconSpinner width={16} height={16} /> : <IconCheck width={16} height={16} />}
                Aprovar
              </button>
            ) : (
              dirty && (
                <button
                  type="button"
                  id={fieldId("salvar")}
                  disabled={busy !== null || !hasValidLink}
                  onClick={() => submit("salvar")}
                  className="inline-flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  {busy === "salvar" ? <IconSpinner width={16} height={16} /> : <IconCheck width={16} height={16} />}
                  Salvar alterações
                </button>
              )
            )}
          </div>

          {offer.status !== "aprovado" && dirty && (
            <button
              type="button"
              id={fieldId("rascunho")}
              disabled={busy !== null}
              onClick={() => submit("salvar")}
              className="w-full text-center text-xs font-medium text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline disabled:opacity-50"
            >
              {busy === "salvar" ? "Salvando…" : "Salvar link/cupom sem mudar o status"}
            </button>
          )}

          {offer.status === "aprovado" && !dirty && (
            <p className={`flex items-center gap-1.5 text-xs font-medium ${styles.text}`}>
              <IconCheck width={14} height={14} /> Aprovada — pronta para publicação manual futura.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
