'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ExternalLink,
  Download,
  Check,
  Copy,
  AlertCircle,
  Laptop,
  Sparkles,
  Link2,
} from 'lucide-react';

interface MlStatusData {
  status: 'conectado' | 'desconectado';
  affiliateTag: string;
  appId: string;
  lastVerifiedAt: string;
  expiresAt: string;
  daysRemaining: number;
  hasCookies: boolean;
  isApiValid: boolean;
  canGenerateMeliLa: boolean;
}

export default function ConectarLojasPage() {
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<MlStatusData | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const showNotification = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(id);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const loadStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/integrations/mercadolivre/status', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok) {
        setStatusData(data);
      } else {
        showNotification(data.error || 'Não foi possível carregar o status.', 'error');
      }
    } catch {
      showNotification('Erro de rede ao consultar o status do Mercado Livre.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const isConnected = statusData?.status === 'conectado';
  const daysLeft = statusData?.daysRemaining ?? 30;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#F8FBFF] tracking-tight flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#FFE600]/15 border border-[#FFE600]/40 flex items-center justify-center font-black text-[#FFE600] text-xs">
              ML
            </span>
            <span>Conexão Mercado Livre</span>
          </h1>
          <p className="text-xs text-[#8EADC7] mt-1">
            Status da integração oficial, verificação de API e tempo de validade da sessão para links <code>meli.la</code>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadStatus}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-[#0D1B31] border border-[#18334D] hover:border-[#1CCAF2]/50 text-xs font-bold text-[#F8FBFF] flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#1CCAF2]' : 'text-[#8EADC7]'}`} />
            <span>Atualizar Status</span>
          </button>

          <button
            onClick={() => setShowExtensionModal(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] hover:opacity-95 text-xs font-bold text-[#061225] flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-[#1CCAF2]/10"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Extensão 1-Clique</span>
          </button>
        </div>
      </div>

      {/* Alerta de Feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between transition-all ${
            feedback.type === 'success'
              ? 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#86EFAC]'
              : feedback.type === 'error'
              ? 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#FCA5A5]'
              : 'bg-[#1CCAF2]/10 border-[#1CCAF2]/30 text-[#93C5FD]'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-current opacity-70 hover:opacity-100 ml-2">
            ✕
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* 1. PAINEL PRINCIPAL: STATUS + TEMPO RESTANTE + VALIDAÇÃO DE API */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Status da Conexão */}
        <div className="bg-[#0D1B31] border border-[#18334D] rounded-2xl p-5 space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#8EADC7]">
              Status de Conexão
            </span>
            <div
              className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                isConnected ? 'bg-[#4ADE80]' : 'bg-[#EF4444]'
              }`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-2xl font-black ${
                  isConnected ? 'text-[#4ADE80]' : 'text-[#EF4444]'
                }`}
              >
                {isConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            <p className="text-xs text-[#8EADC7] mt-1.5 leading-relaxed">
              {isConnected
                ? 'Sessão ativa e sincronizada com o Radar de Ofertas.'
                : 'Nenhuma sessão ativa. Use a extensão de 1 clique para conectar.'}
            </p>
          </div>

          <div className="pt-3 border-t border-[#18334D] flex items-center justify-between text-[11px] text-[#8EADC7]">
            <span>Última checagem:</span>
            <span className="text-[#F8FBFF] font-mono">
              {statusData?.lastVerifiedAt
                ? new Date(statusData.lastVerifiedAt).toLocaleString('pt-BR')
                : 'Agora'}
            </span>
          </div>
        </div>

        {/* Card 2: Tempo Conectado (Contagem Regressiva) */}
        <div className="bg-[#0D1B31] border border-[#18334D] rounded-2xl p-5 space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#8EADC7]">
              Validade da Conexão
            </span>
            <Clock className="w-4 h-4 text-[#1CCAF2]" />
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-[#1CCAF2] tracking-tight">
                {daysLeft}
              </span>
              <span className="text-sm font-bold text-[#F8FBFF]">
                dias restantes
              </span>
            </div>

            {/* Barra de Progresso Visual */}
            <div className="w-full bg-[#061225] h-2.5 rounded-full mt-3 overflow-hidden border border-[#18334D]">
              <div
                className="bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(5, (daysLeft / 30) * 100))}%` }}
              />
            </div>

            <p className="text-[11px] text-[#8EADC7] mt-2">
              Renovado automaticamente para <strong>30 dias</strong> a cada sincronização pela extensão.
            </p>
          </div>

          <div className="pt-3 border-t border-[#18334D] flex items-center justify-between text-[11px] text-[#8EADC7]">
            <span>Expira em:</span>
            <span className="text-[#F8FBFF] font-mono">
              {statusData?.expiresAt
                ? new Date(statusData.expiresAt).toLocaleDateString('pt-BR')
                : 'Em 30 dias'}
            </span>
          </div>
        </div>

        {/* Card 3: Verificação da API Oficial */}
        <div className="bg-[#0D1B31] border border-[#18334D] rounded-2xl p-5 space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#8EADC7]">
              Status da API Oficial
            </span>
            <ShieldCheck className="w-4 h-4 text-[#4ADE80]" />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-5 h-5 text-[#4ADE80]" />
              <span className="text-sm font-bold text-[#F8FBFF]">
                API Verificada & Ativa
              </span>
            </div>
            <p className="text-xs text-[#8EADC7] mt-1.5 leading-relaxed">
              Pronto para gerar links curtos <code>meli.la</code> e atribuir comissões na sua conta.
            </p>
          </div>

          <div className="pt-3 border-t border-[#18334D] space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#8EADC7]">Tag de Afiliado:</span>
              <span className="font-mono font-bold text-[#1CCAF2]">
                {statusData?.affiliateTag || 'michelhenrique1'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#8EADC7]">ID Ferramenta:</span>
              <span className="font-mono font-bold text-[#F8FBFF]">
                {statusData?.appId || '77625408'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 2. DETALHAMENTO DA INTEGRAÇÃO & COMO FUNCIONA O meli.la */}
      {/* =================================================================== */}
      <div className="bg-[#0D1B31] border border-[#18334D] rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-bold text-[#F8FBFF] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#1CCAF2]" />
            <span>Como o Radar gera os links meli.la automaticamente</span>
          </h2>
          <p className="text-xs text-[#8EADC7] mt-1">
            Diferente de links longos montados manualmente, o encurtador <code>meli.la</code> é o domínio oficial do Mercado Livre Afiliados.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-4 rounded-xl bg-[#061225] border border-[#18334D] space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-[#F8FBFF]">
              <span className="w-5 h-5 rounded-full bg-[#1CCAF2]/15 text-[#1CCAF2] flex items-center justify-center text-[10px]">
                1
              </span>
              <span>Captura da Oferta</span>
            </div>
            <p className="text-[#8EADC7] leading-relaxed">
              O robô recebe a mensagem do grupo de origem (ex: Gaby Garimpou) contendo qualquer link do Mercado Livre.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#061225] border border-[#18334D] space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-[#F8FBFF]">
              <span className="w-5 h-5 rounded-full bg-[#1CCAF2]/15 text-[#1CCAF2] flex items-center justify-center text-[10px]">
                2
              </span>
              <span>Chamada na API Oficial</span>
            </div>
            <p className="text-[#8EADC7] leading-relaxed">
              O servidor autentica com sua sessão e aciona o endpoint oficial de afiliados do Mercado Livre.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#061225] border border-[#18334D] space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-[#F8FBFF]">
              <span className="w-5 h-5 rounded-full bg-[#1CCAF2]/15 text-[#1CCAF2] flex items-center justify-center text-[10px]">
                3
              </span>
              <span>Disparo no WhatsApp</span>
            </div>
            <p className="text-[#8EADC7] leading-relaxed">
              O anúncio é publicado no seu grupo <strong>Radar de Ofertas #1</strong> com a imagem em alta resolução e o link <code>https://meli.la/xxxx</code>.
            </p>
          </div>
        </div>

        {/* Banner de Ação Rápida */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-[#0879DF]/15 to-[#1CCAF2]/15 border border-[#1CCAF2]/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1CCAF2]/20 flex items-center justify-center text-[#1CCAF2]">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#F8FBFF]">
                Precisa reconectar ou renovar os 30 dias?
              </p>
              <p className="text-[11px] text-[#8EADC7]">
                Basta abrir o ícone da extensão no Chrome e clicar no botão de 1 clique.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowExtensionModal(true)}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#1CCAF2] hover:bg-[#1CCAF2]/90 text-[#061225] font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Instruções da Extensão</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* MODAL COM INSTRUÇÕES DA EXTENSÃO DE 1 CLIQUE */}
      {/* =================================================================== */}
      {showExtensionModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowExtensionModal(false)}
        >
          <div
            className="bg-[#0D1B31] border border-[#18334D] rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-[#F8FBFF] flex items-center gap-2">
                  <Download className="w-5 h-5 text-[#1CCAF2]" />
                  <span>Conector Chrome 1-Clique (Manifest V3)</span>
                </h3>
                <p className="text-xs text-[#8EADC7] mt-1">
                  Localização da pasta no seu computador:
                </p>
                <code className="bg-[#061225] text-[#1CCAF2] px-2 py-1 rounded text-[11px] font-mono mt-1 block select-all">
                  C:\projetos\Projeto-afiliados\chrome-extension
                </code>
              </div>
              <button
                onClick={() => setShowExtensionModal(false)}
                className="text-[#8EADC7] hover:text-[#F8FBFF] p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <ol className="space-y-3 text-xs text-[#C1D5E8] list-decimal list-inside leading-relaxed bg-[#061225] p-4 rounded-xl border border-[#18334D]">
              <li>
                No Google Chrome, acesse: <br />
                <code className="bg-[#0D1B31] text-[#1CCAF2] px-2 py-0.5 rounded font-mono inline-block mt-0.5">
                  chrome://extensions/
                </code>
              </li>
              <li>
                Ative a chave <strong>"Modo do desenvolvedor"</strong> no canto superior direito.
              </li>
              <li>
                Se a extensão já estiver instalada, clique no <strong>ícone de recarregar 🔄</strong> nela. <br />
                <span className="text-[11px] text-[#8EADC7]">
                  (Se for a primeira vez, clique em "Carregar sem compactação" e aponte para a pasta acima).
                </span>
              </li>
              <li>
                Abra uma aba no <strong>Mercado Livre</strong> com seu login ativo e abra a extensão.
              </li>
              <li>
                Dê <strong>1 clique</strong> no botão <em>"Conectar Mercado Livre em 1 Clique"</em>. Pronto! Tudo é sincronizado automaticamente.
              </li>
            </ol>

            <button
              onClick={() => setShowExtensionModal(false)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-xs font-bold text-[#061225] hover:opacity-95 transition-all cursor-pointer"
            >
              Entendi, fechar instruções
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
