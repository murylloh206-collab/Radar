'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Copy, RefreshCw, CheckCircle2, MessageSquare, Camera, Send } from 'lucide-react';
import type { CaptionTone, CaptionChannel } from '@/app/api/ai/caption/route';

interface AiCaptionGeneratorProps {
  initialTitle?: string;
  initialPrice?: string;
  initialOriginalPrice?: string;
  initialCoupon?: string;
  initialAffiliateUrl?: string;
}

export function AiCaptionGenerator({
  initialTitle = '',
  initialPrice = '',
  initialOriginalPrice = '',
  initialCoupon = '',
  initialAffiliateUrl = '',
}: AiCaptionGeneratorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [currentPrice, setCurrentPrice] = useState(initialPrice);
  const [originalPrice, setOriginalPrice] = useState(initialOriginalPrice);
  const [couponCode, setCouponCode] = useState(initialCoupon);
  const [affiliateUrl, setAffiliateUrl] = useState(initialAffiliateUrl);

  const [tone, setTone] = useState<CaptionTone>('animado');
  const [channel, setChannel] = useState<CaptionChannel>('whatsapp');
  const [variationIndex, setVariationIndex] = useState(0);

  const [generatedCaption, setGeneratedCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);

  useEffect(() => {
    if (initialTitle && !title) setTitle(initialTitle);
    if (initialPrice && !currentPrice) setCurrentPrice(initialPrice);
    if (initialCoupon && !couponCode) setCouponCode(initialCoupon);
    if (initialAffiliateUrl && !affiliateUrl) setAffiliateUrl(initialAffiliateUrl);
  }, [initialTitle, initialPrice, initialCoupon, initialAffiliateUrl, title, currentPrice, couponCode, affiliateUrl]);

  const parsePriceInput = (raw: string): number => {
    const cleaned = raw.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
    return Number(cleaned);
  };

  const handleGenerate = async (nextVariation = variationIndex) => {
    setError(null);

    const parsedCurrent = parsePriceInput(currentPrice);
    const parsedOriginal = originalPrice.trim() ? parsePriceInput(originalPrice) : undefined;

    if (!title.trim()) {
      setError('Informe o nome real do produto antes de gerar a legenda.');
      return;
    }

    if (isNaN(parsedCurrent) || parsedCurrent <= 0) {
      setError('Informe um preço atual válido (ex: 149,90). O sistema nunca inventa preços.');
      return;
    }

    if (!affiliateUrl.trim()) {
      setError('Informe o seu link de afiliado para incluir na legenda.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/ai/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          currentPrice: parsedCurrent,
          originalPrice: parsedOriginal && !isNaN(parsedOriginal) ? parsedOriginal : undefined,
          couponCode: couponCode.trim() || undefined,
          affiliateUrl: affiliateUrl.trim(),
          tone,
          channel,
          variationIndex: nextVariation,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Não foi possível gerar a legenda.');
        return;
      }
      setGeneratedCaption(data.caption);
      setProviderLabel(data.provider === 'gemini' ? 'IA Generativa (Gemini)' : 'Motor Inteligente Radar');
    } catch {
      setError('Erro de conexão ao gerar a legenda. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = () => {
    const nextVar = variationIndex + 1;
    setVariationIndex(nextVar);
    handleGenerate(nextVar);
  };

  const handleCopy = () => {
    if (!generatedCaption) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(generatedCaption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="rp-split">
      {/* Coluna Esquerda: Controles de Tom, Canal e Dados Reais */}
      <div className="rp-panel">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2>Gerador de legenda com IA</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 px-2.5 py-0.5 text-xs font-semibold text-indigo-300">
            <Sparkles className="w-3.5 h-3.5" />
            Incluído em todos os planos
          </span>
        </div>
        <p className="rp-sub">
          Escolha o tom e o canal para criar textos persuasivos com preço real, cupom e emojis prontos para postar.
        </p>

        {/* Seletor de Tom */}
        <div className="rp-field" style={{ marginTop: 14 }}>
          <span>1. Escolha o tom da legenda</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 6 }}>
            {(
              [
                { id: 'animado', label: '😍 Animado', desc: 'Entusiasmado e envolvente' },
                { id: 'direto', label: '🎯 Direto', desc: 'Objetivo e focado no preço' },
                { id: 'urgente', label: '🚨 Urgente', desc: 'Escassez e oportunidade rápida' },
              ] as const
            ).map((item) => {
              const active = tone === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTone(item.id)}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 10,
                    border: active ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.12)',
                    background: active ? 'rgba(99, 102, 241, 0.22)' : 'rgba(255,255,255,0.03)',
                    color: '#fff',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <strong style={{ display: 'block', fontSize: 13 }}>{item.label}</strong>
                  <small style={{ fontSize: 11, color: '#94a3b8' }}>{item.desc}</small>
                </button>
              );
            })}
          </div>
        </div>

        {/* Seletor de Canal */}
        <div className="rp-field" style={{ marginTop: 14 }}>
          <span>2. Escolha o canal de destino</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 6 }}>
            {(
              [
                { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
                { id: 'instagram', label: 'Instagram', icon: Camera },
                { id: 'telegram', label: 'Telegram', icon: Send },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = channel === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setChannel(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: active ? '1px solid #39bee6' : '1px solid rgba(255,255,255,0.12)',
                    background: active ? 'rgba(57, 190, 230, 0.18)' : 'rgba(255,255,255,0.03)',
                    color: '#fff',
                    fontWeight: active ? 700 : 500,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Campos do produto */}
        <label className="rp-field" style={{ marginTop: 14 }}>
          Nome do produto *
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Caixa de Som Bluetooth JBL Go 4 à Prova d'Água"
          />
        </label>

        <div className="rp-two-cols">
          <label className="rp-field">
            Preço anterior (opcional, R$)
            <input
              value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              placeholder="Ex: 299,90"
            />
          </label>

          <label className="rp-field">
            Preço em oferta (R$) *
            <input
              value={currentPrice}
              onChange={(e) => setCurrentPrice(e.target.value)}
              placeholder="Ex: 199,90"
            />
          </label>
        </div>

        <div className="rp-two-cols">
          <label className="rp-field">
            Cupom de desconto (opcional)
            <input
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              placeholder="Ex: PROMO20"
            />
          </label>

          <label className="rp-field">
            Seu link de afiliado *
            <input
              value={affiliateUrl}
              onChange={(e) => setAffiliateUrl(e.target.value)}
              placeholder="https://mercadolivre.com/sec/..."
            />
          </label>
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.14)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#fca5a5',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div className="rp-inline-actions rp-section">
          <button
            type="button"
            className="rp-btn rp-primary"
            disabled={loading}
            onClick={() => handleGenerate(variationIndex)}
          >
            <Sparkles className="w-4 h-4 mr-1.5 inline" />
            {loading ? 'Gerando legenda...' : 'Gerar legenda com IA'}
          </button>

          {generatedCaption && (
            <button
              type="button"
              className="rp-btn"
              disabled={loading}
              onClick={handleRegenerate}
            >
              <RefreshCw className="w-4 h-4 mr-1.5 inline" />
              Regenerar variação
            </button>
          )}
        </div>
      </div>

      {/* Coluna Direita: Resultado e Botão Copiar */}
      <div className="rp-panel">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2>Legenda pronta ({channel.toUpperCase()})</h2>
          {providerLabel && (
            <span className="text-xs text-slate-400">{providerLabel}</span>
          )}
        </div>

        {generatedCaption ? (
          <>
            <div
              className="rp-message rp-section"
              style={{
                whiteSpace: 'pre-wrap',
                minHeight: 220,
                fontSize: 14,
                lineHeight: 1.55,
              }}
            >
              {generatedCaption}
            </div>

            <div className="rp-inline-actions rp-section">
              <button
                type="button"
                className="rp-btn rp-primary"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-1.5 inline text-emerald-300" />
                    Copiado para a área de transferência!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-1.5 inline" />
                    Copiar legenda
                  </>
                )}
              </button>

              <button
                type="button"
                className="rp-btn"
                onClick={handleRegenerate}
                disabled={loading}
              >
                <RefreshCw className="w-4 h-4 mr-1.5 inline" />
                Regenerar outro texto
              </button>
            </div>
          </>
        ) : (
          <div
            className="rp-section"
            style={{
              padding: 28,
              borderRadius: 14,
              border: '1px dashed rgba(255,255,255,0.15)',
              textAlign: 'center',
              color: '#94a3b8',
            }}
          >
            <Sparkles className="w-8 h-8 mx-auto mb-2 text-indigo-400 opacity-80" />
            <strong style={{ display: 'block', color: '#e2e8f0', marginBottom: 4 }}>
              Nenhuma legenda gerada ainda
            </strong>
            <p style={{ fontSize: 13 }}>
              Preencha o produto, preço e link ao lado, escolha o tom (Animado, Direto ou Urgente) e clique em <strong>Gerar legenda com IA</strong>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
