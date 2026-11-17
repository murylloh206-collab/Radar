'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Logo } from './Logo';
import { Share2, RefreshCw } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { SystemReadiness } from '@/lib/types';

export function Header() {
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null);
  const [runningWorker, setRunningWorker] = useState<boolean>(false);
  const [lastCycleMessage, setLastCycleMessage] = useState<string | null>(null);

  const fetchStatus = () => {
    fetch('/api/copier/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.readiness) {
          setReadiness(data.readiness);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRunWorkerNow = async () => {
    setRunningWorker(true);
    setLastCycleMessage(null);
    try {
      const res = await fetch('/api/worker/trigger', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        const count = data.report?.processedCount ?? 0;
        setLastCycleMessage(`Worker executado: ${count} item(ns) processado(s).`);
        fetchStatus();
      } else {
        setLastCycleMessage(`Falha: ${data.error || 'Erro ao executar worker'}`);
      }
    } catch {
      setLastCycleMessage('Erro de conexão ao disparar worker.');
    } finally {
      setTimeout(() => {
        setRunningWorker(false);
      }, 800);
      setTimeout(() => {
        setLastCycleMessage(null);
      }, 5000);
    }
  };

  // Determinar rótulo e variante precisos baseados na verificação recente
  let badgeLabel = 'Verificando Conexão...';
  let badgeVariant: 'success' | 'warning' | 'danger' | 'info' = 'info';

  if (readiness) {
    if (readiness.whatsapp.state === 'connected_now') {
      badgeLabel = 'WhatsApp Verificado Agora';
      badgeVariant = 'success';
    } else if (readiness.whatsapp.state === 'last_known') {
      badgeLabel = readiness.whatsapp.label;
      badgeVariant = 'warning';
    } else if (readiness.whatsapp.state === 'timeout') {
      badgeLabel = 'Timeout na Verificação WhatsApp';
      badgeVariant = 'danger';
    } else if (readiness.whatsapp.state === 'connecting') {
      badgeLabel = 'Conectando ao WhatsApp...';
      badgeVariant = 'info';
    } else {
      badgeLabel = 'WhatsApp Desconectado';
      badgeVariant = 'danger';
    }
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[#0c0c0d]/90 backdrop-blur-md border-b border-[#2c2c2c]">
      {/* Mobile Logo */}
      <div className="flex items-center gap-3 md:hidden">
        <Link href="/painel">
          <Logo size="sm" />
        </Link>
      </div>

      {/* Desktop breadcrumb / indicator unificado */}
      <div className="hidden md:flex items-center gap-3">
        <span className="text-xs font-semibold text-[#a8a39a]">Painel de Controle</span>
        <span className="text-[#2c2c2c]">/</span>
        <div className="flex items-center gap-2">
          <Link href="/conexao-whatsapp" title="Clique para detalhes da conexão">
            <StatusBadge
              label={badgeLabel}
              variant={badgeVariant}
              size="sm"
            />
          </Link>
          {readiness && !readiness.webhook.isPublicHttps && (
            <span
              className="hidden lg:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30 font-medium"
              title={readiness.webhook.errorReason || 'Webhook em localhost: gateway na nuvem não alcança'}
            >
              Webhook Local
            </span>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {lastCycleMessage && (
          <span className="text-[11px] text-[#f5c542] bg-[#f5c542]/10 border border-[#f5c542]/20 px-2 py-1 rounded-lg hidden sm:inline">
            {lastCycleMessage}
          </span>
        )}

        <button
          onClick={handleRunWorkerNow}
          disabled={runningWorker}
          title="Executar ciclo do worker e verificar fila de envios agora"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors bg-[#161616] border-[#2c2c2c] text-[#a8a39a] hover:text-[#f5c542] hover:border-[#f5c542]/40 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${runningWorker ? 'animate-spin text-[#f5c542]' : ''}`} />
          <span className="hidden sm:inline">Verificar Fila</span>
        </button>

        <Link
          href="/gerar-postagem"
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#d9a520] to-[#f5c542] text-[#0c0c0d] hover:opacity-95 shadow-md shadow-[#f5c542]/15 transition-all"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Gerar Post</span>
        </Link>
      </div>
    </header>
  );
}
