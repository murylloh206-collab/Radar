'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { WhatsAppGroup } from '@/lib/types';

function CriarConteudoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get('aba');

  // Mapear abas válidas
  const parseTab = (val: string | null) => {
    if (val === 'mensagem' || val === 'mensagem-livre') return 'mensagem';
    if (val === 'story') return 'story';
    if (val === 'templates') return 'templates';
    return 'oferta';
  };

  const [activeTab, setActiveTab] = useState<'oferta' | 'mensagem' | 'story' | 'templates'>(() =>
    parseTab(initialTabParam)
  );

  useEffect(() => {
    if (initialTabParam) {
      setActiveTab(parseTab(initialTabParam));
    }
  }, [initialTabParam]);

  // Aba 1: Oferta por link
  const [productUrl, setProductUrl] = useState('');
  const [offerTitle, setOfferTitle] = useState('Fone sem fio · modelo exemplo');
  const [offerPrice, setOfferPrice] = useState('149.90');
  const [offerCoupon, setOfferCoupon] = useState('RADAR10');
  const [offerTemplate, setOfferTemplate] = useState('Oferta essencial');
  const [converting, setConverting] = useState(false);
  const [affiliateLink, setAffiliateLink] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  // Aba 2: Mensagem livre
  const [freeMessage, setFreeMessage] = useState(
    'Bom dia! ✨ Separamos novos achados para vocês. As ofertas de hoje chegam por aqui ao longo do dia.'
  );
  const [freeImageUrl, setFreeImageUrl] = useState('');
  const [selectedDestGroup, setSelectedDestGroup] = useState('');
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);

  // Aba 3: Story
  const [storyTitle, setStoryTitle] = useState('Um achado para ouvir melhor');
  const [storyPrice, setStoryPrice] = useState('149,90');
  const [storyCoupon, setStoryCoupon] = useState('RADAR10');
  const [storyStyle, setStoryStyle] = useState('Editorial · Grafite');
  const [showStoryPrice, setShowStoryPrice] = useState(true);

  // Aba 4: Templates
  const [activeTemplateKey, setActiveTemplateKey] = useState('Oferta essencial');
  const [templateName, setTemplateName] = useState('Oferta essencial');
  const [templateBody, setTemplateBody] = useState(
    'Um achado para o seu dia ✨\n*{titulo}*\nPor *{preco_por}*\n{link}'
  );

  // Carregar grupos disponíveis
  useEffect(() => {
    fetch('/api/whatsapp/groups')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.groups)) {
          setGroups(data.groups);
          if (data.groups.length > 0) {
            setSelectedDestGroup(data.groups[0].groupJid);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Conversão de link real
  const handleFetchProduct = async () => {
    if (!productUrl.trim()) {
      setNotice('Cole a URL do produto para buscar.');
      return;
    }
    setConverting(true);
    setNotice(null);

    try {
      const res = await fetch('/api/converter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl.trim() }),
      });
      const data = await res.json();
      if (data.ok && data.data) {
        if (data.data.title) setOfferTitle(data.data.title);
        if (data.data.priceCurrent) setOfferPrice(String(data.data.priceCurrent));
        if (data.data.affiliateUrl) setAffiliateLink(data.data.affiliateUrl);
        setNotice('Link convertido e dados do produto carregados com sucesso!');
      } else {
        setNotice(data.error || 'Não foi possível converter o link automaticamente. Você pode preencher os dados manualmente.');
      }
    } catch {
      setNotice('Erro de conexão ao buscar o produto.');
    } finally {
      setConverting(false);
    }
  };

  const handleSelectTab = (tab: 'oferta' | 'mensagem' | 'story' | 'templates') => {
    setActiveTab(tab);
    const mapped = tab === 'oferta' ? 'oferta-link' : tab === 'mensagem' ? 'mensagem-livre' : tab;
    router.replace(`/criar-conteudo?aba=${mapped}`, { scroll: false });
  };

  const handleSelectTemplate = (tpl: string) => {
    setActiveTemplateKey(tpl);
    setTemplateName(tpl);
    if (tpl === 'Oferta essencial') {
      setTemplateBody('Um achado para o seu dia ✨\n*{titulo}*\nPor *{preco_por}*\n{link}');
    } else if (tpl === 'Oferta com cupom') {
      setTemplateBody('🔥 SUPER ACHADO COM CUPOM!\n\n*{titulo}*\nDe: ~R$ {preco_de}~\nPor apenas: *{preco_por}*\nCupom: *{cupom}*\n\nCompre com segurança:\n{link}');
    } else if (tpl === 'Texto curto') {
      setTemplateBody('*{titulo}* por *{preco_por}*\n{link}');
    }
  };

  return (
    <section className="rp-page" aria-label="Criar conteúdo">
      {/* Cabeçalho da página */}
      <div className="rp-head">
        <div>
          <span className="rp-step">Estúdio</span>
          <h1>Criar conteúdo</h1>
          <p>Transforme uma oferta em mensagem ou arte com a sua identidade.</p>
        </div>
        <Link href="/envios" className="rp-btn">
          Ver envios ↗
        </Link>
      </div>

      {notice && (
        <div className="rp-panel rp-section" style={{ borderColor: '#39bee6' }}>
          <p>{notice}</p>
        </div>
      )}

      {/* Abas */}
      <div data-tab-group="creator">
        <div className="rp-tabs" role="tablist" aria-label="Tipo de conteúdo">
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'oferta'}
            onClick={() => handleSelectTab('oferta')}
          >
            Oferta por link
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'mensagem'}
            onClick={() => handleSelectTab('mensagem')}
          >
            Mensagem livre
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'story'}
            onClick={() => handleSelectTab('story')}
          >
            Story
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'templates'}
            onClick={() => handleSelectTab('templates')}
          >
            Templates
          </button>
        </div>

        {/* Painel 1: Oferta por link */}
        {activeTab === 'oferta' && (
          <div data-panel="oferta" role="tabpanel">
            <div className="rp-split">
              <div className="rp-panel">
                <h2>Dados da oferta</h2>

                <label className="rp-field">
                  Link do produto
                  <input
                    type="url"
                    placeholder="Cole o link do produto"
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                  />
                </label>

                <button
                  type="button"
                  className="rp-btn rp-section"
                  onClick={handleFetchProduct}
                  disabled={converting}
                >
                  {converting ? 'Buscando produto...' : 'Buscar produto'}
                </button>

                <label className="rp-field">
                  Título
                  <input
                    id="rp-offer-title"
                    value={offerTitle}
                    onChange={(e) => setOfferTitle(e.target.value)}
                  />
                </label>

                <div className="rp-grid">
                  <label className="rp-field">
                    Preço atual (R$)
                    <input
                      id="rp-offer-price"
                      type="number"
                      value={offerPrice}
                      min="0"
                      step="0.01"
                      onChange={(e) => setOfferPrice(e.target.value)}
                    />
                  </label>
                  <label className="rp-field">
                    Cupom
                    <input
                      id="rp-offer-coupon"
                      value={offerCoupon}
                      onChange={(e) => setOfferCoupon(e.target.value)}
                    />
                  </label>
                </div>

                <label className="rp-field">
                  Template
                  <select
                    value={offerTemplate}
                    onChange={(e) => setOfferTemplate(e.target.value)}
                  >
                    <option value="Oferta essencial">Oferta essencial</option>
                    <option value="Oferta com cupom">Oferta com cupom</option>
                  </select>
                </label>

                <div className="rp-footer">
                  <button
                    className="rp-btn"
                    type="button"
                    onClick={() => setNotice('Rascunho salvo na sessão.')}
                  >
                    Salvar rascunho
                  </button>
                  <Link href="/envios?aba=revisao" className="rp-btn rp-primary">
                    Continuar para envio →
                  </Link>
                </div>
              </div>

              <div className="rp-panel">
                <h2>Prévia no WhatsApp</h2>
                <div className="rp-message rp-section">
                  <div className="rp-product-photo rp-p1" role="img" aria-label={offerTitle} />
                  <p>
                    Um achado para o seu dia ✨<br />
                    <strong id="rp-live-title">{offerTitle}</strong>
                    <br />
                    Por <strong id="rp-live-price">R$ {offerPrice}</strong>
                    <br />
                    {offerCoupon && (
                      <>
                        Cupom: <span id="rp-live-coupon">{offerCoupon}</span>
                        <br />
                      </>
                    )}
                    <span className="rp-link">
                      {affiliateLink || 'Link de afiliado verificado'}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Painel 2: Mensagem livre */}
        {activeTab === 'mensagem' && (
          <div data-panel="mensagem" role="tabpanel">
            <div className="rp-split">
              <div className="rp-panel">
                <h2>Escreva do seu jeito</h2>

                <label className="rp-field">
                  Mensagem
                  <textarea
                    id="rp-free-message"
                    rows={4}
                    value={freeMessage}
                    onChange={(e) => setFreeMessage(e.target.value)}
                  />
                </label>

                <label className="rp-field">
                  Imagem opcional
                  <input
                    type="url"
                    placeholder="Cole o endereço de uma imagem"
                    value={freeImageUrl}
                    onChange={(e) => setFreeImageUrl(e.target.value)}
                  />
                </label>

                <label className="rp-field">
                  Destino
                  <select
                    value={selectedDestGroup}
                    onChange={(e) => setSelectedDestGroup(e.target.value)}
                  >
                    {groups.map((g) => (
                      <option key={g.groupJid} value={g.groupJid}>
                        {g.name}
                      </option>
                    ))}
                    {groups.length === 0 && (
                      <option value="">Nenhum grupo de destino encontrado</option>
                    )}
                  </select>
                </label>

                <div className="rp-footer">
                  <Link
                    href="/envios?aba=agenda"
                    className="rp-btn rp-primary"
                  >
                    Escolher envio →
                  </Link>
                </div>
              </div>

              <div className="rp-panel">
                <h2>Prévia da mensagem</h2>
                <div className="rp-message rp-section">
                  {freeImageUrl && (
                    <div
                      style={{
                        marginBottom: 10,
                        maxHeight: 180,
                        overflow: 'hidden',
                        borderRadius: 6,
                      }}
                    >
                      <img
                        src={freeImageUrl}
                        alt="Imagem da mensagem"
                        style={{ width: '100%', objectFit: 'cover' }}
                      />
                    </div>
                  )}
                  <p id="rp-live-message" style={{ whiteSpace: 'pre-wrap' }}>
                    {freeMessage}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Painel 3: Story */}
        {activeTab === 'story' && (
          <div data-panel="story" role="tabpanel">
            <div className="rp-split">
              <div className="rp-panel">
                <h2>Arte vertical</h2>
                <p className="rp-sub">Formato 9:16 para compartilhar no Status ou nos Stories.</p>

                <label className="rp-field">
                  Título
                  <input
                    value={storyTitle}
                    onChange={(e) => setStoryTitle(e.target.value)}
                  />
                </label>

                <label className="rp-field">
                  Produto
                  <select
                    onChange={(e) => {
                      if (e.target.value === 'fone') {
                        setStoryTitle('Um achado para ouvir melhor');
                        setStoryPrice('149,90');
                      } else {
                        setStoryTitle('Conforto e elegância para o ambiente');
                        setStoryPrice('69,90');
                      }
                    }}
                  >
                    <option value="fone">Fone sem fio · exemplo</option>
                    <option value="almofada">Almofada de linho · exemplo</option>
                  </select>
                </label>

                <label className="rp-field">
                  Estilo
                  <select
                    value={storyStyle}
                    onChange={(e) => setStoryStyle(e.target.value)}
                  >
                    <option value="Editorial · Grafite">Editorial · Grafite</option>
                    <option value="Essencial · Claro">Essencial · Claro</option>
                  </select>
                </label>

                <label className="rp-check">
                  <input
                    type="checkbox"
                    checked={showStoryPrice}
                    onChange={(e) => setShowStoryPrice(e.target.checked)}
                  />
                  Mostrar preço e cupom
                </label>

                <button
                  className="rp-btn rp-primary rp-section"
                  type="button"
                  onClick={() => setNotice('Imagem 9:16 renderizada e pronta para download!')}
                >
                  Exportar imagem
                </button>
              </div>

              <div className="rp-story">
                <div className="rp-product-photo rp-p1" role="img" aria-label="Story de fone" />
                <div className="rp-story-caption">
                  <small>RADAR DE OFERTAS</small>
                  <p>{storyTitle}</p>
                  {showStoryPrice && (
                    <>
                      <strong>R$ {storyPrice}</strong>
                      <small>CUPOM {storyCoupon}</small>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Painel 4: Templates */}
        {activeTab === 'templates' && (
          <div data-panel="templates" role="tabpanel">
            <div className="rp-split">
              <div className="rp-panel">
                <h2>Seus modelos</h2>
                <div className="rp-list">
                  <div className="rp-list-item">
                    <div className="rp-list-copy">
                      <strong>Oferta essencial</strong>
                      <p>Título, preço e link</p>
                    </div>
                    {activeTemplateKey === 'Oferta essencial' ? (
                      <span className="rp-tag">Ativo</span>
                    ) : (
                      <button
                        type="button"
                        className="rp-btn"
                        onClick={() => handleSelectTemplate('Oferta essencial')}
                      >
                        Editar
                      </button>
                    )}
                  </div>

                  <div className="rp-list-item">
                    <div className="rp-list-copy">
                      <strong>Oferta com cupom</strong>
                      <p>Destaque para o desconto</p>
                    </div>
                    {activeTemplateKey === 'Oferta com cupom' ? (
                      <span className="rp-tag">Ativo</span>
                    ) : (
                      <button
                        type="button"
                        className="rp-btn"
                        onClick={() => handleSelectTemplate('Oferta com cupom')}
                      >
                        Editar
                      </button>
                    )}
                  </div>

                  <div className="rp-list-item">
                    <div className="rp-list-copy">
                      <strong>Texto curto</strong>
                      <p>Direto ao produto</p>
                    </div>
                    {activeTemplateKey === 'Texto curto' ? (
                      <span className="rp-tag">Ativo</span>
                    ) : (
                      <button
                        type="button"
                        className="rp-btn"
                        onClick={() => handleSelectTemplate('Texto curto')}
                      >
                        Editar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rp-panel">
                <h2>Editor do template</h2>

                <label className="rp-field">
                  Nome
                  <input
                    id="rp-template-name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                  />
                </label>

                <label className="rp-field">
                  Mensagem
                  <textarea
                    id="rp-template-body"
                    rows={6}
                    value={templateBody}
                    onChange={(e) => setTemplateBody(e.target.value)}
                  />
                </label>

                <p className="rp-sub">
                  Campos disponíveis: &#123;titulo&#125;, &#123;preco_por&#125;, &#123;cupom&#125; e &#123;link&#125;.
                </p>

                <button
                  type="button"
                  className="rp-btn rp-primary rp-section"
                  onClick={() => setNotice('Template atualizado com sucesso!')}
                >
                  Salvar template
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function CriarConteudoPage() {
  return (
    <Suspense fallback={<div className="rp-page"><p className="rp-sub">Carregando estúdio...</p></div>}>
      <CriarConteudoContent />
    </Suspense>
  );
}

