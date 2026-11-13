'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, Clock, Image as ImageIcon, Loader2, MessageCircle, Palette, Send, Settings2, X, Zap } from 'lucide-react';
import { PlanGateCard } from '@/components/PlanGateCard';

type Channel = 'instagram_story' | 'instagram_feed' | 'whatsapp_status';

interface Offer {
  jobId: string;
  title: string;
  imageUrl: string | null;
  priceCurrent: number;
  priceOriginal: number | null;
  discountPct: number | null;
  coupon: string | null;
  sentAt: string;
}
interface Quota { limit: number | null; usedToday: number; allowed: boolean; reason?: string }
interface Autopost { enabled: boolean; channels: Channel[]; minIntervalMinutes: number; windowStart: string; windowEnd: string; minDiscountPct: number; connectionId: string | null }
interface Identity { panelName: string; watermarkHandle: string; panelLogoUrl: string | null; accentColor: string; artBackground: 'dark' | 'light' }

const CHANNELS: Array<{ id: Channel; label: string; short: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'instagram_story', label: 'Story do Instagram', short: 'Story', icon: Camera },
  { id: 'instagram_feed', label: 'Feed do Instagram', short: 'Feed', icon: ImageIcon },
  { id: 'whatsapp_status', label: 'Status do WhatsApp', short: 'Status', icon: MessageCircle },
];

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function timeAgo(iso: string) {
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `há ${hours} h` : `há ${Math.round(hours / 24)} d`;
}

