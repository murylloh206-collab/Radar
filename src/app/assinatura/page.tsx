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
const muted = { color: '#a1a09d' };

function situacao(s: Sub): { text: string; color: string } {
  const now = Date.now();
  if (s.status === 'cancelled') {
    return s.accessUntil && Date.parse(s.accessUntil) > now
      ? { text: `Cancelada. Seu acesso continua até ${fmtDate(s.accessUntil)}.`, color: '#f2b84b' }
      : { text: 'Cancelada.', color: '#a1a09d' };
  }
  if (s.lastPaymentStatus === 'approved' && s.accessUntil && Date.parse(s.accessUntil) > now) {
    if (s.paidUntil && Date.parse(s.paidUntil) < now) return { text: `Pagamento em atraso. Seu acesso fica liberado até ${fmtDate(s.accessUntil)}.`, color: '#f2b84b' };
    return { text: 'Ativa e paga.', color: '#eeba2a' };
  }
  if (s.lastPaymentStatus === 'rejected') return { text: 'Último pagamento recusado. Atualize o cartão no Mercado Pago.', color: '#ef7b6b' };
  if (s.accessUntil && Date.parse(s.accessUntil) <= now) return { text: 'Vencida. Os envios automáticos estão pausados; seus dados continuam salvos.', color: '#ef7b6b' };
  return { text: 'Aguardando a confirmação do primeiro pagamento.', color: '#a1a09d' };
}

export default function MinhaAssinaturaPage() {
  const [sub, setSub] = useState<Sub | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const demo = process.env.NEXT_PUBLIC_PREVIA === '1' ? new URLSearchParams(window.location.search).get('demo') : null;
    if (demo) {
      // Estados de DEMONSTRAÇÃO (somente na prévia local): nada é consultado nem cobrado.
      const day = 86_400_000;
      const base: Sub = { hasSubscription: true, planName: 'Plus (demonstração)', amount: 59.9, status: 'authorized', lastPaymentStatus: 'approved',
        paidUntil: new Date(Date.now() + 20 * day).toISOString(), accessUntil: new Date(Date.now() + 22 * day).toISOString(),
        nextPaymentDate: new Date(Date.now() + 20 * day).toISOString(), environment: 'test' };
      const states: Record<string, Partial<Sub>> = {
        ativa: {},
        atraso: { paidUntil: new Date(Date.now() - day).toISOString(), accessUntil: new Date(Date.now() + day).toISOString() },
        recusada: { lastPaymentStatus: 'rejected' },
        cancelada: { status: 'cancelled' },
        vencida: { lastPaymentStatus: 'pending', accessUntil: new Date(Date.now() - 3 * day).toISOString() },
      };
      if (demo === 'carregando') return;
      setSub({ ...base, ...(states[demo] || {}) });
      return;
    }
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

  const tone = !sit ? 'muted' : sit.color === '#eeba2a' ? 'good' : sit.color === '#ef7b6b' ? 'bad' : sit.color === '#f2b84b' ? 'warn' : 'muted';

  return (
    <div className="rp-page rv4-narrow">
      <div className="rp-head">
        <div>
          <span className="rp-step">Conta</span>
          <h1>Minha assinatura</h1>
          <p>Plano, situação do pagamento e próxima cobrança, direto do Mercado Pago.</p>
        </div>
        <Link href="/planos" className="rp-btn">Ver planos</Link>
      </div>

      {sub?.environment === 'test' && (
        <div className="rv4-note" data-tone="warn">Ambiente de teste: nenhuma cobrança real.</div>
      )}

      {!sub && !msg && (
        <section className="rp-panel rv4-loading" aria-busy="true">
          <span className="rv4-radar" aria-hidden="true" />
          <div>
            <h2>Consultando o Mercado Pago…</h2>
            <p className="rp-sub">Isso leva só alguns segundos.</p>
          </div>
        </section>
      )}

      {sub && !sub.hasSubscription && (
        <section className="rp-panel rp-empty">
          <h2>Você ainda não tem assinatura</h2>
          <p>Escolha um plano para liberar os envios automáticos.</p>
          <Link href="/planos" className="rp-btn rp-primary">Ver planos</Link>
        </section>
      )}

      {sub?.hasSubscription && sit && (
        <section className="rp-panel rv4-sub">
          <div className="rv4-sub-top">
            <div>
              <small>Plano atual</small>
              <strong className="rv4-sub-plan">{sub.planName}</strong>
            </div>
            <div className="rv4-sub-price">
              <strong>{brl(sub.amount || 0)}</strong>
              <span>por mês</span>
            </div>
          </div>
          <div className="rv4-status" data-tone={tone} role="status">
            <span className="rv4-status-dot" aria-hidden="true" />
            {sit.text}
          </div>
          <dl className="rv4-sub-facts">
            <div>
              <dt>Próxima cobrança</dt>
              <dd>{sub.nextPaymentDate ? fmtDate(sub.nextPaymentDate) : 'O Mercado Pago ainda não informou.'}</dd>
            </div>
            {sub.accessUntil && (
              <div>
                <dt>Acesso liberado até</dt>
                <dd>{fmtDate(sub.accessUntil)}</dd>
              </div>
            )}
          </dl>
          {sub.status !== 'cancelled' && (
            <div className="rp-footer" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="rp-sub" style={{ margin: 0, maxWidth: 380 }}>
                Troca de plano com valor proporcional ainda não existe. Para trocar, cancele e assine o novo plano.
              </span>
              <button type="button" onClick={cancel} disabled={busy} className="rp-btn rp-quiet rv4-danger">
                {busy ? 'Cancelando…' : 'Cancelar assinatura'}
              </button>
            </div>
          )}
          {sub.status === 'cancelled' && (
            <p className="rp-sub">Troca de plano com valor proporcional ainda não existe. Para voltar, assine um novo plano.</p>
          )}
        </section>
      )}

      {msg && <div className="rv4-note" data-tone="warn" role="status">{msg}</div>}
    </div>
  );
}
