'use client';

import { useEffect } from 'react';

/** Conta a visita e os toques nos botões do grupo e do bot (sem cookies; o envio não atrasa a ida para o WhatsApp). */
export default function GroupTracker() {
  useEffect(() => {
    const utm = new URLSearchParams(window.location.search).get('utm_source');
    const send = (kind: 'visita' | 'clique' | 'clique_bot') => {
      const body = JSON.stringify({ kind, ref: document.referrer || null, utm });
      if (navigator.sendBeacon?.('/grupo/evento', new Blob([body], { type: 'text/plain' }))) return;
      void fetch('/grupo/evento', { method: 'POST', body, keepalive: true }).catch(() => {});
    };
    send('visita');
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('a[href="/grupo/entrar"]')) send('clique');
      else if (target?.closest?.('a[href="/grupo/bot"]')) send('clique_bot');
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  return null;
}
