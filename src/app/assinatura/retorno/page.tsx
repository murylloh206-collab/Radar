'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Sub = {
  hasSubscription: boolean;
  planName: string | null;
  amount: number | null;
  status: string | null;
  lastPaymentStatus: string | null;
  accessUntil: string | null;
  environment: 'test' | 'production';
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

/** Volta do checkout: o navegador NÃO libera nada — esta tela só consulta o servidor, que confere no Mercado Pago. */
export default function RetornoAssinaturaPage() {
  const [sub, setSub] = useState<Sub | null>(null);
  const [tries, setTries] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    const demo = process.env.NEXT_PUBLIC_PREVIA === '1' ? new URLSearchParams(window.location.search).get('demo') : null;
    if (demo) {
      // Estados de DEMONSTRAÇÃO (somente na prévia local): nada é consultado nem cobrado.
      const base: Sub = { hasSubscription: true, planName: 'Plus (demonstração)', amount: 59.9, status: 'pending', lastPaymentStatus: null, accessUntil: null, environment: 'test' };
      if (demo === 'aprovado') setSub({ ...base, status: 'authorized', lastPaymentStatus: 'approved', accessUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() });
      else if (demo === 'recusado') setSub({ ...base, lastPaymentStatus: 'rejected' });
      else { setSub(base); if (demo === 'analise') setTries(20); }
      return;
    }
    const check = async (n: number) => {
      const res = await fetch('/api/billing/status?refresh=1', { cache: 'no-store' }).catch(() => null);
      const data = res ? await res.json().catch(() => null) : null;
      if (!alive) return;
      if (data?.ok) setSub(data.subscription);
      setTries(n);
      const paid = data?.subscription?.lastPaymentStatus === 'approved' && data?.subscription?.accessUntil;
      const failed = data?.subscription?.lastPaymentStatus === 'rejected';
      if (!paid && !failed && n < 20) timer.current = setTimeout(() => check(n + 1), 4000);
    };
    void check(1);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const paid = sub?.lastPaymentStatus === 'approved' && sub.accessUntil;
  const rejected = sub?.lastPaymentStatus === 'rejected';
  const waitingTooLong = !paid && !rejected && tries >= 20;

  const steps = ['Pagamento enviado', 'Conferindo com o Mercado Pago', 'Plano liberado'];

  return (
    <div className="rp-page rv4-narrow rv4-center">
      <section className="rp-panel rv4-checkout" aria-live="polite">
        {sub?.environment === 'test' && <div className="rv4-note" data-tone="warn">Ambiente de teste: nenhuma cobrança real.</div>}

        <ol className="rv4-steps" aria-label="Andamento do pagamento">
          {steps.map((label, index) => {
            const n = index + 1;
            const state = paid ? 'done' : n === 1 ? 'done' : n === 2 ? (rejected ? 'bad' : 'now') : 'next';
            return (
              <li key={label} data-state={state}>
                <span className="rv4-step-dot" aria-hidden="true">{state === 'done' ? '\u2713' : state === 'bad' ? '!' : n}</span>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>

        {paid ? (
          <div className="rv4-result">
            <svg className="rv4-result-icon" data-tone="good" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" /><path d="M23 37l9 9 17-19" /></svg>
            <h1>Pagamento confirmado</h1>
            <p>
              Plano <strong>{sub?.planName}</strong> liberado. Seu acesso vai até {fmtDate(sub!.accessUntil!)} e renova sozinho todo mês.
            </p>
            <Link href="/painel" className="rp-btn rp-primary">Ir para o painel</Link>
          </div>
        ) : rejected ? (
          <div className="rv4-result">
            <svg className="rv4-result-icon" data-tone="bad" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" /><path d="M26 26l20 20M46 26L26 46" /></svg>
            <h1>Pagamento recusado</h1>
            <p>O Mercado Pago recusou o pagamento, então o plano não foi liberado. Tente outro cartão.</p>
            <Link href="/planos" className="rp-btn rp-primary">Tentar de novo</Link>
          </div>
        ) : (
          <div className="rv4-result">
            {waitingTooLong
              ? <svg className="rv4-result-icon" data-tone="warn" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" /><path d="M36 22v16l10 6" /></svg>
              : <span className="rv4-radar" data-size="lg" aria-hidden="true" />}
            <h1>{waitingTooLong ? 'Pagamento em análise' : 'Confirmando seu pagamento…'}</h1>
            <p>
              {waitingTooLong
                ? 'O Mercado Pago ainda não confirmou o pagamento. Assim que confirmar, o plano é liberado sozinho. Você pode fechar esta página.'
                : 'Estamos conferindo com o Mercado Pago. Isso costuma levar alguns segundos.'}
            </p>
            <Link href="/assinatura" className="rp-btn">Ver minha assinatura</Link>
          </div>
        )}
        <p className="rv4-secure">O pagamento é feito na página do Mercado Pago.</p>
      </section>
    </div>
  );
}
