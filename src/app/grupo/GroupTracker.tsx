'use client';

import { useEffect } from 'react';

/** Conta a visita e o toque em "Entrar no grupo" (sem cookies; o envio não atrasa a ida para o WhatsApp). */
export default function GroupTracker() {
  useEffect(() => {
    const utm = new URLSearchParams(window.location.search).get('utm_source');
    const send = (kind: 'visita' | 'clique') => {
      const body = JSON.stringify({ kind, ref: document.referrer || null, utm });
      if (navigator.sendBeacon?.('/grupo/evento', new Blob([body], { type: 'text/plain' }))) return;
      void fetch('/grupo/evento', { method: 'POST', body, keepalive: true }).catch(() => {});
    };
    send('visita');
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest?.('a[href="/grupo/entrar"]');
      if (link) send('clique');
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  return null;
}
