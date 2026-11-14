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
const btn = { background: '#45d3c7', color: '#0d2a2d' };

/** Volta do checkout: o navegador NÃO libera nada — esta tela só consulta o servidor, que confere no Mercado Pago. */
export default function RetornoAssinaturaPage() {
  const [sub, setSub] = useState<Sub | null>(null);
  const [tries, setTries] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
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

  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: '#14232b', color: '#e6f0f3' }}>
      <section className="w-full max-w-md rounded-2xl p-7" style={{ background: '#1b2e37', border: '1px solid #2b4350' }} aria-live="polite">
        {sub?.environment === 'test' && <p className="text-xs mb-3" style={{ color: '#f2b84b' }}>Ambiente de teste: nenhuma cobrança real.</p>}
        {paid ? (
          <>
            <h1 className="text-2xl font-semibold">Pagamento confirmado</h1>
            <p className="mt-2" style={{ color: '#8ea6b0' }}>
              Plano <strong style={{ color: '#e6f0f3' }}>{sub?.planName}</strong> liberado. Seu acesso vai até {fmtDate(sub!.accessUntil!)} e
              renova sozinho todo mês.
            </p>
            <Link href="/painel" className="inline-block mt-6 rounded-lg px-4 py-2 font-semibold" style={btn}>Ir para o painel</Link>
          </>
        ) : rejected ? (
          <>
            <h1 className="text-2xl font-semibold">Pagamento recusado</h1>
            <p className="mt-2" style={{ color: '#8ea6b0' }}>O Mercado Pago recusou o pagamento, então o plano não foi liberado. Tente outro cartão.</p>
            <Link href="/planos" className="inline-block mt-6 rounded-lg px-4 py-2 font-semibold" style={btn}>Tentar de novo</Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">{waitingTooLong ? 'Pagamento em análise' : 'Confirmando seu pagamento…'}</h1>
            <p className="mt-2" style={{ color: '#8ea6b0' }}>
              {waitingTooLong
                ? 'O Mercado Pago ainda não confirmou o pagamento. Assim que confirmar, o plano é liberado sozinho. Você pode fechar esta página.'
                : 'Estamos conferindo com o Mercado Pago. Isso costuma levar alguns segundos.'}
            </p>
            <Link href="/assinatura" className="inline-block mt-6 underline" style={{ color: '#45d3c7' }}>Ver minha assinatura</Link>
          </>
        )}
      </section>
    </main>
  );
}
