"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { formatDateTime, formatPrice, largerThumbnail } from "@/lib/format";
import { LIMITS, validateAffiliateUrl } from "@/lib/offer-rules";
import { formatWhatsAppMessage } from "@/lib/whatsapp-format";
import {
  REJECTION_REASONS,
  type Offer,
  type OfferStatus,
  type OfferUpdate,
  type RejectionReason,
} from "@/lib/types";
import {
  IconAlert,
  IconBan,
  IconBolt,
  IconBrain,
  IconCheck,
  IconExternal,
  IconImage,
  IconLink,
  IconSpinner,
  IconThumbDown,
  IconThumbUp,
  IconTruck,
  IconX,
} from "./icons";
import { STATUS_STYLES, StatusBadge } from "./StatusBadge";

interface OfferCardProps {
  offer: Offer;
  index: number;
  onUpdate: (id: string, update: OfferUpdate) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

function ProductImage({ offer }: { offer: Offer }) {
  const [src, setSrc] = useState(largerThumbnail(offer.thumbnail));
  const [useNativeImg, setUseNativeImg] = useState(false);

  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center text-slate-400">
        <IconImage width={40} height={40} />
      </div>
    );
  }

  if (useNativeImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={offer.title}
        loading="lazy"
        className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-105"
        onError={() => {
          if (offer.thumbnail && src !== offer.thumbnail) {
            setSrc(offer.thumbnail);
          }
        }}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={offer.title}
      fill
      unoptimized={
        offer.source === "shopee" ||
        offer.source === "netshoes" ||
        src.includes("shopee") ||
        src.includes("netshoes") ||
        src.includes("susercontent")
      }
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      className="object-contain p-3 transition-transform duration-300 group-hover:scale-105"
      onError={() => {
        setUseNativeImg(true);
      }}
    />
  );
}

