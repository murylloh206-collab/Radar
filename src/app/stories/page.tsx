'use client';

import React, { useState, useEffect } from 'react';
import {
  Send,
  Download,
  Sparkles,
  Flame,
  ShoppingBag,
  History,
  Check,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { InstagramIcon } from '@/components/SocialIcons';
import { Logo } from '@/components/Logo';
import { CopiedOfferHistoryItem } from '@/app/api/copier/history/route';
import { MetaIntegrationData } from '@/lib/server/meta-graph-service';

export default function StoriesPage() {
  const [historyItems, setHistoryItems] = useState<CopiedOfferHistoryItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [metaIntegration, setMetaIntegration] = useState<MetaIntegrationData | null>(null);

  // Campos do Story
  const [title, setTitle] = useState('Camisa Térmica Voker Academia Proteção Solar Uv Dry Fit');
  const [priceOriginal, setPriceOriginal] = useState('69,99');
  const [priceCurrent, setPriceCurrent] = useState('38,90');
  const [discountPct, setDiscountPct] = useState('44');
  const [imageUrl, setImageUrl] = useState(
    'https://hodcnehnnchfyortdjzp.supabase.co/storage/v1/object/public/radar-media/00000000-0000-0000-0000-000000000001/clean-products/70d6c302b21679e6ac0a.jpg'
  );
  const [coupon, setCoupon] = useState('');
  const [affiliateUrl, setAffiliateUrl] = useState('https://is.gd/4Smf1n');
  const [ctaText, setCtaText] = useState('👇 COMPRE AQUI COM 44% OFF 👇');

  // Estados de execução
  const [isRendering, setIsRendering] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [renderedPublicUrl, setRenderedPublicUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Carregar histórico e status da Meta ao abrir
  useEffect(() => {
    fetch('/api/copier/history?limit=15')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.items) && data.items.length > 0) {
          setHistoryItems(data.items);
        }
      })
      .catch(() => {});

    fetch('/api/meta/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.integration) {
          setMetaIntegration(data.integration);
        }
      })
      .catch(() => {});
  }, []);

  // Selecionar oferta do histórico
  const handleSelectHistoryItem = (id: string) => {
    setSelectedJobId(id);
    const found = historyItems.find((item) => item.id === id);
    if (found) {
      setTitle(found.title);
      setPriceOriginal(found.priceOriginal || '');
      setPriceCurrent(found.priceCurrent);
      setDiscountPct(found.discountPct ? found.discountPct.replace(/\D/g, '') : '');
      setCoupon(found.coupon || '');
      if (found.mediaUrl) setImageUrl(found.mediaUrl);
      if (found.affiliateUrl) setAffiliateUrl(found.affiliateUrl);

      const disc = found.discountPct ? found.discountPct.replace(/\D/g, '') : '';
      if (disc) {
        setCtaText(`👇 COMPRE AQUI COM ${disc}% OFF 👇`);
      } else {
        setCtaText('👇 COMPRE AQUI COM O MELHOR PREÇO 👇');
      }
      setRenderedPublicUrl(null);
    }
  };

  // 1. Gerar e baixar imagem 9:16
  const handleRender = async (): Promise<string | null> => {
    setIsRendering(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/stories/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: selectedJobId || undefined,
          title,
          priceOriginal,
          priceCurrent,
          discountPct,
          coupon,
          imageUrl,
          affiliateUrl,
          linkCallToAction: ctaText,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao renderizar a imagem do Story.');
      }

      setRenderedPublicUrl(data.publicUrl);
      return data.publicUrl;
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao gerar imagem 9:16.' });
      return null;
    } finally {
      setIsRendering(false);
    }
  };

  const handleDownload = async () => {
    let url = renderedPublicUrl;
    if (!url) {
      url = await handleRender();
      if (!url) return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = `story_radar_916.jpg`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // 2. Postar direto no Instagram Stories
  const handlePublishInstagram = async () => {
    setIsPublishing(true);
    setFeedback(null);
    try {
      let targetUrl = renderedPublicUrl;
      if (!targetUrl) {
        targetUrl = await handleRender();
        if (!targetUrl) return;
      }

      const res = await fetch('/api/meta/stories/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: selectedJobId || undefined,
          imageUrl: targetUrl,
          callToAction: ctaText,
          caption: `${title}\n${ctaText}\n${affiliateUrl}`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'A Meta recusou a publicação.');
      }

      setFeedback({ type: 'success', message: 'Story publicado no Instagram com sucesso!' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao postar no Instagram.' });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Título e Descrição */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] tracking-tight">
            Gerador de Stories 9:16
          </h1>
          <p className="text-xs sm:text-sm text-[#8EADC7] mt-0.5">
            Gere templates verticais de alta conversão para o Instagram Stories com link de compra direta.
          </p>
        </div>

        {metaIntegration?.isConnected ? (
          <div className="flex items-center gap-2 self-start sm:self-center bg-[#20C997]/15 border border-[#20C997]/40 px-3 py-1.5 rounded-xl text-xs text-[#20C997] font-bold">
            <span className="w-2 h-2 rounded-full bg-[#20C997] animate-pulse"></span>
            Instagram Conectado: @{metaIntegration.instagramUsername}
          </div>
        ) : (
          <a
            href="/conexoes?aba=redes"
            className="flex items-center gap-1.5 self-start sm:self-center bg-[#0D1B31] border border-[#1CCAF2]/40 px-3 py-1.5 rounded-xl text-xs text-[#1CCAF2] font-bold hover:bg-[#1CCAF2]/15 transition-all"
          >
            <InstagramIcon className="w-4 h-4" />
            Vincular Instagram & Facebook <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Alerta de Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-2.5 text-xs font-semibold ${
            feedback.type === 'success'
              ? 'bg-[#20C997]/15 border-[#20C997]/40 text-[#20C997]'
              : 'bg-[#F87171]/15 border-[#F87171]/40 text-[#F87171]'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Controles */}
        <div className="lg:col-span-6 space-y-4">
          {/* Seletor de Oferta Copiada */}
          {historyItems.length > 0 && (
            <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#1CCAF2] flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                Carregar de Oferta Copiada
              </label>
              <select
                value={selectedJobId}
                onChange={(e) => handleSelectHistoryItem(e.target.value)}
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
              >
                <option value="">Selecione uma oferta do Copiador...</option>
                {historyItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.store} — {item.title.slice(0, 50)}... (R$ {item.priceCurrent})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-5 space-y-3.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#1CCAF2]">
              Configuração do Story
            </h2>

            <div>
              <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                Título do Produto
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#8EADC7] block mb-1">Preço De (R$)</label>
                <input
                  type="text"
                  value={priceOriginal}
                  onChange={(e) => setPriceOriginal(e.target.value)}
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8EADC7] block mb-1">Preço Por (R$)</label>
                <input
                  type="text"
                  value={priceCurrent}
                  onChange={(e) => setPriceCurrent(e.target.value)}
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8EADC7] block mb-1">Desconto (%)</label>
                <input
                  type="text"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)}
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                Cupom de Desconto (Opcional)
              </label>
              <input
                type="text"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] uppercase focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                URL da Imagem do Produto
              </label>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>

            {/* Chamada do Link de Compra */}
            <div>
              <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                Texto em Cima do Link de Compra:
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {discountPct && (
                  <button
                    type="button"
                    onClick={() => setCtaText(`👇 COMPRE AQUI COM ${discountPct}% OFF 👇`)}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#061225] text-[#1CCAF2] border border-[#1CCAF2]/40 cursor-pointer"
                  >
                    Compre com {discountPct}% OFF
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCtaText('👇 COMPRE AGORA COM DESCONTO 👇')}
                  className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#061225] text-[#8EADC7] border border-[#18334D] cursor-pointer"
                >
                  Compre agora
                </button>
              </div>
              <input
                type="text"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>
          </div>

          {/* Botões de Publicação e Download */}
          <div className="space-y-2">
            {metaIntegration?.isConnected ? (
              <button
                type="button"
                onClick={handlePublishInstagram}
                disabled={isPublishing || isRendering}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#FCB045] text-white text-xs sm:text-sm font-black shadow-lg shadow-[#FD1D1D]/20 hover:opacity-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Publicando no Instagram...
                  </>
                ) : (
                  <>
                    <InstagramIcon className="w-4 h-4" />
                    Postar Agora no Instagram Stories
                  </>
                )}
              </button>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleRender}
                disabled={isRendering}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] text-xs font-black shadow-lg shadow-[#1CCAF2]/20 hover:opacity-95 transition-all cursor-pointer"
              >
                {isRendering ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#061225]" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Gerar Arte 9:16
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownload}
                disabled={isRendering}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#061225] border border-[#18334D] hover:border-[#1CCAF2]/60 text-xs font-bold text-[#F8FBFF] transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#1CCAF2]" />
                Baixar Imagem 9:16
              </button>
            </div>
          </div>
        </div>

        {/* Prévia 9:16 do Story */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="w-full max-w-[320px] aspect-[9/16] rounded-3xl bg-gradient-to-b from-[#040C1A] via-[#091A30] to-[#040C1A] border-2 border-[#1CCAF2]/30 p-5 flex flex-col justify-between shadow-2xl relative overflow-hidden text-center">
            {/* Top Logo */}
            <div className="flex items-center justify-between z-10 text-left">
              <Logo size="sm" />
              <span className="flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-[#FF4757] text-white">
                <Flame className="w-3 h-3 fill-white" />
                ACHADO DO DIA
              </span>
            </div>

            {/* Imagem Central */}
            <div className="my-auto relative rounded-2xl overflow-hidden border-2 border-[#1CCAF2]/40 bg-white shadow-xl p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={title} className="w-full h-44 object-contain" />
              {discountPct && (
                <div className="absolute top-2 right-2 bg-[#20C997] text-[#061225] text-xs font-black px-2 py-0.5 rounded-xl shadow-lg">
                  -{discountPct}% OFF
                </div>
              )}
            </div>

            {/* Texto e Preço */}
            <div className="z-10 space-y-2">
              <h3 className="text-xs font-extrabold text-[#F8FBFF] line-clamp-2 leading-snug">
                {title}
              </h3>

              <div className="flex items-baseline justify-center gap-2">
                {priceOriginal && (
                  <span className="text-xs text-[#8EADC7] line-through">
                    De: R$ {priceOriginal}
                  </span>
                )}
                <span className="text-xl font-black text-[#1CCAF2]">
                  Por: R$ {priceCurrent}
                </span>
              </div>

              {coupon && (
                <div className="inline-block px-3 py-1 rounded-xl bg-[#1CCAF2]/15 border border-[#1CCAF2]/40 text-xs font-bold text-[#1CCAF2]">
                  🎟️ Cupom: {coupon}
                </div>
              )}

              {/* Botão e Chamada de Link de Compra */}
              <div className="mt-3 space-y-1">
                <span className="text-[10px] font-black text-[#F8FBFF] block">
                  {ctaText}
                </span>
                <div className="p-2.5 rounded-2xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] text-xs font-black shadow-lg shadow-[#1CCAF2]/20 flex items-center justify-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  COMPRE DIRETO NO LINK
                </div>
              </div>

              {/* Rodapé da Marca */}
              <div className="pt-2 border-t border-[#18334D] text-[9px] text-[#8EADC7]">
                🎯 Radar de Ofertas — Produtos que valem a pena!
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
