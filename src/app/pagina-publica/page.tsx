'use client';

import React, { useState, useEffect } from 'react';
import { ExternalLink, Copy, CheckCircle2, Upload, Palette } from 'lucide-react';
import { PlanGateCard } from '@/components/PlanGateCard';

const ACCENT_PRESETS = ['#6366f1', '#1CCAF2', '#10b981', '#f59e0b', '#ec4899', '#ef4444'];

export default function PaginaPublicaPage() {
  const [bioTitle, setBioTitle] = useState('Radar de Ofertas');
  const [bioText, setBioText] = useState(
    'Ofertas verificadas que valem a pena. Promoções de tecnologia, casa e conforto selecionadas para você.'
  );
  const [slug, setSlug] = useState('radar-ofertas');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState('#6366f1');
  const [btn1Text, setBtn1Text] = useState('Entrar no grupo de ofertas (WhatsApp)');
  const [btn1Url, setBtn1Url] = useState('https://chat.whatsapp.com/exemplo');
  const [btn2Text, setBtn2Text] = useState('Canal de ofertas no Telegram');
  const [btn2Url, setBtn2Url] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    fetch('/api/public-page')
      .then((r) => r.json())
      .then((res) => {
        if (res.ok && res.data) {
          if (res.data.title) setBioTitle(res.data.title);
          if (res.data.bio) setBioText(res.data.bio);
          if (res.data.slug) setSlug(res.data.slug);
          if (res.data.logoUrl !== undefined) setLogoUrl(res.data.logoUrl);
          if (res.data.accentColor) setAccentColor(res.data.accentColor);
          if (res.data.btn1Text) setBtn1Text(res.data.btn1Text);
          if (res.data.btn1Url !== undefined) setBtn1Url(res.data.btn1Url);
          if (res.data.btn2Text) setBtn2Text(res.data.btn2Text);
          if (res.data.btn2Url !== undefined) setBtn2Url(res.data.btn2Url);
        }
      })
      .catch(() => {
        setNotice('Não foi possível carregar a configuração da vitrine pública.');
      })
      .finally(() => setLoading(false));
  }, []);

  const cleanSlug = (slug || 'radar-ofertas').replace(/^@+/, '').toLowerCase().trim();
  const publicPath = `/@${cleanSlug}`;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1500 * 1024) {
      setNotice('A imagem da logo deve ter no máximo 1,5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCopyPublicUrl = () => {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(`${window.location.origin}${publicPath}`);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);

    try {
      const res = await fetch('/api/public-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: bioTitle,
          bio: bioText,
          slug: cleanSlug,
          logoUrl,
          accentColor,
          btn1Text,
          btn1Url,
          btn2Text,
          btn2Url,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setNotice(`Vitrine pública /@${data.data.slug} e identidade do painel salvas com sucesso!`);
        window.dispatchEvent(new CustomEvent('brand-settings-updated'));
      } else {
        setNotice(data.error || 'Falha ao salvar a vitrine pública.');
      }
    } catch {
      setNotice('Erro de rede ao salvar vitrine pública.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rp-page" aria-label="Vitrine pública Link na Bio">
      {/* Cabeçalho */}
      <div className="rp-head" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="rp-step">Sua vitrine Link na Bio</span>
          <h1>Página pública (/@{cleanSlug})</h1>
          <p>Personalize seu nome, logo, cor de destaque e exiba suas ofertas do dia com links rastreados via /r/[code].</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="rp-btn"
            type="button"
            onClick={handleCopyPublicUrl}
          >
            {copiedUrl ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-1.5 inline text-emerald-400" />
                URL copiada!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-1.5 inline" />
                Copiar {publicPath}
              </>
            )}
          </button>
          <a
            href={publicPath}
            target="_blank"
            rel="noopener noreferrer"
            className="rp-btn"
            style={{ textDecoration: 'none' }}
          >
            Abrir {publicPath} <ExternalLink className="w-3.5 h-3.5 ml-1 inline" />
          </a>
          <button
            className="rp-btn rp-primary"
            type="button"
            disabled={saving || loading}
            onClick={handleSave}
          >
            {saving ? 'Salvando...' : 'Salvar vitrine'}
          </button>
        </div>
      </div>

      {notice && (
        <div className="rp-panel rp-section" style={{ borderColor: accentColor }}>
          <p>{notice}</p>
        </div>
      )}

      {/* Grid Dividido protegido pelo plano Plus / Ultimate */}
      <PlanGateCard
        feature="public_showcase"
        requiredPlan="plus"
        title="Vitrine Pública 'Link na Bio' (/@seunome) + Identidade Própria"
        description="Personalize o nome, logotipo e cor de destaque do seu painel e publique sua vitrine /@seunome com ofertas do dia e redirecionamento rastreado /r/[code]. Disponível nos planos Plus e Ultimate."
      >
        <div className="rp-split">
          {/* Coluna da esquerda: Formulário de Identidade, Logo, Cor e Links */}
          <div className="rp-stack">
            <div className="rp-panel">
              <h2>Identidade da vitrine e do painel</h2>

              <label className="rp-field">
                Nome da página / marca
                <input
                  id="rp-bio-title"
                  value={bioTitle}
                  onChange={(e) => setBioTitle(e.target.value)}
                  placeholder="Ex: Ofertas do Muryllo"
                />
              </label>

              <label className="rp-field">
                Descrição curta (Bio)
                <textarea
                  id="rp-bio-text"
                  rows={3}
                  value={bioText}
                  onChange={(e) => setBioText(e.target.value)}
                />
              </label>

              <label className="rp-field">
                Endereço público (@slug)
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: 14 }}>/@</span>
                  <input
                    value={slug}
                    aria-label="Nome do endereço público"
                    onChange={(e) => setSlug(e.target.value.replace(/^@+/, ''))}
                    placeholder="sua-marca"
                  />
                </div>
              </label>

              <p className="rp-sub">
                Sua vitrine fica acessível diretamente em: <strong>/@{cleanSlug}</strong> (todos os cliques nas ofertas passam pelo rastreador <code>/r/[code]</code>).
              </p>

              {/* Upload de Logo e Cor de Destaque */}
              <div className="rp-two-cols" style={{ marginTop: 14 }}>
                <div className="rp-field">
                  <span>Logotipo da sua marca</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Logo"
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: `2px solid ${accentColor}`,
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(255,255,255,0.06)',
                          border: `1px solid ${accentColor}`,
                          color: accentColor,
                          fontWeight: 800,
                        }}
                      >
                        ◎
                      </span>
                    )}
                    <label
                      className="rp-btn"
                      style={{ cursor: 'pointer', fontSize: 12, padding: '6px 10px' }}
                    >
                      <Upload className="w-3.5 h-3.5 mr-1 inline" />
                      Enviar logo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleLogoUpload}
                        style={{ display: 'none' }}
                      />
                    </label>
                    {logoUrl && (
                      <button
                        type="button"
                        className="rp-btn rp-quiet"
                        onClick={() => setLogoUrl(null)}
                        style={{ fontSize: 11 }}
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>

                <div className="rp-field">
                  <span>
                    <Palette className="w-3.5 h-3.5 mr-1 inline" />
                    Cor de destaque
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      style={{
                        width: 38,
                        height: 36,
                        padding: 2,
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                    />
                    {ACCENT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAccentColor(preset)}
                        aria-label={`Escolher cor ${preset}`}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: preset,
                          border: accentColor === preset ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Painel Links de Comunidade */}
            <div className="rp-panel">
              <h2>Botões de grupos e canais</h2>
              <p className="rp-sub">
                Estes botões aparecem no topo da sua vitrine <strong>/@{cleanSlug}</strong> antes da grade de ofertas do dia.
              </p>

              <div id="rp-bio-fields" style={{ marginTop: 12 }}>
                <label className="rp-field">
                  Texto do botão principal (Ex: Grupo VIP WhatsApp)
                  <input
                    value={btn1Text}
                    onChange={(e) => setBtn1Text(e.target.value)}
                  />
                </label>

                <label className="rp-field">
                  Link do botão principal
                  <input
                    type="url"
                    placeholder="https://chat.whatsapp.com/..."
                    value={btn1Url}
                    onChange={(e) => setBtn1Url(e.target.value)}
                  />
                </label>

                <label className="rp-field" style={{ marginTop: 10 }}>
                  Texto do segundo botão (Ex: Canal no Telegram)
                  <input
                    value={btn2Text}
                    onChange={(e) => setBtn2Text(e.target.value)}
                  />
                </label>

                <label className="rp-field">
                  Link do segundo botão
                  <input
                    type="url"
                    placeholder="https://t.me/..."
                    value={btn2Url}
                    onChange={(e) => setBtn2Url(e.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Coluna da direita: Prévia ao Vivo da Vitrine /@slug */}
          <div className="rp-panel">
            <div className="rp-row">
              <h2>Prévia ao vivo (/@{cleanSlug})</h2>
              <span className="rp-tag">Responsivo</span>
            </div>

            <div
              className="rp-public-preview rp-section"
              style={{
                borderRadius: 20,
                padding: 24,
                border: `1px solid ${accentColor}44`,
                background: 'linear-gradient(165deg, #060913 0%, #0d1634 100%)',
                textAlign: 'center',
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={bioTitle}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    margin: '0 auto 10px',
                    border: `2px solid ${accentColor}`,
                  }}
                />
              ) : (
                <span
                  className="rdv3-brand-mark"
                  aria-hidden="true"
                  style={{
                    fontSize: 24,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    marginBottom: 10,
                    color: accentColor,
                    border: `2px solid ${accentColor}`,
                  }}
                >
                  ◉
                </span>
              )}

              <div
                style={{
                  fontSize: 11,
                  color: '#cbd5e1',
                  marginBottom: 4,
                  fontWeight: 600,
                }}
              >
                @{cleanSlug}
              </div>

              <h2 id="rp-bio-live-title" style={{ color: '#fff', marginBottom: 6 }}>
                {bioTitle}
              </h2>
              <p className="rp-sub" id="rp-bio-live-text" style={{ marginBottom: 16 }}>
                {bioText}
              </p>

              <div id="rp-bio-links" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {btn1Text && (
                  <a
                    href={btn1Url ? `/r/${ encodeURIComponent(btoa(btn1Url)) }` : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rp-public-link"
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      background: accentColor,
                      color: '#fff',
                      fontWeight: 700,
                      borderRadius: 12,
                      padding: '12px 16px',
                      textDecoration: 'none',
                    }}
                  >
                    {btn1Text} ↗
                  </a>
                )}
                {btn2Text && (
                  <a
                    href={btn2Url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rp-public-link"
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff',
                      fontWeight: 600,
                      borderRadius: 12,
                      padding: '12px 16px',
                      textDecoration: 'none',
                    }}
                  >
                    {btn2Text} ↗
                  </a>
                )}
              </div>

              <div
                style={{
                  marginTop: 18,
                  paddingTop: 14,
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  fontSize: 12,
                  color: '#94a3b8',
                }}
              >
                As ofertas publicadas hoje aparecem logo abaixo na sua página <strong>/@{cleanSlug}</strong> com redirecionamento rastreado via <code>/r/[code]</code>.
              </div>
            </div>
          </div>
        </div>
      </PlanGateCard>
    </section>
  );
}
