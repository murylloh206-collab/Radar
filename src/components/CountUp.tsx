'use client';

import { useEffect, useRef, useState } from 'react';

/** Número que sobe até o valor real. Com "reduzir movimento", mostra o valor direto. */
export function CountUp({ value, suffix = '', duration = 1100 }: { value: number; suffix?: string; duration?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = Math.round(origin + (value - origin) * eased);
      from.current = current;
      setShown(current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span aria-label={`${value.toLocaleString('pt-BR')}${suffix}`}>{shown.toLocaleString('pt-BR')}{suffix}</span>;
}
