'use client';

import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';

/** Área para arrastar a imagem ou clicar e escolher no computador. Envia para /api/brand-assets. */
export default function ImageDropZone({
  kind,
  label,
  hint,
  currentUrl,
  aspect = '1 / 1',
  onUploaded,
}: {
  kind: 'logo' | 'story_background';
  label: string;
  hint: string;
  currentUrl?: string | null;
  aspect?: string;
  onUploaded: (url: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** A Vercel recusa envios acima de ~4,5 MB: imagens grandes são reduzidas no navegador antes (o servidor gera 1080×1920 de qualquer forma). */
  const shrink = async (file: File): Promise<Blob> => {
    if (file.size <= 3.5 * 1024 * 1024) return file;
    const bitmap = await createImageBitmap(file);
    const maxSide = kind === 'logo' ? 1024 : 2160;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = kind === 'logo' ? 'image/png' : 'image/jpeg';
    return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Não consegui preparar a imagem.'))), type, 0.9));
  };

  const send = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setError('Envie uma imagem PNG, JPG ou WebP.');
    if (file.size > 25 * 1024 * 1024) return setError('A imagem passa de 25 MB.');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('kind', kind);
      fd.set('file', await shrink(file), file.name);
      const res = await fetch('/api/brand-assets', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Não consegui enviar a imagem.');
      onUploaded(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui enviar a imagem.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <span style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>{label}</span>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); void send(e.dataTransfer.files?.[0]); }}
        aria-label={`${label}: arraste a imagem ou clique para escolher`}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: 14,
          borderRadius: 14,
          cursor: busy ? 'progress' : 'pointer',
          textAlign: 'left',
          color: 'inherit',
          background: over ? 'rgba(69,211,199,0.12)' : 'rgba(255,255,255,0.03)',
          border: `1.5px dashed ${over ? '#45d3c7' : 'rgba(255,255,255,0.22)'}`,
          transition: 'background .15s, border-color .15s',
        }}
      >
        <span style={{ width: 72, aspectRatio: aspect, borderRadius: 10, overflow: 'hidden', flex: 'none', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : currentUrl ? <img src={currentUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImagePlus className="w-6 h-6" style={{ opacity: 0.6 }} />}
        </span>
        <span>
          <strong style={{ display: 'block', fontSize: 14 }}>{busy ? 'Enviando…' : over ? 'Solte aqui' : 'Arraste a imagem aqui ou clique para escolher'}</strong>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{hint}</span>
        </span>
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { void send(e.target.files?.[0]); e.target.value = ''; }} />
      {error && <p role="alert" style={{ color: '#ef7b6b', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}
