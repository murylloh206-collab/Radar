'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import ImageDropZone from '@/components/ImageDropZone';

/** "Template das fotos" do copiador (Ultimate): fundo quadrado com a foto do produto num cartão no centro. */
export default function CopierTemplateBlock() {
  const [state, setState] = useState<{ allowed: boolean; message: string | null; url: string | null } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/brand-assets', { cache: 'no-store' }).catch(() => null);
      const data = res ? await res.json().catch(() => null) : null;
      setState({ allowed: Boolean(data?.copierTemplateAllowed), message: data?.copierTemplateMessage || null, url: data?.copierBackgroundUrl || null });
    })();
  }, []);

  const box: React.CSSProperties = { marginTop: 14, padding: '14px 16px', background: '#0D1B31', border: '1px solid #18334D', borderRadius: 12, color: '#f1f5f9' };

  if (!state) {
    return <div style={box}><Loader2 className="w-4 h-4 animate-spin" /> Carregando template…</div>;
  }
  if (!state.allowed) {
    return (
      <div style={box}>
        <strong style={{ fontSize: 13 }}>Template das fotos</strong>{' '}
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(245,158,11,.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,.35)' }}>Ultimate</span>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0 0' }}>Use um fundo seu nas fotos das ofertas, com o produto num cartão no centro. {state.message}</p>
      </div>
    );
  }
  const remove = async () => {
    await fetch('/api/brand-assets?kind=copier_background', { method: 'DELETE' }).catch(() => null);
    setState({ ...state, url: null });
  };
  return (
    <div style={box}>
      <strong style={{ fontSize: 13 }}>Template das fotos</strong>
      <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 10px' }}>
        Envie um fundo quadrado (ideal 1080×1080) com a sua marca nas bordas e o centro livre: a foto do produto entra num cartão branco no meio.
        Vale para todas as ofertas automáticas desta conta. Sem fundo, as fotos saem como hoje.
      </p>
      <ImageDropZone kind="copier_background" label="Fundo das fotos do WhatsApp" hint="PNG, JPG ou WebP. Imagens grandes são reduzidas automaticamente."
        currentUrl={state.url} onUploaded={url => setState({ ...state, url })} />
      {state.url && (
        <button type="button" onClick={remove} className="csm-btn csm-btn-quiet" style={{ marginTop: 10, padding: '7px 12px', fontSize: 12 }}>
          Remover fundo e voltar à foto padrão
        </button>
      )}
    </div>
  );
}
