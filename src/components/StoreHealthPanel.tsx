'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { storeStatusLabel, type StoreStatusViewLike } from '@/lib/store-status-labels';
import s from './StoreHealthPanel.module.css';

const PAGES = {
  mercadolivre: 'https://www.mercadolivre.com.br/afiliados',
  shopee: 'https://affiliate.shopee.com.br/open_api',
  amazon: 'https://associados.amazon.com.br/home',
  rakutenDev: 'https://developers.rakutenadvertising.com/default/dashboard/',
  rakutenPublisher: 'https://publisher.rakutenadvertising.com/',
};

const STORES: { key: string; name: string; page?: string; pageText?: string }[] = [
  { key: 'mercadolivre', name: 'Mercado Livre', page: PAGES.mercadolivre, pageText: 'Abrir Mercado Livre ↗' },
  { key: 'shopee', name: 'Shopee', page: PAGES.shopee, pageText: 'Abrir página da API ↗' },
  { key: 'amazon', name: 'Amazon', page: PAGES.amazon, pageText: 'Abrir Associados ↗' },
  { key: 'netshoes', name: 'Netshoes' },
];

function tone(v?: StoreStatusViewLike): string {
  if (!v) return '';
  const l = storeStatusLabel(v);
  if (l.emoji === '✅' || (v.store === 'amazon' && v.status === 'sem_teste')) return s.ok;
  if (l.emoji === '❌') return s.fail;
  if (l.emoji === '⚠️' || l.emoji === '🟡') return s.warn;
  return '';
}

function netshoesSteps(v?: StoreStatusViewLike) {
  if (!v || v.status === 'nao_configurado') return { dev: false, publisher: false };
  if (v.status === 'ok') return { dev: true, publisher: true };
  const r = v.reason || '';
  return { dev: !/desenvolvedor/i.test(r), publisher: !/publisher/i.test(r) };
}

/** Status real de cada loja (testado de verdade), com o link direto da página de cada uma. */
export default function StoreHealthPanel({ onChange }: { onChange?: (stores: StoreStatusViewLike[]) => void }) {
  const [stores, setStores] = useState<StoreStatusViewLike[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [pair, setPair] = useState<{ code: string; expiresAt: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const apply = useCallback((list: StoreStatusViewLike[]) => {
    setStores(list);
    onChange?.(list);
  }, [onChange]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/store-health', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.ok) apply(data.stores);
      else setMessage(data.error || 'Não consegui carregar o status das lojas.');
    } catch {
      setMessage('Não consegui carregar o status das lojas.');
    }
  }, [apply]);

  useEffect(() => { void load(); }, [load]);

  const testNow = async (store: string) => {
    setTesting(store);
    setMessage(null);
    try {
      const res = await fetch('/api/store-health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store }) });
      const data = await res.json();
      if (res.ok && data.ok) apply(data.stores);
      else setMessage(data.error || 'Não consegui testar agora.');
    } catch {
      setMessage('Não consegui testar agora.');
    } finally {
      setTesting(null);
    }
  };

  const createCode = async () => {
    setMessage(null);
    const res = await fetch('/api/integrations/extension/pair-code', { cache: 'no-store' }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && data.ok) setPair({ code: data.code, expiresAt: data.expiresAt });
    else setMessage(data.error || 'Não consegui gerar o código.');
  };

  const revokeAll = async () => {
    if (!window.confirm('Desvincular todas as extensões desta conta?')) return;
    const res = await fetch('/api/integrations/extension/revoke', { method: 'POST' }).catch(() => null);
    setPair(null);
    setMessage(res?.ok ? 'Extensões desvinculadas. Abra a extensão com o painel logado para vincular de novo.' : 'Não consegui desvincular agora.');
  };

  const byKey = Object.fromEntries(stores.map(v => [v.store, v]));

  return (
    <section className={s.panel} aria-labelledby="store-health-title">
      <div className={s.top}>
        <div>
          <h2 id="store-health-title" className={s.title}>Suas lojas</h2>
          <p className={s.lead}>
            Abra a página da loja já logado, clique na extensão e em <strong>Conectar agora</strong>. O painel testa na hora e
            de novo todo dia às 08:00. Se uma loja falhar, as ofertas dela param até você reconectar.
          </p>
        </div>
        <div className={s.extension}>
          <a href="/downloads/radar-conector.zip" download>Baixar a extensão</a>
          <span className={s.detail}>Com este painel aberto, ela se vincula sozinha.</span>
          <details>
            <summary>Usar código</summary>
            {pair ? (
              <p>
                <span className={s.code}>{pair.code}</span>
                <br />
                Vale até {new Date(pair.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
              </p>
            ) : (
              <button type="button" className={`${s.btn} ${s.quiet}`} onClick={createCode}>Gerar código</button>
            )}
            <button type="button" className={`${s.btn} ${s.quiet}`} onClick={revokeAll}>Desvincular extensões</button>
          </details>
        </div>
      </div>

      <ul className={s.list}>
        {STORES.map(store => {
          const v = byKey[store.key];
          const l = v ? storeStatusLabel(v) : { title: 'Carregando…', detail: '' };
          const steps = store.key === 'netshoes' ? netshoesSteps(v) : null;
          return (
            <li key={store.key} className={s.row}>
              <span className={s.name}>{store.name}</span>
              <span className={`${s.status} ${tone(v)}`}>
                {l.title}
                {v?.hint ? `, ${v.hint}` : ''}
                <span className={s.detail}>{l.detail}</span>
              </span>
              <span className={s.actions}>
                {store.page && (
                  <a href={store.page} target="_blank" rel="noopener noreferrer">
                    {v?.status === 'ok' ? 'Reconectar ↗' : store.pageText}
                  </a>
                )}
                {v && v.status !== 'nao_configurado' && (
                  <button type="button" className={s.btn} disabled={testing === store.key} onClick={() => testNow(store.key)}>
                    {testing === store.key ? 'Testando…' : 'Testar agora'}
                  </button>
                )}
              </span>
              {steps && (
                <ol className={s.steps}>
                  <li className={steps.dev ? s.done : ''}>
                    <span>{steps.dev ? '✓' : '○'} 1. Client ID e Secret</span>
                    <a href={PAGES.rakutenDev} target="_blank" rel="noopener noreferrer">Rakuten Developers ↗</a>
                  </li>
                  <li className={steps.publisher ? s.done : ''}>
                    <span>{steps.publisher ? '✓' : '○'} 2. SID</span>
                    <a href={PAGES.rakutenPublisher} target="_blank" rel="noopener noreferrer">Painel do publisher ↗</a>
                  </li>
                </ol>
              )}
            </li>
          );
        })}
      </ul>

      {message && <p className={s.message} role="status">{message}</p>}
    </section>
  );
}
