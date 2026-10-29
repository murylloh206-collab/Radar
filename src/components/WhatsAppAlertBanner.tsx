'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, WifiOff, ArrowRight } from 'lucide-react';

export function WhatsAppAlertBanner() {
  const pathname = usePathname();
  const [status, setStatus] = useState<string>('loading');

  useEffect(() => {
    // Não exibir dentro da própria página de conexão
    if (pathname === '/conexao-whatsapp') return;

    const checkStatus = () => {
      fetch('/api/whatsapp/connect')
        .then((r) => r.json())
        .then((data) => {
          if (data.ok && data.whatsapp) {
            setStatus(data.whatsapp.status);
          }
        })
        .catch(() => setStatus('disconnected'));
    };

    checkStatus();
    const interval = setInterval(checkStatus, 15000); // Checa a cada 15s
    return () => clearInterval(interval);
  }, [pathname]);

  if (pathname === '/conexao-whatsapp' || status === 'connected' || status === 'loading') {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-[#F87171]/20 via-[#F7B84B]/20 to-[#0D1B31] border-b border-[#F87171]/40 px-4 py-2.5 text-xs text-[#F8FBFF] flex flex-wrap items-center justify-between gap-3 shadow-md animate-fade-in">
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-lg bg-[#F87171]/20 text-[#F87171] flex items-center justify-center flex-shrink-0 animate-pulse">
          <WifiOff className="w-3.5 h-3.5" />
        </div>
        <p className="font-semibold text-xs text-[#F8FBFF]">
          <span className="text-[#F87171] font-bold">WhatsApp Desconectado:</span>{' '}
          Os envios automáticos estão pausados para proteger seus canais. Pareie o aparelho para retomar.
        </p>
      </div>

      <Link
        href="/conexao-whatsapp"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] text-xs font-bold shadow-sm hover:opacity-95 transition-all flex-shrink-0"
      >
        <span>Conectar Agora</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
