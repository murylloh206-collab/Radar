'use client';

import React, { Suspense, useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { WhatsAppGroup } from '@/lib/types';

type LinkStatus = 'ausente' | 'convertendo' | 'erro' | 'gerado' | 'confirmado';

interface TemplateItem {
  key: string;
  name: string;
  body: string;
  isDefault?: boolean;
}

const DEFAULT_TEMPLATES: TemplateItem[] = [
  {
    key: 'Oferta essencial',
    name: 'Oferta essencial',
    body: 'Um achado para o seu dia ✨\n*{titulo}*\nPor *{preco_por}*\n{link}',
    isDefault: true,
  },
  {
    key: 'Oferta com cupom',
    name: 'Oferta com cupom',
    body: '🔥 SUPER ACHADO COM CUPOM!\n\n*{titulo}*\nDe: ~R$ {preco_de}~\nPor apenas: *{preco_por}*\nCupom: *{cupom}*\n\nCompre com segurança no link verificado:\n{link}',
  },
  {
    key: 'Texto curto',
    name: 'Texto curto',
    body: '*{titulo}* por *{preco_por}*\n{link}',
  },
];

function CriarConteudoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get('aba');

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
  const [offerTitle, setOfferTitle] = useState('');
  const [offerPrice, setOfferPrice] = useState('');
  const [offerCoupon, setOfferCoupon] = useState('');
  const [offerTemplate, setOfferTemplate] = useState('Oferta essencial');
  const [converting, setConverting] = useState(false);
  const [affiliateLink, setAffiliateLink] = useState('');
  const [linkStatus, setLinkStatus] = useState<LinkStatus>('ausente');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submittingToReview, setSubmittingToReview] = useState(false);

  // Aba 2: Mensagem livre
  const [freeMessage, setFreeMessage] = useState(
    'Bom dia! ✨ Separamos novos achados para vocês hoje. Fiquem atentos às próximas ofertas.'
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
  const [exportingStory, setExportingStory] = useState(false);

  // Aba 4: Templates
  const [templates, setTemplates] = useState<TemplateItem[]>(DEFAULT_TEMPLATES);
  const [activeTemplateKey, setActiveTemplateKey] = useState('Oferta essencial');
  const [templateName, setTemplateName] = useState('Oferta essencial');
  const [templateBody, setTemplateBody] = useState(DEFAULT_TEMPLATES[0].body);

  // Carregar templates salvos do storage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('radar_custom_templates');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTemplates(parsed);
          setTemplateName(parsed[0].name);
          setTemplateBody(parsed[0].body);
        }
      }
    } catch {}
  }, []);

  // Carregar rascunhos salvos da oferta e mensagem livre
  useEffect(() => {
    try {
      const savedOffer = localStorage.getItem('radar_draft_offer');
      if (savedOffer) {
        const o = JSON.parse(savedOffer);
        if (o.productUrl) setProductUrl(o.productUrl);
        if (o.offerTitle) setOfferTitle(o.offerTitle);
        if (o.offerPrice) setOfferPrice(o.offerPrice);
        if (o.offerCoupon) setOfferCoupon(o.offerCoupon);
        if (o.affiliateLink) {
          setAffiliateLink(o.affiliateLink);
          setLinkStatus('gerado');
        }
      }

      const savedFree = localStorage.getItem('radar_draft_free');
      if (savedFree) {
        const f = JSON.parse(savedFree);
        if (f.freeMessage) setFreeMessage(f.freeMessage);
        if (f.freeImageUrl) setFreeImageUrl(f.freeImageUrl);
      }
    } catch {}
  }, []);

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

  // Limpeza estrita de link anterior quando URL ou produto muda
  const handleProductUrlChange = (newUrl: string) => {
    setProductUrl(newUrl);
    // Limpar imediatamente associações anteriores
    setAffiliateLink('');
    setLinkStatus('ausente');
    setLinkError(null);
  };

  // Conversão real de link e captura de dados
  const handleFetchProduct = async () => {
    if (!productUrl.trim()) {
      setNotice('Cole a URL do produto para buscar.');
      return;
    }

    setConverting(true);
    setLinkStatus('convertendo');
    setLinkError(null);
    setNotice(null);
    setAffiliateLink('');

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
        if (data.data.affiliateUrl) {
          setAffiliateLink(data.data.affiliateUrl);
          setLinkStatus(data.data.isValidated ? 'confirmado' : 'gerado');
          setNotice('Link convertido e confirmado pela integração com sucesso!');
        } else {
          setLinkStatus('ausente');
          setNotice('Produto localizado, mas o link de afiliado não pôde ser gerado.');
        }
      } else {
        setLinkStatus('erro');
        setLinkError(data.error || 'Falha ao converter o link.');
        setNotice(data.error || 'Falha na conversão do link.');
      }
    } catch (e: any) {
      setLinkStatus('erro');
      setLinkError('Erro de conexão ao consultar conversor.');
      setNotice('Erro de rede ao buscar produto.');
    } finally {
      setConverting(false);
    }
  };

  // Salvar rascunho persistido
  const handleSaveDraft = () => {
    try {
      localStorage.setItem(
        'radar_draft_offer',
        JSON.stringify({
          productUrl,
          offerTitle,
          offerPrice,
          offerCoupon,
          affiliateLink,
          updatedAt: new Date().toISOString(),
        })
      );
      setNotice(`Rascunho salvo no navegador em ${new Date().toLocaleTimeString('pt-BR')}.`);
    } catch {
      setNotice('Não foi possível salvar o rascunho localmente.');
    }
  };

  // Continuar para envio (Aba Oferta) - Cria o registro real e transporta para /envios?aba=revisao
  const handleContinueToReview = async () => {
    if (!offerTitle.trim()) {
      setNotice('Informe o título do produto antes de prosseguir.');
      return;
    }

    setSubmittingToReview(true);
    const compiledMessage = `${offerTitle}\nPor apenas: R$ ${offerPrice || '0,00'}\n${offerCoupon ? `Cupom: ${offerCoupon}\n` : ''}${affiliateLink || productUrl}`;

    try {
      // 1. Persistir no backend como job de revisão
      const targetJid = groups[0]?.groupJid || 'destino_padrao';
      const res = await fetch('/api/copier/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          jobData: {
            originType: 'manual',
            targetJid,
            targetName: groups[0]?.name || 'Meu grupo',
            messageText: compiledMessage,
            affiliateUrl: affiliateLink || productUrl,
            status: 'aguardando_aprovacao',
            scheduledFor: new Date().toISOString(),
          },
        }),
      });
      const data = await res.json();

      // 2. Transportar no sessionStorage
      sessionStorage.setItem(
        'radar_transport_draft',
        JSON.stringify({
          title: offerTitle,
          price: offerPrice,
          coupon: offerCoupon,
          link: affiliateLink || productUrl,
          text: compiledMessage,
          jobId: data?.job?.id,
        })
      );

      // 3. Navegar para tela de revisão
      router.push('/envios?aba=revisao');
    } catch {
      setNotice('Erro ao enviar oferta para a revisão.');
    } finally {
      setSubmittingToReview(false);
    }
  };

  // Escolher envio (Aba Mensagem Livre) - Transporta para /envios?aba=agenda
  const handleContinueToSchedule = () => {
    if (!freeMessage.trim()) {
      setNotice('Escreva uma mensagem antes de prosseguir.');
      return;
    }

    sessionStorage.setItem(
      'radar_transport_draft',
      JSON.stringify({
        text: freeMessage.trim(),
        targetJid: selectedDestGroup,
        imageUrl: freeImageUrl.trim(),
      })
    );

    router.push('/envios?aba=agenda');
  };

  // Exportação Real de Imagem 9:16 (Story) via Canvas
  const handleExportStory = () => {
    setExportingStory(true);
    setNotice(null);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Não foi possível inicializar o contexto 2D.');
      }

      // Fundo grafite editorial escuro (#1a1d20 a #24282c)
      const grad = ctx.createLinearGradient(0, 0, 0, 1920);
      grad.addColorStop(0, '#171a1d');
      grad.addColorStop(0.5, '#202428');
      grad.addColorStop(1, '#131517');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);

      // Borda sutil de destaque
      ctx.strokeStyle = '#363c41';
      ctx.lineWidth = 4;
      ctx.strokeRect(36, 36, 1008, 1848);

      // Marca superior: RADAR DE OFERTAS
      ctx.fillStyle = '#39bee6';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('◉  RADAR DE OFERTAS', 540, 180);

      ctx.fillStyle = '#aab2b7';
      ctx.font = '500 24px sans-serif';
      ctx.fillText('ACHADOS & OFERTAS EXCLUSIVAS', 540, 230);

      // Caixa da imagem central
      ctx.fillStyle = '#292e33';
      ctx.fillRect(100, 320, 880, 880);
      ctx.strokeStyle = '#39bee6';
      ctx.lineWidth = 2;
      ctx.strokeRect(100, 320, 880, 880);

      // Ícone ou texto representativo no centro da foto
      ctx.fillStyle = '#f2f4f5';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText(storyTitle.slice(0, 30), 540, 760);

      // Título do Produto
      ctx.fillStyle = '#f2f4f5';
      ctx.font = 'bold 54px sans-serif';
      ctx.fillText(storyTitle, 540, 1300);

      // Preço e Cupom
      if (showStoryPrice) {
        ctx.fillStyle = '#56c288';
        ctx.font = 'bold 76px sans-serif';
        ctx.fillText(`R$ ${storyPrice}`, 540, 1420);

        if (storyCoupon) {
          ctx.fillStyle = '#39bee6';
          ctx.font = 'bold 38px sans-serif';
          ctx.fillText(`CUPOM: ${storyCoupon}`, 540, 1500);
        }
      }

      // Rodapé CTA
      ctx.fillStyle = '#f2f4f5';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('CLIQUE NO LINK DOS STORIES OU RESPONDA NO CHAT', 540, 1720);

      // Download real do arquivo PNG
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `story-radar-ofertas-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setNotice('Arte 9:16 gerada e baixada com sucesso no seu dispositivo!');
      }, 'image/png');
    } catch (e: any) {
      setNotice('Erro ao gerar imagem 9:16: ' + e.message);
    } finally {
      setExportingStory(false);
    }
  };

  // Salvar Template de Verdade no Storage
  const handleSaveTemplate = () => {
    if (!templateName.trim() || !templateBody.trim()) {
      setNotice('Informe o nome e o corpo do template.');
      return;
    }

    const updated = templates.map((t) =>
      t.key === activeTemplateKey ? { ...t, name: templateName, body: templateBody } : t
    );

    // Se for novo
    if (!templates.find((t) => t.key === activeTemplateKey)) {
      updated.push({ key: templateName, name: templateName, body: templateBody });
    }

    setTemplates(updated);
    try {
      localStorage.setItem('radar_custom_templates', JSON.stringify(updated));
      setNotice(`Template "${templateName}" salvo e persistido com sucesso!`);
    } catch {
      setNotice('Falha ao persistir template no navegador.');
    }
  };

  const handleSelectTab = (tab: 'oferta' | 'mensagem' | 'story' | 'templates') => {
    setActiveTab(tab);
    const mapped = tab === 'oferta' ? 'oferta-link' : tab === 'mensagem' ? 'mensagem-livre' : tab;
    router.replace(`/criar-conteudo?aba=${mapped}`, { scroll: false });
  };

  const handleSelectTemplate = (tplKey: string) => {
    setActiveTemplateKey(tplKey);
    const found = templates.find((t) => t.key === tplKey);
    if (found) {
      setTemplateName(found.name);
      setTemplateBody(found.body);
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
                    placeholder="Cole a URL crua do produto (Shopee, Amazon, ML...)"
                    value={productUrl}
                    onChange={(e) => handleProductUrlChange(e.target.value)}
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
                    placeholder="Ex: Fone sem fio com cancelamento de ruído"
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
                      placeholder="0.00"
                      onChange={(e) => setOfferPrice(e.target.value)}
                    />
                  </label>
                  <label className="rp-field">
                    Cupom
                    <input
                      id="rp-offer-coupon"
                      value={offerCoupon}
                      placeholder="Ex: PROMO10"
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
                    {templates.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="rp-footer">
                  <button
                    className="rp-btn"
                    type="button"
                    onClick={handleSaveDraft}
                  >
                    Salvar rascunho
                  </button>
                  <button
                    className="rp-btn rp-primary"
                    type="button"
                    disabled={submittingToReview}
                    onClick={handleContinueToReview}
                  >
                    {submittingToReview ? 'Preparando envio...' : 'Continuar para envio →'}
                  </button>
                </div>
              </div>

              <div className="rp-panel">
                <h2>Prévia no WhatsApp</h2>
                <div className="rp-message rp-section">
                  <div
                    className="rp-product-photo rp-p1"
                    role="img"
                    aria-label={offerTitle || 'Prévia do produto'}
                  />
                  <p>
                    Um achado para o seu dia ✨<br />
                    <strong id="rp-live-title">
                      {offerTitle || 'Título da oferta aparecerá aqui'}
                    </strong>
                    <br />
                    Por{' '}
                    <strong id="rp-live-price">
                      {offerPrice ? `R$ ${offerPrice}` : 'R$ --,--'}
                    </strong>
                    <br />
                    {offerCoupon && (
                      <>
                        Cupom: <span id="rp-live-coupon">{offerCoupon}</span>
                        <br />
                      </>
                    )}
                    {/* Validação honesta de link */}
                    {linkStatus === 'ausente' && (
                      <span className="rp-link" style={{ opacity: 0.6 }}>
                        Link de afiliado ausente (informe a URL e clique em Buscar)
                      </span>
                    )}
                    {linkStatus === 'convertendo' && (
                      <span className="rp-link" style={{ color: '#39bee6' }}>
                        Convertendo link de afiliado...
                      </span>
                    )}
                    {linkStatus === 'erro' && (
                      <span className="rp-link" style={{ color: '#e05353' }}>
                        {linkError || 'Falha na validação do link'}
                      </span>
                    )}
                    {(linkStatus === 'gerado' || linkStatus === 'confirmado') && (
                      <span className="rp-link" style={{ color: '#56c288' }}>
                        {affiliateLink}
                      </span>
                    )}
                  </p>
                </div>
                <p className="rp-sub" style={{ marginTop: 8 }}>
                  Status do link:{' '}
                  <strong style={{ color: linkStatus === 'confirmado' ? '#56c288' : linkStatus === 'erro' ? '#e05353' : '#aab2b7' }}>
                    {linkStatus === 'confirmado'
                      ? 'Confirmado pela integração'
                      : linkStatus === 'gerado'
                      ? 'Link gerado (validação disponível)'
                      : linkStatus === 'convertendo'
                      ? 'Em processamento'
                      : linkStatus === 'erro'
                      ? 'Falha na conversão'
                      : 'Ausente'}
                  </strong>
                </p>
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
                      <option value="" disabled>
                        Nenhum grupo de destino encontrado
                      </option>
                    )}
                  </select>
                </label>

                <div className="rp-footer">
                  <button
                    type="button"
                    className="rp-btn rp-primary"
                    onClick={handleContinueToSchedule}
                  >
                    Escolher envio →
                  </button>
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
                  Preço destacado (R$)
                  <input
                    value={storyPrice}
                    onChange={(e) => setStoryPrice(e.target.value)}
                  />
                </label>

                <label className="rp-field">
                  Cupom
                  <input
                    value={storyCoupon}
                    onChange={(e) => setStoryCoupon(e.target.value)}
                  />
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
                  disabled={exportingStory}
                  onClick={handleExportStory}
                >
                  {exportingStory ? 'Exportando imagem...' : 'Exportar imagem 9:16'}
                </button>
              </div>

              <div className="rp-story">
                <div className="rp-product-photo rp-p1" role="img" aria-label="Story de produto" />
                <div className="rp-story-caption">
                  <small>RADAR DE OFERTAS</small>
                  <p>{storyTitle}</p>
                  {showStoryPrice && (
                    <>
                      <strong>R$ {storyPrice}</strong>
                      {storyCoupon && <small>CUPOM {storyCoupon}</small>}
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
                  {templates.map((tpl) => (
                    <div key={tpl.key} className="rp-list-item">
                      <div className="rp-list-copy">
                        <strong>{tpl.name}</strong>
                        <p>{tpl.body.slice(0, 40)}...</p>
                      </div>
                      {activeTemplateKey === tpl.key ? (
                        <span className="rp-tag rp-good">Em edição</span>
                      ) : (
                        <button
                          type="button"
                          className="rp-btn"
                          onClick={() => handleSelectTemplate(tpl.key)}
                        >
                          Editar
                        </button>
                      )}
                    </div>
                  ))}
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
                  onClick={handleSaveTemplate}
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
