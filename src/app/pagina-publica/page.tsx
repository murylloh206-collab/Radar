'use client';

import React, { useState, useEffect } from 'react';

export default function PaginaPublicaPage() {
  const [bioTitle, setBioTitle] = useState('Radar de Ofertas');
  const [bioText, setBioText] = useState(
    'Achados que valem a pena. Ofertas de tecnologia, casa e conforto, selecionadas para você.'
  );
  const [slug, setSlug] = useState('radar-ofertas');
  const [btn1Text, setBtn1Text] = useState('Entrar no grupo de ofertas');
  const [btn1Url, setBtn1Url] = useState('https://chat.whatsapp.com/exemplo');
  const [btn2Text, setBtn2Text] = useState('Conhecer as lojas');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  // Carregar dados reais salvos no servidor
  useEffect(() => {
    fetch('/api/public-page')
      .then((r) => r.json())
      .then((res) => {
        if (res.ok && res.data) {
          if (res.data.title) setBioTitle(res.data.title);
          if (res.data.bio) setBioText(res.data.bio);
          if (res.data.slug) setSlug(res.data.slug);
          if (res.data.btn1Text) setBtn1Text(res.data.btn1Text);
          if (res.data.btn1Url) setBtn1Url(res.data.btn1Url);
          if (res.data.btn2Text) setBtn2Text(res.data.btn2Text);
        }
      })
      .catch(() => {
        setNotice('Não foi possível carregar a configuração da página pública.');
      })
      .finally(() => setLoading(false));
  }, []);

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
          slug,
          btn1Text,
          btn1Url,
          btn2Text,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setNotice('Página pública atualizada e salva com sucesso no servidor!');
      } else {
        setNotice(data.error || 'Falha ao salvar a página pública.');
      }
    } catch {
      setNotice('Erro de rede ao salvar página pública.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rp-page" aria-label="Página pública">
      {/* Cabeçalho */}
      <div className="rp-head">
        <div>
          <span className="rp-step">Sua vitrine</span>
          <h1>Página pública</h1>
          <p>Reúna seus grupos e links em uma página com a sua identidade.</p>
        </div>
        <button
          className="rp-btn rp-primary"
          type="button"
          disabled={saving || loading}
          onClick={handleSave}
        >
          {saving ? 'Salvando...' : 'Salvar página'}
        </button>
      </div>

      {notice && (
        <div className="rp-panel rp-section" style={{ borderColor: '#39bee6' }}>
          <p>{notice}</p>
        </div>
      )}

      {/* Grid Dividido */}
      <div className="rp-split">
        {/* Coluna da esquerda: Formulário de Perfil e Links */}
        <div className="rp-stack">
          {/* Painel Perfil */}
          <div className="rp-panel">
            <h2>Perfil da página</h2>

            <label className="rp-field">
              Nome
              <input
                id="rp-bio-title"
                value={bioTitle}
                onChange={(e) => setBioTitle(e.target.value)}
              />
            </label>

            <label className="rp-field">
              Descrição
              <textarea
                id="rp-bio-text"
                rows={3}
                value={bioText}
                onChange={(e) => setBioText(e.target.value)}
              />
            </label>

            <label className="rp-field">
              Endereço personalizado
              <input
                value={slug}
                aria-label="Nome do endereço público"
                onChange={(e) => setSlug(e.target.value)}
              />
            </label>

            <p className="rp-sub">
              Acesse sua página pública em: <strong>/u/{slug || 'sua-pagina'}</strong>
            </p>
          </div>

          {/* Painel Links */}
          <div className="rp-panel">
            <div className="rp-row">
              <h2>Links da página</h2>
              <button
                className="rp-btn"
                id="rp-add-bio-link"
                type="button"
                onClick={() => setNotice('Campos de botão prontos para edição.')}
              >
                Adicionar
              </button>
            </div>

            <div id="rp-bio-fields">
              <label className="rp-field">
                Nome do botão
                <input
                  value={btn1Text}
                  onChange={(e) => setBtn1Text(e.target.value)}
                />
              </label>

              <label className="rp-field">
                Endereço
                <input
                  type="url"
                  placeholder="https://..."
                  value={btn1Url}
                  onChange={(e) => setBtn1Url(e.target.value)}
                />
              </label>

              <label className="rp-field">
                Nome do segundo botão
                <input
                  value={btn2Text}
                  onChange={(e) => setBtn2Text(e.target.value)}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Coluna da direita: Prévia Pública no Celular */}
        <div className="rp-panel">
          <div className="rp-row">
            <h2>Prévia pública</h2>
            <span className="rp-tag">Celular</span>
          </div>

          <div className="rp-public-preview rp-section">
            <span
              className="rdv3-brand-mark"
              aria-hidden="true"
              style={{ fontSize: 24, display: 'inline-block', marginBottom: 8, color: '#39bee6' }}
            >
              ◉
            </span>
            <h2 id="rp-bio-live-title">{bioTitle}</h2>
            <p className="rp-sub" id="rp-bio-live-text">
              {bioText}
            </p>

            <div id="rp-bio-links">
              <a
                href={btn1Url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="rp-public-link"
                style={{ display: 'block', textAlign: 'center' }}
              >
                {btn1Text} ↗
              </a>
              <button
                className="rp-public-link rdv3-open-stores"
                type="button"
                style={{ width: '100%' }}
                onClick={() => {
                  const dialog = document.querySelector('.rdv3-shop-dialog') as HTMLDialogElement | null;
                  if (dialog) dialog.showModal();
                }}
              >
                {btn2Text} ↗
              </button>
            </div>

            <div
              className="rp-product-photo rp-p3 rp-section"
              role="img"
              aria-label="Destaque de luminária"
            />
            <p className="rp-sub" style={{ marginTop: 8 }}>
              Um achado para deixar sua casa mais aconchegante.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
