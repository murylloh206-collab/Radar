'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Download,
  Send,
  Loader2,
  Copy,
  Check,
  ShoppingBag,
  Smartphone,
  FileText,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
} from 'lucide-react';
import { InstagramIcon, FacebookIcon } from './SocialIcons';
import { CopiedOfferHistoryItem } from '@/app/api/copier/history/route';
import { generatePostCaption, PostCopyStyle } from '@/lib/client/post-copy-generator';

interface MetaIntegrationData {
  isConnected: boolean;
  facebookPageName?: string;
  instagramUsername?: string;
  authType?: string;
}

interface StoryPublisherModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: CopiedOfferHistoryItem | null;
  initialTab?: 'story' | 'feed';
  onPublished?: (jobId: string) => void;
}

function parsePriceToNumber(raw?: string | number): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;
  const cleaned = String(raw).replace(/[R$\s]/g, '').trim();
  if (!cleaned) return null;

  if (cleaned.includes(',') && cleaned.includes('.')) {
    const val = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    return isNaN(val) ? null : val;
  }
  if (cleaned.includes(',')) {
    const val = parseFloat(cleaned.replace(',', '.'));
    return isNaN(val) ? null : val;
  }
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

function formatPriceBRL(val: number): string {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function StoryPublisherModal({
  isOpen,
  onClose,
  offer,
  initialTab = 'story',
  onPublished,
}: StoryPublisherModalProps) {
  const [activeTab, setActiveTab] = useState<'story' | 'feed'>(initialTab);
  const [metaIntegration, setMetaIntegration] = useState<MetaIntegrationData | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);

  // Estados da Aba Story 9:16
  const [callToAction, setCallToAction] = useState('');
  const [renderedImageUrl, setRenderedImageUrl] = useState<string | null>(null);
  const [isRenderingStory, setIsRenderingStory] = useState(false);
  const [isPublishingStory, setIsPublishingStory] = useState(false);

  // Estados da Aba Feed Post 1:1
  const [copyStyle, setCopyStyle] = useState<PostCopyStyle>('promocional');
  const [postCaption, setPostCaption] = useState('');
  const [feedImageMode, setFeedImageMode] = useState<'art' | 'product'>('art');
  const [renderedFeedImageUrl, setRenderedFeedImageUrl] = useState<string | null>(null);
  const [isRenderingFeed, setIsRenderingFeed] = useState(false);
  const [publishToFacebook, setPublishToFacebook] = useState(true);
  const [isPublishingPost, setIsPublishingPost] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);

  // Feedbacks
  const [copiedLink, setCopiedLink] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Carregar status da Meta
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

  // Cálculo automático de desconto
  const origNum = offer ? parsePriceToNumber(offer.priceOriginal) : null;
  const currNum = offer ? parsePriceToNumber(offer.priceCurrent) : null;

  let computedDiscount: number | null = null;
  if (origNum && currNum && origNum > currNum) {
    computedDiscount = Math.round(((origNum - currNum) / origNum) * 100);
  } else if (offer?.discountPct) {
    const parsed = parseInt(String(offer.discountPct).replace(/\D/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0) computedDiscount = parsed;
  }

  const discountVal = computedDiscount && computedDiscount > 0 ? computedDiscount : null;
  const priceDeFormatted = origNum ? `R$ ${formatPriceBRL(origNum)}` : offer?.priceOriginal || null;
  const pricePorFormatted = currNum ? `R$ ${formatPriceBRL(currNum)}` : offer?.priceCurrent || 'Confira o link';

  // Atualizar dados da oferta
  useEffect(() => {
    if (offer) {
      if (discountVal) {
        setCallToAction(`👇 COMPRE AQUI COM ${discountVal}% OFF 👇`);
      } else {
        setCallToAction('👇 COMPRE AQUI COM O MELHOR PREÇO 👇');
      }

      setRenderedImageUrl(offer.story?.imageUrl || null);
      setRenderedFeedImageUrl(null);
      setErrorNotice(null);
      setSuccessNotice(null);

      // Gerar a legenda do post inicial
      const caption = generatePostCaption(
        {
          title: offer.title,
          priceOriginal: priceDeFormatted || undefined,
          priceCurrent: pricePorFormatted,
          discountPct: discountVal ? `${discountVal}%` : undefined,
          coupon: offer.coupon,
          affiliateUrl: offer.affiliateUrl,
          store: offer.store,
        },
        copyStyle
      );
      setPostCaption(caption);
    }
  }, [offer, copyStyle, discountVal, priceDeFormatted, pricePorFormatted]);

  if (!isOpen || !offer) return null;

  // 1. Renderizar imagem 9:16 no servidor (Story)
  const handleRenderStory = async (): Promise<string | null> => {
    setIsRenderingStory(true);
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
          discountPct: discountVal ? String(discountVal) : undefined,
          coupon: offer.coupon,
          imageUrl: offer.mediaUrl,
          affiliateUrl: offer.affiliateUrl,
          linkCallToAction: callToAction,
          format: 'story_9_16',
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
      setIsRenderingStory(false);
    }
  };

  // 2. Renderizar imagem quadrada 1:1 no servidor (Feed Post)
  const handleRenderFeedPost = async (): Promise<string | null> => {
    setIsRenderingFeed(true);
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
          discountPct: discountVal ? String(discountVal) : undefined,
          coupon: offer.coupon,
          imageUrl: offer.mediaUrl,
          affiliateUrl: offer.affiliateUrl,
          linkCallToAction: '👉 Link nos Stories e na Bio',
          format: 'feed_1_1',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao processar arte de Feed 1:1.');
      }

      setRenderedFeedImageUrl(data.publicUrl);
      return data.publicUrl;
    } catch (err: any) {
      setErrorNotice(err.message || 'Erro ao gerar a arte de Feed.');
      return null;
    } finally {
      setIsRenderingFeed(false);
    }
  };

  // 3. Postar Story no Instagram
  const handlePublishStory = async () => {
    setIsPublishingStory(true);
    setErrorNotice(null);
    setSuccessNotice(null);

    try {
      let targetImageUrl = renderedImageUrl;
      if (!targetImageUrl) {
        targetImageUrl = await handleRenderStory();
      }

      if (!targetImageUrl) {
        throw new Error('Não foi possível gerar a imagem 9:16 para o Story.');
      }

      const res = await fetch('/api/meta/stories/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: offer.id,
          imageUrl: targetImageUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'A Meta recusou a publicação do Story.');
      }

      setSuccessNotice('Story publicado com sucesso no Instagram!');
      if (onPublished) onPublished(offer.id);
    } catch (err: any) {
      setErrorNotice(err.message || 'Falha ao postar no Instagram.');
    } finally {
      setIsPublishingStory(false);
    }
  };

  // 4. Postar Feed Post no Instagram e Facebook
  const handlePublishFeedPost = async () => {
    if (!postCaption.trim()) {
      setErrorNotice('Digite ou gere uma legenda para a publicação.');
      return;
    }

    setIsPublishingPost(true);
    setErrorNotice(null);
    setSuccessNotice(null);

    try {
      let targetImage = offer.mediaUrl;
      if (feedImageMode === 'art') {
        if (!renderedFeedImageUrl) {
          targetImage = (await handleRenderFeedPost()) || offer.mediaUrl;
        } else {
          targetImage = renderedFeedImageUrl;
        }
      }

      const res = await fetch('/api/meta/posts/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: offer.id,
          imageUrl: targetImage,
          caption: postCaption,
          publishToFacebook,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao publicar post na Meta.');
      }

      setSuccessNotice('Post publicado com sucesso no Feed do Instagram e Facebook!');
      if (onPublished) onPublished(offer.id);
    } catch (err: any) {
      setErrorNotice(err.message || 'Falha ao publicar Post.');
    } finally {
      setIsPublishingPost(false);
    }
  };

  // Copiar legenda do post
  const handleCopyCaption = () => {
    if (postCaption) {
      navigator.clipboard.writeText(postCaption);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
    }
  };

  // Copiar Link
  const handleCopyLink = () => {
    if (offer.affiliateUrl) {
      navigator.clipboard.writeText(offer.affiliateUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Download do Story 9:16
  const handleDownloadStoryImage = async () => {
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

  // Download do Feed Post 1:1
  const handleDownloadFeedImage = async () => {
    let targetUrl = renderedFeedImageUrl;
    if (!targetUrl) {
      targetUrl = await handleRenderFeedPost();
      if (!targetUrl) return;
    }
    const a = document.createElement('a');
    a.href = targetUrl;
    a.download = `feed_radar_${offer.id.slice(0, 8)}.jpg`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-[2147482995] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#0c0c0d] border border-[#2c2c2c] shadow-2xl flex flex-col text-white">
        {/* Cabeçalho do Modal */}
        <div className="p-4 sm:p-5 border-b border-[#2c2c2c] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#161616]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl overflow-hidden border border-[#f5c542]/50 flex items-center justify-center shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/radar-logo.jpg" alt="Radar de Ofertas" className="w-full h-full object-cover" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-[#f6f2e8]">
                Publicar no Instagram & Facebook
              </h2>
              <p className="text-[11px] sm:text-xs text-[#a8a39a]">
                Radar de Ofertas • @radar.ofertas.br1
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {/* Seletor de Abas com a cor original ciano (#f5c542) */}
            <div className="flex bg-[#0c0c0d] p-1 rounded-xl border border-[#2c2c2c]">
              <button
                type="button"
                onClick={() => setActiveTab('story')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'story'
                    ? 'bg-[#f5c542] text-[#0c0c0d] shadow-sm'
                    : 'text-[#a8a39a] hover:text-[#f6f2e8]'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Story (9:16)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('feed')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'feed'
                    ? 'bg-[#f5c542] text-[#0c0c0d] shadow-sm'
                    : 'text-[#a8a39a] hover:text-[#f6f2e8]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Post de Feed (1:1)
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#a8a39a] hover:text-[#f6f2e8] hover:bg-[#2c2c2c] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notificações de Erro ou Sucesso */}
        {errorNotice && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-red-500/15 border border-red-500/40 flex items-start gap-2.5 text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 whitespace-pre-line">{errorNotice}</div>
          </div>
        )}
        {successNotice && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-[#5fd0a0]/15 border border-[#5fd0a0]/40 flex items-center gap-2.5 text-xs text-[#5fd0a0]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <div>{successNotice}</div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ABA 1: STORY 9:16                                        */}
        {/* ======================================================== */}
        {activeTab === 'story' && (
          <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            <div className="md:col-span-7 space-y-4">
              {/* Card com Detalhes da Oferta */}
              <div className="p-4 rounded-xl bg-[#161616] border border-[#2c2c2c] space-y-2">
                <div className="flex items-center justify-between text-[11px] text-[#a8a39a]">
                  <span className="font-bold text-[#f5c542] uppercase tracking-wider">
                    {offer.store}
                  </span>
                  <span>{new Date(offer.sentAt).toLocaleDateString('pt-BR')}</span>
                </div>
                <h3 className="text-xs sm:text-sm font-bold text-[#f6f2e8] line-clamp-2">
                  {offer.title}
                </h3>
                <div className="flex items-baseline gap-2 pt-0.5">
                  {priceDeFormatted && (
                    <span className="text-xs text-[#a8a39a] line-through">
                      DE: {priceDeFormatted}
                    </span>
                  )}
                  <span className="text-base font-black text-[#f5c542]">
                    POR: {pricePorFormatted}
                  </span>
                  {discountVal && (
                    <span className="px-2 py-0.5 rounded-md bg-[#5fd0a0]/20 border border-[#5fd0a0]/50 text-[#5fd0a0] text-[10px] font-black">
                      {discountVal}% OFF
                    </span>
                  )}
                </div>
              </div>

              {/* Botão de Chamada para Ação */}
              <div className="p-4 rounded-xl bg-[#161616] border border-[#2c2c2c] space-y-3">
                <label className="text-xs font-bold text-[#f6f2e8] block">
                  Texto do botão de compra no Story:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {discountVal && (
                    <button
                      type="button"
                      onClick={() => setCallToAction(`👉 COMPRE AQUI COM ${discountVal}% OFF`)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                        callToAction.includes(`${discountVal}%`)
                          ? 'bg-[#f5c542] text-[#0c0c0d] border-[#f5c542]'
                          : 'bg-[#0c0c0d] text-[#a8a39a] border-[#2c2c2c]'
                      }`}
                    >
                      Compre com {discountVal}% OFF
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCallToAction('👉 COMPRE DIRETO NO LINK')}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                      callToAction === '👉 COMPRE DIRETO NO LINK'
                        ? 'bg-[#f5c542] text-[#0c0c0d] border-[#f5c542]'
                        : 'bg-[#0c0c0d] text-[#a8a39a] border-[#2c2c2c]'
                    }`}
                  >
                    Compre direto no link
                  </button>
                  <button
                    type="button"
                    onClick={() => setCallToAction('👉 CONFIRA A OFERTA NO GRUPO')}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                      callToAction.includes('NO GRUPO')
                        ? 'bg-[#f5c542] text-[#0c0c0d] border-[#f5c542]'
                        : 'bg-[#0c0c0d] text-[#a8a39a] border-[#2c2c2c]'
                    }`}
                  >
                    Confira no grupo
                  </button>
                </div>

                <input
                  type="text"
                  value={callToAction}
                  onChange={(e) => setCallToAction(e.target.value)}
                  placeholder="Texto do botão..."
                  className="w-full bg-[#0c0c0d] border border-[#2c2c2c] rounded-xl px-3 py-2 text-xs text-[#f6f2e8] focus:outline-none focus:border-[#f5c542]"
                />
              </div>

              {/* Botões de Ação */}
              <div className="space-y-2.5">
                {metaIntegration?.isConnected ? (
                  <button
                    type="button"
                    onClick={handlePublishStory}
                    disabled={isPublishingStory || isRenderingStory}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#d9a520] to-[#f5c542] text-[#0c0c0d] text-xs sm:text-sm font-black shadow-lg shadow-[#f5c542]/20 hover:opacity-95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isPublishingStory ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-[#0c0c0d]" />
                        Publicando no Instagram Stories...
                      </>
                    ) : (
                      <>
                        <InstagramIcon className="w-4 h-4 text-[#0c0c0d]" />
                        📲 Postar Direto no Instagram Stories
                      </>
                    )}
                  </button>
                ) : (
                  <div className="p-3 rounded-xl bg-[#161616] border border-[#f5c542]/30 text-xs text-[#a8a39a] flex items-center justify-between">
                    <span>Conta Meta desconectada. Vincule para publicar com 1 clique.</span>
                    <a href="/conexoes?aba=redes" className="font-bold text-[#f5c542] hover:underline">
                      Vincular ↗
                    </a>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleRenderStory}
                    disabled={isRenderingStory}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#161616] border border-[#2c2c2c] text-xs font-bold text-[#f6f2e8] hover:border-[#f5c542] transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isRenderingStory ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#f5c542]" />
                        Gerando Arte...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-[#f5c542]" />
                        Gerar Arte 9:16
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadStoryImage}
                    disabled={isRenderingStory}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#161616] border border-[#2c2c2c] text-xs font-bold text-[#a8a39a] hover:text-[#f6f2e8] hover:border-[#a8a39a] transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar Story (JPG)
                  </button>
                </div>
              </div>
            </div>

            {/* Coluna Direita: Prévia do Story 9:16 com a paleta original e selo OFERTA IMPERDÍVEL */}
            <div className="md:col-span-5 flex flex-col items-center justify-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#a8a39a] mb-2 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#f5c542]" />
                Prévia do Story (9:16)
              </span>

              <div className="w-full max-w-[280px] aspect-[9/16] rounded-2xl bg-gradient-to-b from-[#090908] via-[#1e1d1b] to-[#0b0b0a] border-2 border-[#f5c542]/40 p-4 flex flex-col justify-between shadow-2xl relative overflow-hidden text-center">
                {/* Header oficial */}
                <div className="flex items-center justify-between text-left">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-lg overflow-hidden border border-[#f5c542]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/radar-logo.jpg" alt="Logo" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-[#f6f2e8] block leading-none">
                        RADAR DE OFERTAS
                      </span>
                      <span className="text-[7.5px] font-bold text-[#a8a39a] block leading-none">
                        @radar.ofertas.br1
                      </span>
                    </div>
                  </div>
                  {/* SELO SUPERIOR REQUISITADO: OFERTA IMPERDÍVEL */}
                  <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-[#d9a520] to-[#f5c542] text-[#090908]">
                    OFERTA IMPERDÍVEL
                  </span>
                </div>

                {/* Imagem do Produto no Card Branco com Contain */}
                <div className="my-auto relative rounded-xl overflow-hidden border border-[#f5c542]/30 bg-white shadow-lg p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={offer.mediaUrl}
                    alt={offer.title}
                    className="w-full h-36 object-contain"
                  />
                  {discountVal && (
                    <div className="absolute top-1.5 right-1.5 bg-[#5fd0a0] text-[#090908] text-[9px] font-black px-1.5 py-0.5 rounded-md shadow">
                      -{discountVal}% OFF
                    </div>
                  )}
                </div>

                {/* Título e Preços */}
                <div className="space-y-1">
                  <h4 className="text-[11px] font-extrabold text-[#f6f2e8] line-clamp-2 leading-tight">
                    {offer.title}
                  </h4>
                  <div className="flex items-baseline justify-center gap-1.5">
                    {priceDeFormatted && (
                      <span className="text-[9px] text-[#a8a39a] line-through">
                        DE: {priceDeFormatted}
                      </span>
                    )}
                    <span className="text-sm font-black text-[#f5c542]">
                      POR: {pricePorFormatted}
                    </span>
                  </div>
                </div>

                {/* Botão de Compra no Story */}
                <div className="mt-2 space-y-1">
                  <div className="py-2 px-2 rounded-xl bg-gradient-to-r from-[#f5c542] to-[#ffbb00] text-[#090908] text-[10px] font-black shadow-md flex items-center justify-center gap-1">
                    <ShoppingBag className="w-3 h-3 text-[#090908]" />
                    {callToAction}
                  </div>
                </div>

                {/* Rodapé Oficial */}
                <div className="mt-1 pt-1 border-t border-[#2c2c2c] text-[8px] text-[#a8a39a]">
                  🎯 Radar de Ofertas • <span className="text-[#f5c542]">@radar.ofertas.br1</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ABA 2: POST DE FEED (1:1 QUADRADO)                       */}
        {/* ======================================================== */}
        {activeTab === 'feed' && (
          <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            <div className="md:col-span-7 space-y-4">
              {/* Opção da Imagem: Arte Publicitária vs Imagem Pura */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#f6f2e8] flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#f5c542]" />
                  Tipo de Imagem para o Feed:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFeedImageMode('art')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      feedImageMode === 'art'
                        ? 'bg-[#161616] border-[#f5c542] text-[#f6f2e8]'
                        : 'bg-[#0c0c0d] border-[#2c2c2c] text-[#a8a39a]'
                    }`}
                  >
                    <span className="text-xs font-black block text-[#f5c542]">
                      🎨 Arte Publicitária (1:1)
                    </span>
                    <span className="text-[10px] text-[#a8a39a] block">
                      Com Logo, Preço DE/POR e Selo Oficial.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFeedImageMode('product')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      feedImageMode === 'product'
                        ? 'bg-[#161616] border-[#f5c542] text-[#f6f2e8]'
                        : 'bg-[#0c0c0d] border-[#2c2c2c] text-[#a8a39a]'
                    }`}
                  >
                    <span className="text-xs font-black block text-[#f6f2e8]">
                      📸 Foto Limpa do Produto
                    </span>
                    <span className="text-[10px] text-[#a8a39a] block">
                      Imagem de catálogo padronizada 1080x1080.
                    </span>
                  </button>
                </div>
              </div>

              {/* Botões de Geração e Download da Arte de Feed */}
              {feedImageMode === 'art' && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleRenderFeedPost}
                    disabled={isRenderingFeed}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#161616] border border-[#2c2c2c] text-xs font-bold text-[#f6f2e8] hover:border-[#f5c542] transition-all cursor-pointer"
                  >
                    {isRenderingFeed ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#f5c542]" />
                        Renderizando Arte 1:1...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-[#f5c542]" />
                        Gerar Arte Feed 1:1
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadFeedImage}
                    disabled={isRenderingFeed}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#161616] border border-[#2c2c2c] text-xs font-bold text-[#a8a39a] hover:text-[#f6f2e8] transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar Arte (JPG)
                  </button>
                </div>
              )}

              {/* Estilos de Legenda Automática */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#f6f2e8] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#f5c542]" />
                    Legenda para Instagram & Facebook:
                  </label>
                  <button
                    type="button"
                    onClick={handleCopyCaption}
                    className="text-[11px] font-bold text-[#f5c542] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {copiedCaption ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedCaption ? 'Copiada!' : 'Copiar Texto'}
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCopyStyle('promocional')}
                    className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                      copyStyle === 'promocional'
                        ? 'bg-[#f5c542] text-[#0c0c0d] border-[#f5c542]'
                        : 'bg-[#161616] text-[#a8a39a] border-[#2c2c2c]'
                    }`}
                  >
                    ⚡ Promocional
                  </button>
                  <button
                    type="button"
                    onClick={() => setCopyStyle('engajamento')}
                    className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                      copyStyle === 'engajamento'
                        ? 'bg-[#f5c542] text-[#0c0c0d] border-[#f5c542]'
                        : 'bg-[#161616] text-[#a8a39a] border-[#2c2c2c]'
                    }`}
                  >
                    💬 Comente EU QUERO
                  </button>
                  <button
                    type="button"
                    onClick={() => setCopyStyle('curto')}
                    className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                      copyStyle === 'curto'
                        ? 'bg-[#f5c542] text-[#0c0c0d] border-[#f5c542]'
                        : 'bg-[#161616] text-[#a8a39a] border-[#2c2c2c]'
                    }`}
                  >
                    🎯 Curto & Direto
                  </button>
                </div>

                {/* Editor da Legenda do Post */}
                <textarea
                  rows={8}
                  value={postCaption}
                  onChange={(e) => setPostCaption(e.target.value)}
                  placeholder="Edite a legenda do post..."
                  className="w-full bg-[#0c0c0d] border border-[#2c2c2c] rounded-xl p-3 text-xs text-[#f6f2e8] font-sans leading-relaxed focus:outline-none focus:border-[#f5c542]"
                />
                <div className="flex justify-between text-[10px] text-[#a8a39a]">
                  <span>Caracteres: {postCaption.length}</span>
                  <span>Link de afiliado incluso na legenda</span>
                </div>
              </div>

              {/* Opção de Publicar também no Facebook */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#161616] border border-[#2c2c2c] cursor-pointer">
                <input
                  type="checkbox"
                  checked={publishToFacebook}
                  onChange={(e) => setPublishToFacebook(e.target.checked)}
                  className="w-4 h-4 rounded text-[#f5c542] focus:ring-0 bg-[#0c0c0d] border-[#2c2c2c]"
                />
                <div className="flex-1 text-xs">
                  <span className="font-bold text-[#f6f2e8] flex items-center gap-1.5">
                    <FacebookIcon size={14} className="text-[#1877F2]" />
                    Publicar também na Página do Facebook
                  </span>
                  <span className="text-[10px] text-[#a8a39a] block">
                    Sincroniza foto e texto na sua Página conectada.
                  </span>
                </div>
              </label>

              {/* Botão de Disparo do Post */}
              {metaIntegration?.isConnected ? (
                <button
                  type="button"
                  onClick={handlePublishFeedPost}
                  disabled={isPublishingPost}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#d9a520] to-[#f5c542] text-[#0c0c0d] text-xs sm:text-sm font-black shadow-lg shadow-[#f5c542]/20 hover:opacity-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isPublishingPost ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#0c0c0d]" />
                      Publicando no Feed do Instagram & Facebook...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 text-[#0c0c0d]" />
                      🚀 Publicar Post no Feed Agora
                    </>
                  )}
                </button>
              ) : (
                <div className="p-3 rounded-xl bg-[#161616] border border-[#f5c542]/30 text-xs text-[#a8a39a] flex items-center justify-between">
                  <span>Conecte sua conta em Conexões para postar no Feed com 1 clique.</span>
                  <a href="/conexoes?aba=redes" className="font-bold text-[#f5c542] hover:underline">
                    Vincular ↗
                  </a>
                </div>
              )}
            </div>

            {/* Coluna Direita: Prévia do Post de Feed */}
            <div className="md:col-span-5 flex flex-col items-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#a8a39a] mb-2 flex items-center gap-1">
                <InstagramIcon size={14} className="text-[#E1306C]" />
                Prévia do Post no Feed
              </span>

              <div className="w-full max-w-[300px] rounded-2xl bg-[#161616] border border-[#2c2c2c] shadow-xl overflow-hidden text-left">
                {/* Cabeçalho do Post */}
                <div className="p-2.5 flex items-center gap-2 border-b border-[#2c2c2c] bg-[#0c0c0d]">
                  <div className="w-7 h-7 rounded-lg overflow-hidden border border-[#f5c542]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/radar-logo.jpg" alt="Logo" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-[#f6f2e8] block leading-none">
                      {metaIntegration?.instagramUsername || 'radar.ofertas.br1'}
                    </span>
                    <span className="text-[8px] text-[#f5c542]">Radar de Ofertas</span>
                  </div>
                </div>

                {/* Imagem do Produto no Post */}
                <div className="w-full aspect-square bg-white flex items-center justify-center p-3 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={feedImageMode === 'art' && renderedFeedImageUrl ? renderedFeedImageUrl : offer.mediaUrl}
                    alt={offer.title}
                    className="w-full h-full object-contain"
                  />
                  {feedImageMode === 'product' && discountVal && (
                    <div className="absolute top-2 right-2 bg-[#5fd0a0] text-[#0c0c0d] text-[10px] font-black px-2 py-0.5 rounded-md shadow">
                      {discountVal}% OFF
                    </div>
                  )}
                </div>

                {/* Legenda com quebra */}
                <div className="p-3 space-y-1 bg-[#0c0c0d]/80 max-h-36 overflow-y-auto">
                  <p className="text-[10px] text-[#f6f2e8] whitespace-pre-line leading-relaxed font-sans">
                    {postCaption}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
