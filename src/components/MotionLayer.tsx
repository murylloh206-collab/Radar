'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/** Blocos que entram em cena quando aparecem na tela. Nunca inclui modais (position: fixed). */
const REVEAL_SELECTOR = [
  '.rp-page > *',
  '.rp-split > * > *',
  '.rp-stack > *',
  '.rv5-columns > *',
  '.rv5-shortcuts > *',
  '.rv6-track > li',
  '.rv5-top li',
  '.rv5-groups li',
  '.rp-three > *',
  '.rp-grid > *',
  '.rv10-posts > *',
  '.rv9-pipe > button',
  '.rp-page div[style*="grid-template-columns"] > div',
].join(',');

/** Blocos que ganham o brilho dourado que segue o cursor. */
const GLOW_SELECTOR = '.rp-panel, .rv6-console, .rv5-stage, .rv5-shortcuts > *';

/**
 * Camada de movimento do painel: entrada em cascata dos blocos, brilho que segue o cursor,
 * barra de progresso na troca de tela e luz ambiente. Só apresentação; não toca em dados.
 * Com "reduzir movimento" ligado no sistema, nada disso é ativado.
 */
export function MotionLayer() {
  const pathname = usePathname();
  const barRef = useRef<HTMLDivElement>(null);

  // Barra de progresso: termina quando a tela nova chega.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || bar.dataset.state !== 'run') return;
    bar.dataset.state = 'done';
    const timer = window.setTimeout(() => { bar.dataset.state = 'idle'; }, 450);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Sem mexer em atributos do DOM (o React ainda pode estar hidratando): a entrada usa a Web Animations API.
    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver(entries => {
      let order = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        observer.unobserve(el);
        el.animate(
          [
            { opacity: 0, transform: 'translate3d(0, 34px, 0) scale(0.965)', filter: 'blur(10px)' },
            { opacity: 1, transform: 'none', filter: 'none' },
          ],
          { duration: 850, delay: Math.min(order++, 8) * 70, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' },
        );
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });

    const tag = () => {
      document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(el => {
        if (seen.has(el)) return;
        seen.add(el);
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const skip = style.position === 'fixed' || style.display === 'contents' || el.getAttribute('role') === 'dialog'
          || el.getAttribute('aria-modal') === 'true' || rect.width === 0 || rect.height === 0;
        if (!skip) observer.observe(el);
      });
    };

    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(tag); };
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });
    tag();

    // Brilho que segue o cursor.
    const onMove = (event: PointerEvent) => {
      const target = (event.target as HTMLElement | null)?.closest?.(GLOW_SELECTOR) as HTMLElement | null;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      target.style.setProperty('--my', `${event.clientY - rect.top}px`);
    };
    document.addEventListener('pointermove', onMove, { passive: true });

    // Barra de progresso: começa no clique em um link interno.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as HTMLElement | null)?.closest?.('a[href^="/"]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank') return;
      const url = new URL(link.href);
      if (url.pathname === window.location.pathname) return;
      if (barRef.current) barRef.current.dataset.state = 'run';
    };
    document.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      observer.disconnect();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <>
      <div className="rv7-aurora" aria-hidden="true"><i /><i /><i /><div className="rv8-bgradar"><span /><b /><b /><b /><b /></div></div>
      <div ref={barRef} className="rv7-progress" data-state="idle" aria-hidden="true" />
    </>
  );
}