export function OfferCard({
  offer,
  index,
  onUpdate,
  onDelete,
  isSelected = false,
  onToggleSelect,
}: OfferCardProps) {
  const [affiliateUrl, setAffiliateUrl] = useState(offer.shortUrl || offer.affiliateUrl || "");
  const [coupon, setCoupon] = useState(offer.coupon ?? "");
  const [couponDescription, setCouponDescription] = useState(offer.couponDescription ?? "");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState<OfferStatus | "salvar" | "excluir" | "feedback" | null>(null);
  const [shortening, setShortening] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

  // Sincroniza estados caso a prop offer seja atualizada pelo pai ou ciclo de coleta
  useEffect(() => {
    setAffiliateUrl(offer.shortUrl || offer.affiliateUrl || "");
    setCoupon(offer.coupon ?? "");
    setCouponDescription(offer.couponDescription ?? "");
  }, [offer.shortUrl, offer.affiliateUrl, offer.coupon, offer.couponDescription]);

  // Estados do Modal de Rejeição e Bloqueios
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<RejectionReason | "">("");
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);

  const styles = STATUS_STYLES[offer.status] || STATUS_STYLES.pendente;

  // Marca e Vendedor da oferta
  const brandDisplay = offer.brand || "Marca";
  const sellerDisplay = offer.sellerName || "Mercado Livre";

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

  async function handleCopyShortLink() {
    const linkToCopy = offer.shortUrl || (affiliateUrl.trim().startsWith("https://meli.la/") ? affiliateUrl.trim() : null) || activeLink;
    try {
      await navigator.clipboard.writeText(linkToCopy);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      setError("Não foi possível copiar o link.");
    }
  }

  async function handleGenerateShortLink() {
    setShortening(true);
    setError(null);
    try {
      const res = await fetch(`/api/offers/${encodeURIComponent(offer.id)}/shorten`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.shortUrl) {
        throw new Error(data.error || (offer.source === "shopee" ? "Não foi possível gerar link da Shopee" : "Não foi possível gerar link meli.la"));
      }
      setAffiliateUrl(data.shortUrl);
      await onUpdate(offer.id, {
        shortUrl: data.shortUrl,
        affiliateUrl: data.shortUrl,
        shortUrlStatus: "pronto",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : (offer.source === "shopee" ? "Erro ao gerar link Shopee." : "Erro ao gerar link meli.la."));
    } finally {
      setShortening(false);
    }
  }

  async function handleCopyWhatsApp() {
    const activeShort =
      offer.shortUrl ||
      (affiliateUrl.trim().startsWith("https://meli.la/") || affiliateUrl.trim().includes("shopee.com") ? affiliateUrl.trim() : undefined);
    const text = formatWhatsAppMessage({
      ...offer,
      shortUrl: activeShort || offer.shortUrl,
      affiliateUrl: activeShort || affiliateUrl.trim() || offer.affiliateUrl,
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

    const effectiveShortUrl =
      offer.shortUrl ||
      (affiliateUrl.trim().startsWith("https://meli.la/") || affiliateUrl.trim().includes("shopee.com") ? affiliateUrl.trim() : null);

    const update: OfferUpdate = {
      affiliateUrl: affiliateUrl.trim() || null,
      shortUrl: effectiveShortUrl,
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

  /**
   * Registra a aprovação com feedback positivo para o aprendizado de preferências
   */
  async function handleApprove() {
    setError(null);
    setBusy("aprovado");

    try {
      // 1. Envia feedback positivo para o motor de aprendizado
      await fetch("/api/offers/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: offer.id,
          externalId: offer.externalId,
          action: "aprovar",
          customBrand: offer.brand,
          customSeller: offer.sellerName,
          offerData: offer,
        }),
      }).catch((fbErr) => {
        console.warn("[OfferCard] Feedback offline ou transitório:", fbErr);
      });

      // 2. Atualiza o status da oferta no painel
      await submit("aprovado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aprovar oferta.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Abre o modal de motivo obrigatório para rejeição
   */
  function handleOpenRejectModal() {
    setSelectedReason("");
    setRejectModalOpen(true);
  }

  /**
   * Confirma a rejeição com o motivo obrigatório selecionado
   */
  async function handleConfirmRejection() {
    if (!selectedReason) {
      setError("Por favor, selecione um dos motivos para rejeitar.");
      return;
    }

    setBusy("rejeitado");
    setRejectModalOpen(false);

    try {
      // 1. Envia feedback de rejeição com motivo para o motor de aprendizado
      await fetch("/api/offers/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: offer.id,
          externalId: offer.externalId,
          action: "rejeitar",
          reason: selectedReason,
          customBrand: offer.brand,
          customSeller: offer.sellerName,
          offerData: offer,
        }),
      }).catch((fbErr) => {
        console.warn("[OfferCard] Feedback offline ou transitório:", fbErr);
      });

      // 2. Atualiza status no painel
      await submit("rejeitado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao rejeitar oferta.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Bloqueia permanentemente a marca da oferta
   */
  async function handleBlockBrand() {
    const brand = brandDisplay;
    if (!brand || brand === "Genérica") {
      alert("Esta oferta não possui uma marca identificada específica para bloqueio.");
      return;
    }

    const confirmed = window.confirm(
      `Bloquear a marca "${brand}" permanentemente?\n\nO Radar nunca mais exibirá anúncios desta marca.`
    );
    if (!confirmed) return;

    setBusy("rejeitado");
    setBlockMenuOpen(false);

    try {
      await fetch("/api/offers/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: offer.id,
          externalId: offer.externalId,
          action: "bloquear_marca",
          reason: "marca_indesejada",
          customBrand: brand,
          offerData: offer,
        }),
      });

      await submit("rejeitado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao bloquear marca.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Bloqueia permanentemente o vendedor da oferta
   */
  async function handleBlockSeller() {
    const seller = sellerDisplay;
    const confirmed = window.confirm(
      `Bloquear o vendedor "${seller}" permanentemente?\n\nO Radar nunca mais exibirá anúncios deste vendedor.`
    );
    if (!confirmed) return;

    setBusy("rejeitado");
    setBlockMenuOpen(false);

    try {
      await fetch("/api/offers/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: offer.id,
          externalId: offer.externalId,
          action: "bloquear_vendedor",
          customSeller: seller,
          offerData: offer,
        }),
      });

      await submit("rejeitado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao bloquear vendedor.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeletePermanently() {
    if (!onDelete) return;
    const confirmed = window.confirm(
      `Excluir definitivamente a oferta "${offer.title}"?\n\nEla não voltará a aparecer em futuras atualizações do Radar.`
    );
    if (!confirmed) return;

    setBusy("excluir");
    try {
      await onDelete(offer.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir oferta.");
      setBusy(null);
    }
  }

  const fieldId = (name: string) => `${name}-${offer.externalId}`;

  // Afinidade / Score de preferência
  const prefScorePercent =
    typeof offer.preferenceScore === "number" ? Math.round(offer.preferenceScore * 100) : null;

  return (
    <article
      id={`oferta-${offer.externalId}`}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      className={`group glass relative flex w-full animate-fade-up flex-col overflow-hidden rounded-2xl ring-1 transition-all duration-200 ${styles.ring} ${
        offer.status === "rejeitado" ? "opacity-90" : ""
      } ${isSelected ? "ring-2 ring-emerald-400" : ""}`}
    >
      {/* Barra superior de status */}
      <div className={`h-1 w-full bg-gradient-to-r ${styles.bar}`} />

      {/* Área da Imagem Mobile-First */}
      <div className="relative h-44 sm:h-48 w-full overflow-hidden bg-white">
        <ProductImage offer={offer} />

        {/* Checkbox de seleção em Aprovados ou Rejeitados */}
        {(offer.status === "rejeitado" || offer.status === "aprovado") && onToggleSelect && (
          <div className="absolute left-2.5 top-2.5 z-10">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(offer.id)}
              aria-label={`Selecionar oferta ${offer.title}`}
              className="h-5 w-5 rounded border-slate-700 bg-black/80 text-emerald-500 focus:ring-emerald-400 cursor-pointer"
            />
          </div>
        )}

        {/* Badges de Desconto e Identificação */}
        <div
          className={`absolute ${
            (offer.status === "rejeitado" || offer.status === "aprovado") && onToggleSelect
              ? "left-10"
              : "left-2.5"
          } top-2.5 flex flex-col gap-1 z-10`}
        >
          {offer.discountPercent && offer.discountPercent > 0 ? (
            <span className="rounded-lg bg-emerald-600 px-2.5 py-0.5 text-xs font-black text-white shadow-md">
              -{offer.discountPercent}%
            </span>
          ) : (
            <span className="rounded-lg bg-teal-600/95 border border-teal-400/30 px-2 py-0.5 text-[11px] font-bold text-white shadow-md">
              Oferta encontrada agora
            </span>
          )}

          {/* Badge de Recomendação Inteligente */}
          {offer.isExploration || offer.recommendationReason === "Novo teste de categoria" ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-purple-700/95 border border-purple-400/40 px-2 py-0.5 text-[10px] font-bold text-purple-100 shadow-md">
              ✨ Novo teste de categoria
            </span>
          ) : offer.recommendationReason === "Parecido com ofertas que você aprovou" ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-teal-800/95 border border-teal-400/40 px-2 py-0.5 text-[10px] font-bold text-teal-100 shadow-md">
              <IconBrain width={11} height={11} /> Parecido com o que você aprovou
            </span>
          ) : null}
        </div>

        <div className="absolute right-2.5 top-2.5 z-10">
          <StatusBadge status={offer.status} />
        </div>

        {offer.freeShipping && (
          <span className="absolute bottom-2 left-2.5 inline-flex items-center gap-1 rounded-full bg-ink-950/85 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 z-10">
            <IconTruck width={11} height={11} /> Frete grátis
          </span>
        )}

        {prefScorePercent !== null && prefScorePercent >= 70 && (
          <span className="absolute bottom-2 right-2.5 inline-flex items-center gap-1 rounded-full bg-ink-950/85 border border-teal-500/30 px-2 py-0.5 text-[10px] font-semibold text-teal-300 z-10">
            {prefScorePercent}% afinidade
          </span>
        )}
      </div>

      {/* Conteúdo do Card */}
      <div className="flex flex-1 flex-col gap-2.5 p-3.5 sm:p-4">
        {/* Marca, Categoria e Verificação */}
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <div className="truncate flex items-center gap-1.5 font-medium">
            {offer.source === "shopee" ? (
              <span className="rounded bg-orange-500/20 text-orange-300 border border-orange-500/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                Shopee
              </span>
            ) : offer.source === "netshoes" ? (
              <span className="rounded bg-purple-600/25 text-purple-200 border border-purple-500/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                Netshoes
              </span>
            ) : (
              <span className="rounded bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                Mercado Livre
              </span>
            )}
            <span className="font-bold text-teal-300">
              {brandDisplay !== "Genérica" ? brandDisplay : offer.searchTerm || "Geral"}
            </span>
            {brandDisplay !== "Genérica" && offer.searchTerm && (
              <span className="text-slate-500">• {offer.searchTerm}</span>
            )}
          </div>
          <span className="shrink-0 text-[10px] text-slate-500" title="Última verificação de preço">
            {formatDateTime(offer.lastSeenAt)}
          </span>
        </div>

        {/* Motivo de rejeição explícito */}
        {offer.status === "rejeitado" && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/25 p-2 text-xs text-rose-300">
            <strong className="block font-semibold">Motivo da Rejeição:</strong>
            <p className="mt-0.5 text-[11px] text-rose-200">
              {offer.rejectionDetail?.reason ||
                offer.opportunityReason ||
                "Rejeitado pelo usuário ou critérios mínimos não atendidos."}
            </p>
          </div>
        )}

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
          ) : null}
        </div>

        {/* Avaliação e Vendedor */}
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
          <div className="truncate max-w-[170px] text-right">
            <span className="text-slate-400">Vendedor: </span>
            <span className="font-semibold text-slate-300" title={sellerDisplay}>
              {sellerDisplay}
            </span>
          </div>
        </div>

        {/* Bloco de Link Curto meli.la / shopee com Destaque e Cópia Imediata */}
        <div className="rounded-xl border border-white/10 bg-slate-900/80 p-2.5 text-xs shadow-inner">
          {offer.shortUrl ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 truncate">
                {offer.source === "shopee" || offer.shortUrl?.includes("shopee") ? (
                  <span className="inline-flex items-center gap-1 rounded bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold text-orange-300 border border-orange-500/40">
                    <IconLink width={11} height={11} /> shopee
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/40">
                    <IconLink width={11} height={11} /> meli.la
                  </span>
                )}
                <span className="font-mono text-xs text-slate-100 font-semibold truncate select-all">
                  {offer.shortUrl}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyShortLink}
                className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition shadow-sm ${
                  copiedLink
                    ? "bg-emerald-500/30 text-emerald-200 border border-emerald-400"
                    : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30"
                }`}
                title={offer.source === "shopee" ? "Copiar link de afiliado Shopee" : "Copiar link meli.la"}
              >
                {copiedLink ? (
                  <>
                    <IconCheck width={12} height={12} /> Copiado!
                  </>
                ) : (
                  <>Copiar link</>
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-slate-300 truncate">
                {shortening ? (
                  <span className="inline-flex items-center gap-1 text-sky-300 font-medium">
                    <IconSpinner width={12} height={12} /> Gerando meli.la oficial…
                  </span>
                ) : offer.shortUrlStatus === "gerando" ? (
                  <span className="inline-flex items-center gap-1 text-sky-300 font-medium">
                    <IconSpinner width={12} height={12} /> Gerando na fila segura…
                  </span>
                ) : offer.shortUrlStatus === "falhou" ? (
                  <span className="text-amber-300 text-[11px]">Link meli.la não gerado (usando padrão)</span>
                ) : (
                  <span className="text-slate-400">Link encurtado pendente</span>
                )}
              </div>
              <button
                type="button"
                disabled={shortening || busy !== null}
                onClick={handleGenerateShortLink}
                className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 px-2 py-1 text-[11px] font-bold text-teal-200 transition disabled:opacity-50"
              >
                {shortening ? <IconSpinner width={11} height={11} /> : <IconBolt width={11} height={11} />}
                Gerar meli.la
              </button>
            </div>
          )}
        </div>

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
            {detailsOpen ? "▲ Ocultar auditoria e links" : "▼ Ver auditoria, cupom e links"}
          </button>

          {detailsOpen && (
            <div className="mt-2 space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs">
              {/* Detalhamento Auditável do Score */}
              {offer.scoreAudit && (
                <div className="space-y-1.5 border-b border-white/5 pb-2.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-200">
                    <span>Componentes do Score ({offer.scoreAudit.totalScore}/100):</span>
                    <span className="text-[10px] text-slate-400">v{offer.scoreAudit.version}</span>
                  </div>
                  <div className="space-y-1 text-[10px]">
                    {offer.scoreAudit.components.map((comp) => (
                      <div
                        key={comp.name}
                        className="flex items-center justify-between py-0.5 border-b border-white/[0.03]"
                      >
                        <span className="text-slate-300">{comp.name}:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">{comp.detail}</span>
                          <span className="font-mono font-semibold text-amber-300">
                            {comp.points}/{comp.maxPoints} pts
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {offer.scoreAudit.failedFilters.length > 0 && (
                    <div className="mt-1 text-[10px] text-rose-300 bg-rose-500/10 p-1.5 rounded">
                      <strong>Filtros que reprovaram:</strong> {offer.scoreAudit.failedFilters.join("; ")}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label
                  htmlFor={fieldId("afiliado")}
                  className="block text-[11px] font-semibold text-slate-300 mb-1"
                >
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
                  {offer.source === "shopee" ? "Link original na Shopee" : "Link original no Mercado Livre"}{" "}
                  <IconExternal width={10} height={10} />
                </a>
                {dirty && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => submit("salvar")}
                    className="rounded bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/20"
                  >
                    Salvar alterações
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300 ring-1 ring-rose-400/20"
          >
            {error}
          </p>
        )}

        {/* AÇÕES PRINCIPAIS */}
        <div className="mt-auto space-y-2 pt-2">
          {/* BOTÃO 'ABRIR OFERTA' */}
          <a
            href={activeLink || offer.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-xs font-bold text-emerald-200 transition hover:bg-emerald-500/20"
          >
            <IconExternal width={13} height={13} /> {offer.source === "shopee" ? "Abrir oferta na Shopee" : "Abrir oferta no Mercado Livre"}
          </a>

          {/* LINHA PRINCIPAL: GOSTEI / APROVAR | REJEITAR */}
          <div className="flex items-center gap-2">
            {/* BOTÃO REJEITAR (OBRIGA MOTIVO) */}
            {offer.status !== "rejeitado" && (
              <button
                type="button"
                id={fieldId("rejeitar")}
                disabled={busy !== null}
                onClick={handleOpenRejectModal}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/35 bg-rose-500/10 py-2.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
              >
                <IconThumbDown width={14} height={14} /> Rejeitar
              </button>
            )}

            {/* BOTÃO EXCLUIR DEFINITIVO (SE JÁ REJEITADO) */}
            {offer.status === "rejeitado" && onDelete && (
              <button
                type="button"
                id={fieldId("excluir-definitivo")}
                disabled={busy !== null}
                onClick={handleDeletePermanently}
                className="flex-1 rounded-xl border border-rose-500/50 bg-rose-500/15 py-2.5 text-xs font-bold text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-50"
              >
                {busy === "excluir" ? "Excluindo…" : "Excluir Definitivo"}
              </button>
            )}

            {/* BOTÃO 'GOSTEI / APROVAR' (COM APRENDIZADO DE PREFERÊNCIAS) */}
            {offer.status !== "aprovado" && offer.status !== "publicado" && (
              <button
                type="button"
                id={fieldId("gostei-aprovar")}
                disabled={busy !== null || !canApprove}
                onClick={handleApprove}
                className="flex-[1.5] flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-xs font-black text-white shadow-md shadow-emerald-950/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400"
              >
                {busy === "aprovado" ? (
                  <IconSpinner width={14} height={14} />
                ) : (
                  <IconThumbUp width={14} height={14} />
                )}
                Gostei / Aprovar
              </button>
            )}

            {/* BOTÃO MARCAR PUBLICADO */}
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

          {/* BOTÕES DE BLOQUEIO DIRETO: MARCA & VENDEDOR */}
          <div className="relative pt-0.5">
            <button
              type="button"
              onClick={() => setBlockMenuOpen(!blockMenuOpen)}
              className="text-[11px] text-slate-400 hover:text-rose-300 transition flex items-center gap-1"
            >
              <IconBan width={12} height={12} /> Bloquear marca ou vendedor…
            </button>

            {blockMenuOpen && (
              <div className="mt-1.5 rounded-xl border border-rose-500/30 bg-ink-950/95 backdrop-blur-md p-2 space-y-1.5 text-xs shadow-xl animate-fade-in z-20">
                <button
                  type="button"
                  onClick={handleBlockBrand}
                  className="w-full text-left rounded-lg px-2.5 py-1.5 text-rose-300 hover:bg-rose-500/20 font-medium transition flex items-center justify-between"
                >
                  <span>🚫 Nunca mostrar esta marca ({brandDisplay})</span>
                </button>
                <button
                  type="button"
                  onClick={handleBlockSeller}
                  className="w-full text-left rounded-lg px-2.5 py-1.5 text-rose-300 hover:bg-rose-500/20 font-medium transition flex items-center justify-between border-t border-white/5 pt-1.5"
                >
                  <span>🚫 Nunca mostrar este vendedor ({sellerDisplay})</span>
                </button>
              </div>
            )}
          </div>

          {/* BOTÃO DE COPIAR PARA O WHATSAPP (QUANDO APROVADO OU PUBLICADO) */}
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
                <>Copiar Mensagem para WhatsApp</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* MODAL OBRIGATÓRIO DE MOTIVO DA REJEIÇÃO */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="glass ring-1 ring-white/10 max-w-md w-full rounded-2xl p-5 shadow-2xl bg-ink-950 text-slate-100 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <IconThumbDown width={18} height={18} className="text-rose-400" />
                  Por que você está rejeitando?
                </h4>
                <p className="mt-1 text-xs text-slate-400">
                  Obrigatório: sua resposta ensina o algoritmo a calibrar as próximas ofertas para o seu gosto.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Fechar"
              >
                <IconX width={18} height={18} />
              </button>
            </div>

            {/* SELEÇÃO DOS 7 MOTIVOS OBRIGATÓRIOS */}
            <div className="space-y-1.5 py-1">
              {REJECTION_REASONS.map((reason) => {
                const isSelectedReason = selectedReason === reason.id;
                return (
                  <button
                    key={reason.id}
                    type="button"
                    onClick={() => setSelectedReason(reason.id)}
                    className={`w-full text-left rounded-xl px-3.5 py-2.5 text-xs font-semibold transition border flex items-center justify-between ${
                      isSelectedReason
                        ? "border-rose-500 bg-rose-500/20 text-rose-200 shadow-md ring-1 ring-rose-400"
                        : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]"
                    }`}
                  >
                    <span>{reason.label}</span>
                    {isSelectedReason && <IconCheck width={14} height={14} className="text-rose-400" />}
                  </button>
                );
              })}
            </div>

            {/* BOTÕES DE CONFIRMAR OU CANCELAR */}
            <div className="flex gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="flex-1 rounded-xl border border-white/10 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!selectedReason || busy !== null}
                onClick={handleConfirmRejection}
                className="flex-1 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 py-2 text-xs font-bold text-white shadow-md hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {busy === "rejeitado" ? "Rejeitando…" : "Confirmar Rejeição"}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
