'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Download,
  Copy,
  Check,
  Send,
  Flame,
  ShoppingBag,
  ExternalLink,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { InstagramIcon } from './SocialIcons';
import { CopiedOfferHistoryItem } from '@/app/api/copier/history/route';
import { MetaIntegrationData } from '@/lib/server/meta-graph-service';

interface StoryPublisherModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: CopiedOfferHistoryItem | null;
  onStoryPublished?: (offerId: string) => void;
}

export default function StoryPublisherModal({
  isOpen,
  onClose,
  offer,
  onStoryPublished,
}: StoryPublisherModalProps) {
  const [metaIntegration, setMetaIntegration] = useState<MetaIntegrationData | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);

  // Estados dos controles de personalização
  const [callToAction, setCallToAction] = useState('');
  const [renderedImageUrl, setRenderedImageUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Carregar status da Meta ao abrir o modal
  useEffect(() => {
    if (!isOpen) return;
    setLoadingMeta(true);
    fetch('/api/meta/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.integration) {
          setMetaIntegration(data.integration);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMeta(false));
  }, [isOpen]);

  // Atualizar chamada padrão conforme a oferta selecionada
  useEffect(() => {
    if (offer) {
      const discount = offer.discountPct ? offer.discountPct.replace(/\D/g, '') : '';
      if (discount && Number(discount) > 0) {
        setCallToAction(`👇 COMPRE AQUI COM ${discount}% OFF 👇`);
      } else {
        setCallToAction('👇 COMPRE AQUI COM O MELHOR PREÇO 👇');
      }
      setRenderedImageUrl(offer.story?.imageUrl || null);
      setErrorNotice(null);
      setSuccessNotice(null);
    }
  }, [offer]);

  if (!isOpen || !offer) return null;

  // 1. Renderizar imagem 9:16 de alta resolução no servidor
  const handleRenderStory = async (): Promise<string | null> => {
    setIsRendering(true);
    setErrorNotice(null);
    try {
      const res = await fetch('/api/stories/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: offer.id,
          title: offer.title,
          priceOriginal: offer.priceOriginal,
          priceCurrent: offer.priceCurrent,
          discountPct: offer.discountPct,
          coupon: offer.coupon,
          imageUrl: offer.mediaUrl,
          affiliateUrl: offer.affiliateUrl,
          linkCallToAction: callToAction,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao processar arte do Story.');
      }

      setRenderedImageUrl(data.publicUrl);
      return data.publicUrl;
    } catch (err: any) {
      setErrorNotice(err.message || 'Erro ao gerar o Story.');
      return null;
    } finally {
      setIsRendering(false);
    }
  };

  // 2. Postar direto no Instagram Stories via Meta API
  const handlePublishToInstagram = async () => {
    setIsPublishing(true);
    setErrorNotice(null);
    setSuccessNotice(null);

    try {
      // Se a imagem ainda não foi renderizada, renderizar primeiro
      let targetImageUrl = renderedImageUrl;
      if (!targetImageUrl) {
        targetImageUrl = await handleRenderStory();
        if (!targetImageUrl) return;
      }

      const res = await fetch('/api/meta/stories/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: offer.id,
          imageUrl: targetImageUrl,
          callToAction,
          caption: `${offer.title}\n${callToAction}\n${offer.affiliateUrl}`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'A Meta recusou a publicação do Story.');
      }

      setSuccessNotice('Story publicado com sucesso no Instagram!');
      if (onStoryPublished) onStoryPublished(offer.id);
    } catch (err: any) {
      setErrorNotice(err.message || 'Falha ao postar no Instagram.');
    } finally {
      setIsPublishing(false);
    }
  };

  // 3. Copiar Link de Afiliado
  const handleCopyLink = () => {
    if (offer.affiliateUrl) {
      navigator.clipboard.writeText(offer.affiliateUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // 4. Download da Imagem 9:16
  const handleDownloadImage = async () => {
    let targetUrl = renderedImageUrl;
    if (!targetUrl) {
      targetUrl = await handleRenderStory();
      if (!targetUrl) return;
    }
    const a = document.createElement('a');
    a.href = targetUrl;
    a.download = `story_radar_${offer.id.slice(0, 8)}.jpg`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const discountVal = offer.discountPct ? offer.discountPct.replace(/\D/g, '') : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#091526] border border-[#18334D] rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#18334D] bg-[#061225]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0879DF] to-[#1CCAF2] flex items-center justify-center shadow-lg shadow-[#1CCAF2]/20">
              <InstagramIcon className="w-5 h-5 text-[#061225]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-[#F8FBFF]">
                Postar Story 9:16 da Oferta
              </h2>
              <p className="text-[11px] sm:text-xs text-[#8EADC7]">
                Gere a imagem no formato vertical com destaque para o link de compra direta.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8EADC7] hover:text-[#F8FBFF] hover:bg-[#18334D]/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificações de Erro ou Sucesso */}
        {errorNotice && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-[#F87171]/15 border border-[#F87171]/40 flex items-start gap-2.5 text-xs text-[#F87171]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">{errorNotice}</div>
          </div>
        )}
        {successNotice && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-[#20C997]/15 border border-[#20C997]/40 flex items-center gap-2.5 text-xs text-[#20C997]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <div>{successNotice}</div>
          </div>
        )}

        {/* Conteúdo Principal em 2 Colunas */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Coluna Esquerda: Controles e Ações */}
          <div className="md:col-span-7 space-y-4">
            {/* Card com Detalhes do Produto */}
            <div className="p-4 rounded-xl bg-[#0D1B31] border border-[#18334D] space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-[#8EADC7]">
                <span className="font-bold text-[#1CCAF2] uppercase tracking-wider">
                  {offer.store}
                </span>
                <span>{new Date(offer.sentAt).toLocaleDateString('pt-BR')}</span>
              </div>
              <h3 className="text-xs sm:text-sm font-bold text-[#F8FBFF] line-clamp-2">
                {offer.title}
              </h3>
              <div className="flex items-baseline gap-2 pt-1">
                {offer.priceOriginal && (
                  <span className="text-xs text-[#8EADC7] line-through">
                    De: R$ {offer.priceOriginal}
                  </span>
                )}
                <span className="text-base font-black text-[#1CCAF2]">
                  Por: R$ {offer.priceCurrent}
                </span>
                {discountVal && (
                  <span className="px-2 py-0.5 rounded-md bg-[#20C997]/20 border border-[#20C997]/40 text-[#20C997] text-[10px] font-black">
                    -{discountVal}% OFF
                  </span>
                )}
              </div>
              {offer.coupon && (
                <div className="inline-block px-2.5 py-0.5 rounded-lg bg-[#1CCAF2]/15 border border-[#1CCAF2]/30 text-[11px] font-bold text-[#1CCAF2]">
                  🎟️ Cupom: {offer.coupon}
                </div>
              )}
            </div>

            {/* Configuração da Chamada do Link de Compra (Pedido do Usuário) */}
            <div className="p-4 rounded-xl bg-[#0D1B31] border border-[#18334D] space-y-3">
              <label className="text-xs font-bold text-[#F8FBFF] block">
                Texto em cima do link de compra:
              </label>

              {/* Botões rápidos de sugestão */}
              <div className="flex flex-wrap gap-1.5">
                {discountVal && (
                  <button
                    type="button"
                    onClick={() => setCallToAction(`👇 COMPRE AQUI COM ${discountVal}% OFF 👇`)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                      callToAction.includes(`${discountVal}%`)
                        ? 'bg-[#1CCAF2] text-[#061225] border-[#1CCAF2]'
                        : 'bg-[#061225] text-[#8EADC7] border-[#18334D] hover:border-[#1CCAF2]/50'
                    }`}
                  >
                    Compre aqui com {discountVal}% OFF
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCallToAction('👇 COMPRE AGORA COM DESCONTO 👇')}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                    callToAction.includes('COM DESCONTO')
                      ? 'bg-[#1CCAF2] text-[#061225] border-[#1CCAF2]'
                      : 'bg-[#061225] text-[#8EADC7] border-[#18334D] hover:border-[#1CCAF2]/50'
                  }`}
                >
                  Compre agora com desconto
                </button>
                <button
                  type="button"
                  onClick={() => setCallToAction('👇 TOQUE NO LINK ABAIXO PARA COMPRAR 👇')}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                    callToAction.includes('TOQUE NO LINK')
                      ? 'bg-[#1CCAF2] text-[#061225] border-[#1CCAF2]'
                      : 'bg-[#061225] text-[#8EADC7] border-[#18334D] hover:border-[#1CCAF2]/50'
                  }`}
                >
                  Toque no link abaixo
                </button>
              </div>

              {/* Campo livre */}
              <input
                type="text"
                value={callToAction}
                onChange={(e) => setCallToAction(e.target.value)}
                placeholder="Ex: 👇 COMPRE AQUI COM 40% OFF 👇"
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>

            {/* Status da Conta Meta (Instagram / Facebook) */}
            <div className="p-4 rounded-xl bg-[#0D1B31] border border-[#18334D] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#F8FBFF] flex items-center gap-1.5">
                  <InstagramIcon className="w-3.5 h-3.5 text-[#E1306C]" />
                  Conta do Instagram
                </span>
                {metaIntegration?.isConnected ? (
                  <span className="flex items-center gap-1 text-[10px] font-black text-[#20C997] bg-[#20C997]/15 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#20C997] animate-pulse"></span>
                    Vinculada
                  </span>
                ) : (
                  <a
                    href="/conexoes?aba=redes"
                    className="text-[10px] font-bold text-[#1CCAF2] hover:underline flex items-center gap-1"
                  >
                    Vincular conta <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {metaIntegration?.isConnected ? (
                <div className="flex items-center gap-2.5 pt-1">
                  {metaIntegration.instagramProfilePic ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={metaIntegration.instagramProfilePic}
                      alt="Avatar"
                      className="w-7 h-7 rounded-full border border-[#1CCAF2]"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#18334D] flex items-center justify-center text-[10px] font-bold text-[#F8FBFF]">
                      @
                    </div>
                  )}
                  <div className="text-xs">
                    <span className="font-bold text-[#F8FBFF]">
                      @{metaIntegration.instagramUsername || 'instagram'}
                    </span>
                    <span className="text-[10px] text-[#8EADC7] block">
                      {metaIntegration.facebookPageName || 'Página do Facebook'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-[#8EADC7]">
                  Vincule seu Instagram em <strong>Conexões &gt; Redes Sociais</strong> para postar com 1 clique direto pelo sistema.
                </p>
              )}
            </div>

            {/* Botões de Ação */}
            <div className="space-y-2 pt-1">
              {metaIntegration?.isConnected ? (
                <button
                  type="button"
                  onClick={handlePublishToInstagram}
                  disabled={isPublishing || isRendering}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#FCB045] text-white text-xs sm:text-sm font-black shadow-lg shadow-[#FD1D1D]/20 hover:opacity-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Publicando no Instagram Stories...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      🚀 Postar Direto no Instagram Stories
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRenderStory}
                  disabled={isRendering}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] text-xs sm:text-sm font-black shadow-lg shadow-[#1CCAF2]/20 hover:opacity-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isRendering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#061225]" />
                      Gerando Arte em Alta Resolução...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Gerar Arte do Story (9:16)
                    </>
                  )}
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadImage}
                  disabled={isRendering}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#061225] border border-[#18334D] hover:border-[#1CCAF2]/60 text-xs font-bold text-[#F8FBFF] transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#1CCAF2]" />
                  Baixar Imagem 9:16
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#061225] border border-[#18334D] hover:border-[#1CCAF2]/60 text-xs font-bold text-[#F8FBFF] transition-all cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#20C997]" />
                      <span className="text-[#20C997]">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#1CCAF2]" />
                      Copiar Link
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Coluna Direita: Prévia Visual 9:16 do Story */}
          <div className="md:col-span-5 flex flex-col items-center justify-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#8EADC7] mb-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#1CCAF2]" />
              Prévia Visual do Story (9:16)
            </span>

            <div className="w-full max-w-[280px] aspect-[9/16] rounded-2xl bg-gradient-to-b from-[#040C1A] via-[#091A30] to-[#040C1A] border-2 border-[#1CCAF2]/30 p-4 flex flex-col justify-between shadow-2xl relative overflow-hidden text-center">
              {/* Header */}
              <div className="flex items-center justify-between text-left">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-[#0D1B31] border border-[#1CCAF2] flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-[#1CCAF2]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-[#F8FBFF] block leading-none">
                      RADAR
                    </span>
                    <span className="text-[7px] font-bold text-[#8EADC7] block leading-none">
                      DE OFERTAS
                    </span>
                  </div>
                </div>
                <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-[#FF4757] text-white">
                  🔥 OFERTA DO DIA
                </span>
              </div>

              {/* Imagem Central */}
              <div className="my-auto relative rounded-xl overflow-hidden border border-[#1CCAF2]/40 bg-white shadow-lg p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={offer.mediaUrl}
                  alt={offer.title}
                  className="w-full h-36 object-contain"
                />
                {discountVal && (
                  <div className="absolute top-1.5 right-1.5 bg-[#20C997] text-[#061225] text-[9px] font-black px-1.5 py-0.5 rounded-md shadow">
                    -{discountVal}% OFF
                  </div>
                )}
              </div>

              {/* Informações e Valores */}
              <div className="space-y-1">
                <h4 className="text-[11px] font-extrabold text-[#F8FBFF] line-clamp-2 leading-tight">
                  {offer.title}
                </h4>
                <div className="flex items-baseline justify-center gap-1.5">
                  {offer.priceOriginal && (
                    <span className="text-[9px] text-[#8EADC7] line-through">
                      De: R$ {offer.priceOriginal}
                    </span>
                  )}
                  <span className="text-sm font-black text-[#1CCAF2]">
                    Por: R$ {offer.priceCurrent}
                  </span>
                </div>
                {offer.coupon && (
                  <span className="inline-block px-2 py-0.5 rounded-md bg-[#1CCAF2]/15 border border-[#1CCAF2]/30 text-[9px] font-bold text-[#1CCAF2]">
                    🎟️ {offer.coupon}
                  </span>
                )}
              </div>

              {/* Adesivo de Link Solicitado pelo Usuário */}
              <div className="mt-2 space-y-1">
                <span className="text-[9px] font-black text-[#F8FBFF] block leading-tight">
                  {callToAction}
                </span>
                <div className="py-1.5 px-2 rounded-xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] text-[10px] font-black shadow-md flex items-center justify-center gap-1">
                  <ShoppingBag className="w-3 h-3 text-[#061225]" />
                  LINK DE COMPRA DIRETA
                </div>
              </div>

              {/* Rodapé */}
              <div className="mt-1 pt-1 border-t border-[#18334D] text-[8px] text-[#8EADC7]">
                🎯 Radar de Ofertas — @radar.ofertas.br1
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
