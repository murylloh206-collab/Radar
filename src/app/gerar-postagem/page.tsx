'use client';

import React, { useEffect, useState } from 'react';
import {
  Share2,
  Copy,
  Send,
  Calendar,
  Check,
  AlertCircle,
  ExternalLink,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { EngagementHook, MessageTemplate, StoreCoupon, WhatsAppGroup } from '@/lib/types';
import { buildWhatsAppMessage, DEFAULT_TEMPLATE } from '@/lib/message-builder';

export default function GerarPostagemPage() {
  const [url, setUrl] = useState('');
  const [converting, setConverting] = useState(false);
  const [convertedData, setConvertedData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Campos do formulário
  const [title, setTitle] = useState('');
  const [priceOriginal, setPriceOriginal] = useState<number | ''>('');
  const [priceCurrent, setPriceCurrent] = useState<number | ''>(99.9);
  const [coupon, setCoupon] = useState('');
  const [selectedHook, setSelectedHook] = useState('🔥 *MENOR PREÇO HISTÓRICO REGISTRADO!*');
  const [templateText, setTemplateText] = useState(DEFAULT_TEMPLATE);

  // Destinos e agendamento
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState('');
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/copier/sources')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.groups) {
          const dests = data.groups.filter((g: any) => g.isDestination || !g.isOrigin);
          setGroups(dests);
          if (dests.length > 0) {
            setSelectedGroups([dests[0].groupJid]);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleConvert = async () => {
    if (!url.trim()) return;
    setConverting(true);
    setError(null);
    setConvertedData(null);

    try {
      const res = await fetch('/api/converter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const json = await res.json();
      if (json.ok && json.data) {
        setConvertedData(json.data);
        if (!title) {
          setTitle(`Produto em Oferta Especial - ${json.data.store?.toUpperCase()}`);
        }
      } else {
        setError(json.error || 'Falha ao converter o link de afiliado.');
      }
    } catch (err: unknown) {
      setError(`Erro de rede ao converter: ${String(err)}`);
    } finally {
      setConverting(false);
    }
  };

  const currentPreviewMessage = buildWhatsAppMessage({
    templateText,
    title: title || 'Título do Produto em Oferta',
    originalPrice: priceOriginal ? Number(priceOriginal) : undefined,
    currentPrice: priceCurrent ? Number(priceCurrent) : 99.9,
    discountPct:
      priceOriginal && priceCurrent && Number(priceOriginal) > Number(priceCurrent)
        ? Math.round(((Number(priceOriginal) - Number(priceCurrent)) / Number(priceOriginal)) * 100)
        : undefined,
    affiliateUrl: convertedData?.affiliateUrl || url || 'https://radar.link/exemplo',
    couponCode: coupon || undefined,
    hookText: selectedHook,
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(currentPreviewMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async (immediate = false) => {
    if (!convertedData?.affiliateUrl && !url) {
      alert('Converta um link primeiro antes de enviar.');
      return;
    }
    if (selectedGroups.length === 0) {
      alert('Selecione pelo menos um grupo de destino.');
      return;
    }

    setSending(true);
    setSendSuccess(null);

    try {
      for (const destJid of selectedGroups) {
        const destGroup = groups.find((g) => g.groupJid === destJid);
        await fetch('/api/copier/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            jobData: {
              originType: 'manual',
              targetJid: destJid,
              targetName: destGroup?.name || destJid,
              messageText: currentPreviewMessage,
              affiliateUrl: convertedData?.affiliateUrl || url,
              scheduledFor: immediate
                ? new Date().toISOString()
                : scheduleDate || new Date().toISOString(),
            },
          }),
        });
      }

      if (immediate) {
        await fetch('/api/worker/trigger', { method: 'POST' }).catch(() => {});
        setSendSuccess('Postagem enviada com sucesso para os grupos selecionados!');
      } else {
        setSendSuccess('Postagem agendada com sucesso!');
      }
    } catch (err) {
      setError('Falha ao agendar ou enviar a postagem.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-[#f6f2e8] tracking-tight">
          Gerar Postagem por Link
        </h1>
        <p className="text-xs sm:text-sm text-[#a8a39a] mt-0.5">
          Insira um link cru ou de concorrente para convertê-lo no seu afiliado com gancho, cupom e prévia do WhatsApp.
        </p>
      </div>

      {/* Grid de 2 colunas: Formulário à esquerda, Prévia WhatsApp à direita */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Formulário */}
        <div className="lg:col-span-7 space-y-4">
          {/* Card de Conversão de Link */}
          <div className="rounded-2xl bg-[#161616] border border-[#2c2c2c] p-4 sm:p-5">
            <label className="text-xs font-bold text-[#f6f2e8] block mb-1.5">
              1. Cole o Link do Produto
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: https://shopee.com.br/product/... ou https://mercadolivre.com.br/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 bg-[#0c0c0d] border border-[#2c2c2c] rounded-xl px-3.5 py-2.5 text-xs text-[#f6f2e8] placeholder-[#a8a39a]/40 focus:outline-none focus:border-[#f5c542]"
              />
              <button
                onClick={handleConvert}
                disabled={converting || !url.trim()}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#f5c542] text-[#0c0c0d] hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5 shrink-0"
              >
                {converting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Converter</span>
              </button>
            </div>

            {error && (
              <div className="mt-3 p-2.5 rounded-xl bg-[#f07878]/10 border border-[#f07878]/30 flex items-center gap-2 text-xs text-[#f07878]">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {convertedData && (
              <div className="mt-3 p-2.5 rounded-xl bg-[#5fd0a0]/10 border border-[#5fd0a0]/30 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#5fd0a0]">
                    ✓ Link Convertido com Sucesso ({convertedData.store?.toUpperCase()})
                  </span>
                  <StatusBadge label="Afiliado Oficial" variant="success" size="sm" />
                </div>
                <p className="text-[11px] text-[#a8a39a] font-mono truncate">
                  {convertedData.affiliateUrl}
                </p>
              </div>
            )}
          </div>

          {/* Dados do Produto */}
          <div className="rounded-2xl bg-[#161616] border border-[#2c2c2c] p-4 sm:p-5 space-y-3.5">
            <h2 className="text-xs font-bold text-[#f6f2e8]">2. Detalhes da Mensagem</h2>

            <div>
              <label className="text-xs font-semibold text-[#a8a39a] block mb-1">
                Gancho de Engajamento
              </label>
              <select
                value={selectedHook}
                onChange={(e) => setSelectedHook(e.target.value)}
                className="w-full bg-[#0c0c0d] border border-[#2c2c2c] rounded-xl px-3.5 py-2 text-xs text-[#f6f2e8] focus:outline-none focus:border-[#f5c542]"
              >
                <option value="🔥 *MENOR PREÇO HISTÓRICO REGISTRADO!*">🔥 MENOR PREÇO HISTÓRICO REGISTRADO!</option>
                <option value="⚡ *CORRE ANTES QUE O ESTOQUE ACABE!*">⚡ CORRE ANTES QUE O ESTOQUE ACABE!</option>
                <option value="✨ *ACHADINHO IMPERDÍVEL COM AVALIAÇÃO MÁXIMA!*">✨ ACHADINHO COM AVALIAÇÃO MÁXIMA!</option>
                <option value="💥 *OFERTA RELÂMPAGO DO DIA!*">💥 OFERTA RELÂMPAGO DO DIA!</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#a8a39a] block mb-1">
                Título do Produto
              </label>
              <input
                type="text"
                placeholder="Ex: Fone de Ouvido Bluetooth Sem Fio com Cancelamento de Ruído"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[#0c0c0d] border border-[#2c2c2c] rounded-xl px-3.5 py-2 text-xs text-[#f6f2e8] focus:outline-none focus:border-[#f5c542]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#a8a39a] block mb-1">
                  Preço DE (R$) - Opcional
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="149.90"
                  value={priceOriginal}
                  onChange={(e) => setPriceOriginal(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-[#0c0c0d] border border-[#2c2c2c] rounded-xl px-3.5 py-2 text-xs text-[#f6f2e8] focus:outline-none focus:border-[#f5c542]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#a8a39a] block mb-1">
                  Preço POR (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="99.90"
                  value={priceCurrent}
                  onChange={(e) => setPriceCurrent(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-[#0c0c0d] border border-[#2c2c2c] rounded-xl px-3.5 py-2 text-xs text-[#f6f2e8] focus:outline-none focus:border-[#f5c542]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#a8a39a] block mb-1">
                Cupom de Desconto (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: RADAR10"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                className="w-full bg-[#0c0c0d] border border-[#2c2c2c] rounded-xl px-3.5 py-2 text-xs text-[#f6f2e8] uppercase focus:outline-none focus:border-[#f5c542]"
              />
            </div>
          </div>

          {/* Destinos */}
          <div className="rounded-2xl bg-[#161616] border border-[#2c2c2c] p-4 sm:p-5 space-y-3">
            <h2 className="text-xs font-bold text-[#f6f2e8]">3. Grupos Destino</h2>
            <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-[#0c0c0d] rounded-xl border border-[#2c2c2c]">
              {groups.map((grp) => (
                <label key={grp.groupJid} className="flex items-center gap-2 text-xs text-[#f6f2e8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(grp.groupJid)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedGroups([...selectedGroups, grp.groupJid]);
                      } else {
                        setSelectedGroups(selectedGroups.filter((j) => j !== grp.groupJid));
                      }
                    }}
                    className="rounded border-[#2c2c2c] text-[#f5c542] focus:ring-0"
                  />
                  <span>{grp.name}</span>
                </label>
              ))}
            </div>

            {/* Agendamento */}
            <div>
              <label className="text-xs font-semibold text-[#a8a39a] block mb-1">
                Programar Envio (Opcional)
              </label>
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full bg-[#0c0c0d] border border-[#2c2c2c] rounded-xl px-3.5 py-2 text-xs text-[#f6f2e8] focus:outline-none focus:border-[#f5c542]"
              />
            </div>
          </div>
        </div>

        {/* Prévia do WhatsApp */}
        <div className="lg:col-span-5 flex flex-col">
          <div className="sticky top-20 rounded-2xl bg-[#161616] border border-[#2c2c2c] p-4 sm:p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#f5c542]">
                Prévia ao Vivo no WhatsApp
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-[#0c0c0d] border border-[#2c2c2c] text-[#a8a39a] hover:text-[#f5c542]"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#5fd0a0]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
              </button>
            </div>

            {/* Balão estilizado de WhatsApp */}
            <div className="p-4 rounded-2xl bg-[#0c0c0d] border border-[#2c2c2c] font-sans text-xs text-[#f6f2e8] whitespace-pre-wrap leading-relaxed shadow-inner">
              {currentPreviewMessage}
            </div>

            {sendSuccess && (
              <p className="mt-3 text-xs font-medium text-[#5fd0a0] bg-[#5fd0a0]/10 p-2.5 rounded-xl border border-[#5fd0a0]/30">
                {sendSuccess}
              </p>
            )}

            {/* Ações de envio */}
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button
                onClick={() => handleSend(false)}
                disabled={sending}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-[#161616] border border-[#2c2c2c] text-[#a8a39a] hover:text-[#f6f2e8] hover:border-[#f5c542]/40 transition-all"
              >
                <Calendar className="w-4 h-4" />
                <span>Agendar</span>
              </button>

              <button
                onClick={() => handleSend(true)}
                disabled={sending}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#d9a520] to-[#f5c542] text-[#0c0c0d] shadow-lg shadow-[#f5c542]/20 hover:opacity-95 transition-all"
              >
                <Send className="w-4 h-4" />
                <span>Enviar Agora</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
