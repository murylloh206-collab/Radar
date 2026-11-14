'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Sub = {
  hasSubscription: boolean;
  planName: string | null;
  amount: number | null;
  status: string | null;
  lastPaymentStatus: string | null;
  paidUntil: string | null;
  accessUntil: string | null;
  nextPaymentDate: string | null;
  environment: 'test' | 'production';
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const muted = { color: '#8ea6b0' };

function situacao(s: Sub): { text: string; color: string } {
  const now = Date.now();
  if (s.status === 'cancelled') {
    return s.accessUntil && Date.parse(s.accessUntil) > now
      ? { text: `Cancelada. Seu acesso continua até ${fmtDate(s.accessUntil)}.`, color: '#f2b84b' }
      : { text: 'Cancelada.', color: '#8ea6b0' };
  }
  if (s.lastPaymentStatus === 'approved' && s.accessUntil && Date.parse(s.accessUntil) > now) {
    if (s.paidUntil && Date.parse(s.paidUntil) < now) return { text: `Pagamento em atraso. Seu acesso fica liberado até ${fmtDate(s.accessUntil)}.`, color: '#f2b84b' };
    return { text: 'Ativa e paga.', color: '#45d3c7' };
  }
  if (s.lastPaymentStatus === 'rejected') return { text: 'Último pagamento recusado. Atualize o cartão no Mercado Pago.', color: '#ef7b6b' };
  if (s.accessUntil && Date.parse(s.accessUntil) <= now) return { text: 'Vencida. Os envios automáticos estão pausados; seus dados continuam salvos.', color: '#ef7b6b' };
  return { text: 'Aguardando a confirmação do primeiro pagamento.', color: '#8ea6b0' };
}

export default function MinhaAssinaturaPage() {
  const [sub, setSub] = useState<Sub | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/billing/status?refresh=1', { cache: 'no-store' }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    if (data?.ok) setSub(data.subscription);
    else setMsg(data?.error || 'Não consegui consultar sua assinatura agora.');
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async () => {
    if (!window.confirm('Cancelar a assinatura? Você continua com acesso até o fim do período já pago.')) return;
    setBusy(true);
    const res = await fetch('/api/billing/cancel', { method: 'POST' }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (data?.ok) {
      setSub(data.subscription);
      setMsg('Assinatura cancelada.');
    } else setMsg(data?.error || 'Não consegui cancelar agora.');
  };

  const sit = sub?.hasSubscription ? situacao(sub) : null;

  return (
    <main className="min-h-screen p-6 flex justify-center" style={{ background: '#14232b', color: '#e6f0f3' }}>
      <section className="w-full max-w-lg rounded-2xl p-7 h-fit" style={{ background: '#1b2e37', border: '1px solid #2b4350' }}>
        <h1 className="text-2xl font-semibold">Minha assinatura</h1>
        {sub?.environment === 'test' && <p className="text-xs mt-1" style={{ color: '#f2b84b' }}>Ambiente de teste: nenhuma cobrança real.</p>}
        {!sub && !msg && <p className="mt-4" style={muted}>Consultando o Mercado Pago…</p>}
        {sub && !sub.hasSubscription && (
          <>
            <p className="mt-4" style={muted}>Você ainda não tem assinatura. Escolha um plano para liberar os envios automáticos.</p>
            <Link href="/planos" className="inline-block mt-5 rounded-lg px-4 py-2 font-semibold" style={{ background: '#45d3c7', color: '#0d2a2d' }}>Ver planos</Link>
          </>
        )}
        {sub?.hasSubscription && sit && (
          <dl className="mt-5 grid gap-3">
            <div>
              <dt className="text-xs" style={muted}>Plano</dt>
              <dd className="text-lg font-semibold">{sub.planName}, {brl(sub.amount || 0)}/mês</dd>
            </div>
            <div>
              <dt className="text-xs" style={muted}>Situação</dt>
              <dd style={{ color: sit.color }}>{sit.text}</dd>
            </div>
            <div>
              <dt className="text-xs" style={muted}>Próxima cobrança</dt>
              <dd>{sub.nextPaymentDate ? fmtDate(sub.nextPaymentDate) : 'O Mercado Pago ainda não informou.'}</dd>
            </div>
          </dl>
        )}
        {sub?.hasSubscription && sub.status !== 'cancelled' && (
          <div className="mt-6 flex flex-wrap gap-4 items-center">
            <button type="button" onClick={cancel} disabled={busy} className="rounded-lg px-4 py-2 text-sm" style={{ border: '1px solid #2b4350' }}>
              {busy ? 'Cancelando…' : 'Cancelar assinatura'}
            </button>
          </div>
        )}
        {sub?.hasSubscription && (
          <p className="text-xs mt-4" style={muted}>
            Troca de plano com valor proporcional ainda não existe. Para trocar, cancele e assine o novo plano.
          </p>
        )}
        {msg && <p className="mt-4 text-sm" role="status" style={{ color: '#f2b84b' }}>{msg}</p>}
      </section>
    </main>
  );
}