export default function InstagramProPage() {
  const [tab, setTab] = useState<'ofertas' | 'identidade' | 'automatico'>('ofertas');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [autopost, setAutopost] = useState<Autopost | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'erro'; text: string } | null>(null);
  const [dialog, setDialog] = useState<{ offer: Offer; channel: Channel } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [offersRes, settingsRes] = await Promise.all([fetch('/api/social/offers', { cache: 'no-store' }), fetch('/api/social/settings', { cache: 'no-store' })]);
      const offersData = await offersRes.json();
      const settingsData = await settingsRes.json();
      if (!offersRes.ok) throw new Error(offersData.error || 'Não foi possível carregar as ofertas.');
      setOffers(offersData.offers || []);
      setQuota(offersData.quota || null);
      if (settingsRes.ok) { setAutopost(settingsData.settings); setIdentity(settingsData.identity); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  const openDialog = async (offer: Offer, channel: Channel) => {
    setDialog({ offer, channel });
    setPreview(null);
    try {
      const res = await fetch('/api/social/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: offer.jobId, format: channel === 'instagram_feed' ? 'feed' : 'story' }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreview(data.image);
    } catch (e) {
      setDialog(null);
      setToast({ type: 'erro', text: e instanceof Error ? e.message : 'Não foi possível gerar a prévia.' });
    }
  };

  const publish = async () => {
    if (!dialog) return;
    setBusy(true);
    try {
      const res = await fetch('/api/social/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: dialog.offer.jobId, channel: dialog.channel }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível publicar.');
      const label = CHANNELS.find(c => c.id === dialog.channel)?.label;
      setToast({ type: 'ok', text: data.post?.status === 'incerto'
        ? `Enviado para ${label}, mas sem confirmação. Confira no aplicativo antes de repetir.`
        : `Oferta #${data.offer.offerNumber} publicada no ${label}!` });
      setDialog(null);
      await load();
    } catch (e) {
      setToast({ type: 'erro', text: e instanceof Error ? e.message : 'Não foi possível publicar.' });
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (payload: { autopost?: Autopost; identity?: Identity }) => {
    setBusy(true);
    try {
      const res = await fetch('/api/social/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível salvar.');
      setAutopost(data.settings);
      setIdentity(data.identity);
      setToast({ type: 'ok', text: 'Configurações salvas.' });
    } catch (e) {
      setToast({ type: 'erro', text: e instanceof Error ? e.message : 'Não foi possível salvar.' });
    } finally {
      setBusy(false);
    }
  };

  const quotaLabel = useMemo(() => {
    if (!quota) return '';
    if (quota.limit === null) return `${quota.usedToday} publicações hoje · ilimitado`;
    return `${quota.usedToday} de ${quota.limit} publicações hoje`;
  }, [quota]);

  const locked = quota?.limit === 0;

  return (
    <section className="rp-page" aria-label="Instagram Pro">
      <div className="rp-head" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="rp-step">Instagram Pro</span>
          <h1>Posts com a sua marca</h1>
          <p>Escolha uma oferta que o copiador já enviou e publique no story, no feed ou no status do WhatsApp. Cada post sai numerado (ex.: “Oferta #128 · link na bio”) e a oferta aparece na sua página da bio com o link certo.</p>
        </div>
        {quota && !locked && <span className={`rp-tag ${quota.allowed ? 'rp-good' : 'rp-warn'}`}>{quotaLabel}</span>}
      </div>

      {locked ? (
        <PlanGateCard feature="instagram_pro" title="Instagram Pro" description="Artes profissionais com a sua marca para story, feed e status do WhatsApp, link pela bio e postagem automática com freio. Disponível a partir do plano Plus." />
      ) : (
        <>
          <div className="rp-tabs" role="tablist">
            {([['ofertas', 'Ofertas'], ['identidade', 'Identidade visual'], ['automatico', 'Automático']] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {loading && <div className="rp-panel" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>}
          {error && <div className="rp-panel rp-warn" role="alert">{error}</div>}

          {!loading && !error && tab === 'ofertas' && (
            offers.length === 0 ? (
              <div className="rp-panel rp-empty">
                <h2>Nenhuma oferta nas últimas 48 horas</h2>
                <p>Assim que o copiador enviar ofertas para os seus grupos, elas aparecem aqui prontas para postar.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
                {offers.map(offer => (
                  <article key={offer.jobId} className="rp-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: 0 }}>
                    <div style={{ height: 150, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                      {offer.imageUrl ? <img src={offer.imageUrl} alt="" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} /> : <ImageIcon className="w-8 h-8 text-slate-400" />}
                      {offer.discountPct ? <span className="rp-tag rp-good" style={{ position: 'absolute', top: 8, left: 8 }}>−{offer.discountPct}%</span> : null}
                    </div>
                    <h3 style={{ fontSize: 14, lineHeight: 1.3, margin: 0 }}>{offer.title}</h3>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      {offer.priceOriginal ? <span style={{ fontSize: 12, opacity: 0.6, textDecoration: 'line-through' }}>R$ {brl(offer.priceOriginal)}</span> : null}
                      <strong style={{ fontSize: 18 }}>R$ {brl(offer.priceCurrent)}</strong>
                      {offer.coupon ? <span className="rp-tag">cupom {offer.coupon}</span> : null}
                    </div>
                    <small style={{ opacity: 0.6, display: 'flex', alignItems: 'center', gap: 4 }}><Clock className="w-3 h-3" /> enviada nos grupos {timeAgo(offer.sentAt)}</small>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 'auto' }}>
                      {CHANNELS.map(c => (
                        <button key={c.id} type="button" className="rp-btn" disabled={!quota?.allowed || !offer.imageUrl}
                          title={!offer.imageUrl ? 'Oferta sem foto do produto' : quota?.allowed ? `Postar no ${c.label}` : quota?.reason}
                          onClick={() => openDialog(offer, c.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 4px' }}>
                          <c.icon className="w-3.5 h-3.5" /> {c.short}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )
          )}

          {!loading && !error && tab === 'identidade' && identity && (
            <IdentityForm identity={identity} busy={busy} onSave={next => saveSettings({ identity: next })} />
          )}

          {!loading && !error && tab === 'automatico' && autopost && (
            <AutopostForm settings={autopost} busy={busy} onSave={next => saveSettings({ autopost: next })} />
          )}

          <div className="rp-panel" style={{ fontSize: 12, opacity: 0.85 }}>
            <strong>Importante:</strong> o Instagram não permite publicar link clicável em stories por automação — por isso os posts indicam “link na bio” com o número da oferta.
            O status do WhatsApp aparece para os seus <em>contatos</em> (não para os grupos) e leva o link direto. A conexão de WhatsApp não é oficial: postar com frequência aumenta o risco de restrição do número, e nenhum controle elimina esse risco.
          </div>
        </>
      )}

      {dialog && (
        <div role="dialog" aria-modal="true" aria-label="Prévia da publicação" className="rp-dialog"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="rp-panel" style={{ maxWidth: 420, width: '100%', maxHeight: '92vh', overflow: 'auto', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>{CHANNELS.find(c => c.id === dialog.channel)?.label}</h2>
              <button type="button" className="rp-btn" onClick={() => setDialog(null)} aria-label="Fechar"><X className="w-4 h-4" /></button>
            </div>
            <div style={{ borderRadius: 12, overflow: 'hidden', background: '#0b0f1a', minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {preview ? <img src={preview} alt="Prévia da arte" style={{ width: '100%' }} /> : <Loader2 className="w-6 h-6 animate-spin" />}
            </div>
            <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>O número da oferta é definido na hora de publicar.</p>
            <button type="button" className="rp-btn rp-primary" style={{ width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              disabled={!preview || busy} onClick={publish}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Publicar agora
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="rp-toast" role="status" style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', gap: 8, alignItems: 'center' }}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-rose-400" />} {toast.text}
        </div>
      )}
    </section>
  );
}

function IdentityForm({ identity, busy, onSave }: { identity: Identity; busy: boolean; onSave: (next: Identity) => void }) {
  const [form, setForm] = useState<Identity>(identity);
  return (
    <div className="rp-panel">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Palette className="w-4 h-4" /> Identidade das artes</h2>
      <p style={{ fontSize: 13, opacity: 0.75 }}>Escolha uma cor e o fundo; o sistema monta o restante da paleta e garante que o texto fique legível.</p>
      <div className="rp-grid">
        <label className="rp-field">Nome da loja
          <input value={form.panelName} maxLength={50} onChange={e => setForm({ ...form, panelName: e.target.value })} />
        </label>
        <label className="rp-field">@ do Instagram
          <input value={form.watermarkHandle} maxLength={40} onChange={e => setForm({ ...form, watermarkHandle: e.target.value })} />
        </label>
        <label className="rp-field">Link do logo (https://… opcional)
          <input value={form.panelLogoUrl || ''} placeholder="Sem logo, usamos a inicial da loja" onChange={e => setForm({ ...form, panelLogoUrl: e.target.value || null })} />
        </label>
        <label className="rp-field">Cor da marca
          <input type="color" value={form.accentColor} onChange={e => setForm({ ...form, accentColor: e.target.value })} style={{ height: 44 }} />
        </label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: '12px 0', display: 'flex', gap: 10 }}>
        <legend style={{ fontSize: 13, marginBottom: 6 }}>Fundo das artes</legend>
        {(['dark', 'light'] as const).map(bg => (
          <label key={bg} className="rp-btn" style={{ display: 'flex', alignItems: 'center', gap: 6, outline: form.artBackground === bg ? '2px solid currentColor' : undefined }}>
            <input type="radio" name="bg" checked={form.artBackground === bg} onChange={() => setForm({ ...form, artBackground: bg })} />
            {bg === 'dark' ? 'Escuro' : 'Claro'}
          </label>
        ))}
      </fieldset>
      <button type="button" className="rp-btn rp-primary" disabled={busy} onClick={() => onSave(form)}>Salvar identidade</button>
      <p style={{ fontSize: 12, opacity: 0.65, marginTop: 8 }}>Dica: abra a prévia de qualquer oferta na aba “Ofertas” para ver o resultado.</p>
    </div>
  );
}

function AutopostForm({ settings, busy, onSave }: { settings: Autopost; busy: boolean; onSave: (next: Autopost) => void }) {
  const [form, setForm] = useState<Autopost>(settings);
  const toggleChannel = (id: Channel) => setForm(f => ({ ...f, channels: f.channels.includes(id) ? f.channels.filter(c => c !== id) : [...f.channels, id] }));
  return (
    <div className="rp-panel">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Zap className="w-4 h-4" /> Automático com freio</h2>
      <p style={{ fontSize: 13, opacity: 0.75 }}>Posta poucas e boas, espalhadas pelo dia: no máximo uma oferta por vez, respeitando o intervalo, o horário e o desconto mínimo. Nunca repete a mesma oferta.</p>
      <label className="rp-check" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0' }}>
        <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />
        <strong>{form.enabled ? 'Automático ligado' : 'Automático desligado'}</strong>
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {CHANNELS.map(c => (
          <label key={c.id} className="rp-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={form.channels.includes(c.id)} onChange={() => toggleChannel(c.id)} /> {c.label}
          </label>
        ))}
      </div>
      <div className="rp-grid">
        <label className="rp-field">Intervalo mínimo (minutos)
          <input type="number" min={15} max={1440} value={form.minIntervalMinutes} onChange={e => setForm({ ...form, minIntervalMinutes: Number(e.target.value) })} />
        </label>
        <label className="rp-field">Desconto mínimo (%)
          <input type="number" min={0} max={95} value={form.minDiscountPct} onChange={e => setForm({ ...form, minDiscountPct: Number(e.target.value) })} />
        </label>
        <label className="rp-field">Começa às
          <input type="time" value={form.windowStart} onChange={e => setForm({ ...form, windowStart: e.target.value })} />
        </label>
        <label className="rp-field">Para às
          <input type="time" value={form.windowEnd} onChange={e => setForm({ ...form, windowEnd: e.target.value })} />
        </label>
      </div>
      <button type="button" className="rp-btn rp-primary" disabled={busy || form.channels.length === 0} onClick={() => onSave(form)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Settings2 className="w-4 h-4" /> Salvar automático
      </button>
    </div>
  );
}
