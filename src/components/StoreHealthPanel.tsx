'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { storeStatusLabel, type StoreStatusViewLike } from '@/lib/store-status-labels';

const NAMES: Record<string, string> = {
  mercadolivre: 'Mercado Livre',
  shopee: 'Shopee',
  netshoes: 'Netshoes (Rakuten)',
  amazon: 'Amazon',
};

/** Status real de cada loja (testado de verdade) + vínculo da extensão. */
export default function StoreHealthPanel({ onChange }: { onChange?: (stores: StoreStatusViewLike[]) => void }) {
  const [stores, setStores] = useState<StoreStatusViewLike[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [pair, setPair] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((list: StoreStatusViewLike[]) => {
    setStores(list);
    onChange?.(list);
  }, [onChange]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/store-health', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.ok) apply(data.stores);
      else setError(data.error || 'Não foi possível carregar o status das lojas.');
    } catch {
      setError('Não foi possível carregar o status das lojas.');
    }
  }, [apply]);

  useEffect(() => { void load(); }, [load]);

  const testNow = async (store: string) => {
    setTesting(store);
    setError(null);
    try {
      const res = await fetch('/api/store-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store }),
      });
      const data = await res.json();
      if (res.ok && data.ok) apply(data.stores);
      else setError(data.error || 'Não foi possível testar agora.');
    } catch {
      setError('Não foi possível testar agora.');
    } finally {
      setTesting(null);
    }
  };

  const createCode = async () => {
    setError(null);
    try {
      const res = await fetch('/api/integrations/extension/pair-code', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.ok) setPair({ code: data.code, expiresAt: data.expiresAt });
      else setError(data.error || 'Não foi possível gerar o código.');
    } catch {
      setError('Não foi possível gerar o código.');
    }
  };

  return (
    <section className="cc-onboard" aria-label="Status real das lojas" style={{ marginBottom: 16 }}>
      <div className="cc-onboard-top" style={{ alignItems: 'flex-start' }}>
        <div>
          <span className="cc-kicker">STATUS REAL</span>
          <h2>Suas lojas, testadas de verdade.</h2>
          <p className="cc-sub">O painel gera um link de teste ao conectar e todo dia às 08:00. Se uma loja falhar, as ofertas dela param até você reconectar.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <button type="button" className="cc-button" onClick={createCode}>Conectar extensão</button>
          {pair && (
            <p className="cc-sub" style={{ marginTop: 8 }}>
              Código: <strong style={{ fontSize: 18, letterSpacing: '0.12em' }}>{pair.code}</strong>
              <br />Cole na extensão até {new Date(pair.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
            </p>
          )}
        </div>
      </div>
      {error && <p className="cc-sub" role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
        {stores.map(v => {
          const l = storeStatusLabel(v);
          return (
            <div key={v.store} style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 12 }}>
              <strong>{NAMES[v.store] || v.store}</strong>
              <p style={{ margin: '6px 0 2px' }}>{l.emoji} {l.title}{v.hint ? ` · ${v.hint}` : ''}</p>
              <p className="cc-sub" style={{ margin: 0 }}>{l.detail}</p>
              {v.status !== 'nao_configurado' && (
                <button type="button" className="cc-button" style={{ marginTop: 8 }} disabled={testing === v.store} onClick={() => testNow(v.store)}>
                  {testing === v.store ? 'Testando…' : 'Testar agora'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
