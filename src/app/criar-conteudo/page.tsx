'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { WhatsAppGroup } from '@/lib/types';
import { AiCaptionGenerator } from '@/components/AiCaptionGenerator';
import { PlanGateCard } from '@/components/PlanGateCard';
import { usePlan } from '@/components/PlanProvider';
import { Lock, ShieldCheck, AlertTriangle, Send, Download, Image as ImageIcon, Sparkles } from 'lucide-react';

type LinkStatus = 'ausente' | 'convertendo' | 'erro' | 'gerado' | 'confirmado';

interface TemplateItem {
  key: string;
  name: string;
  body: string;
  isDefault?: boolean;
}

interface RealDealAuditResult {
  hasEnoughHistory: boolean;
  historyCount30d: number;
  minPrice30d: number | null;
  maxPrice30d: number | null;
  avgPrice30d: number | null;
  isLowestIn30d: boolean;
  isBelowAverage30d: boolean;
  isInflatedOriginalPrice: boolean;
  inflationReason: string | null;
  isRealDeal: boolean;
  badgeLabel: string | null;
  summaryText: string;
}

const DEFAULT_TEMPLATES: TemplateItem[] = [
  {
    key: 'Oferta essencial',
    name: 'Oferta essencial',
    body: 'Oferta verificada em destaque ✨\n*{titulo}*\n🔥 *Por {preco_por}*\n{link}',
    isDefault: true,
  },
  {
    key: 'Oferta com cupom',
    name: 'Oferta com cupom',
    body: '🔥 OFERTA COM CUPOM ATIVO!\n\n*{titulo}*\nDe: ~R$ {preco_de}~\n🔥 *Por {preco_por}*\n🎟️ Cupom: *{cupom}*\n\n🛒 Compre pelo link oficial:\n{link}',
  },
  {
    key: 'Texto curto',
    name: 'Texto curto',
    body: '*{titulo}*\n🔥 *Por {preco_por}*\n{link}',
  },
];

function CriarConteudoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get('aba');
  const { hasFeature } = usePlan();

  const canUseRealDealBadge = hasFeature('real_deal_badge');
  const canUseTelegram = hasFeature('telegram_posting');
  const canUseAutoCards = hasFeature('auto_image_cards');

  const parseTab = (val: string | null) => {
    if (val === 'ia' || val === 'legenda-ia') return 'ia';
    if (val === 'mensagem' || val === 'mensagem-livre') return 'mensagem';
    if (val === 'story' || val === 'cards') return 'story';
    if (val === 'templates') return 'templates';
    return 'oferta';
  };

  const [activeTab, setActiveTab] = useState<'oferta' | 'ia' | 'mensagem' | 'story' | 'templates'>(() =>
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
  const [offerOriginalPrice, setOfferOriginalPrice] = useState('');
  const [offerPrice, setOfferPrice] = useState('');
  const [offerCoupon, setOfferCoupon] = useState('');
  const [offerImageUrl, setOfferImageUrl] = useState('');
  const [offerTemplate, setOfferTemplate] = useState('Oferta essencial');
  const [converting, setConverting] = useState(false);
  const [affiliateLink, setAffiliateLink] = useState('');
  const [linkStatus, setLinkStatus] = useState<LinkStatus>('ausente');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submittingToReview, setSubmittingToReview] = useState(false);

  // Auditoria de Promoção Real (30 dias)
  const [auditingDeal, setAuditingDeal] = useState(false);
  const [dealAudit, setDealAudit] = useState<RealDealAuditResult | null>(null);
  const [dealAuditError, setDealAuditError] = useState<string | null>(null);

  // Envio direto para o Telegram
  const [sendingTelegram, setSendingTelegram] = useState(false);

  // Aba 2: Mensagem livre
  const [freeMessage, setFreeMessage] = useState(
    'Bom dia! ✨ Separamos novas oportunidades com desconto para vocês hoje. Fiquem atentos às próximas ofertas.'
  );
  const [freeImageUrl, setFreeImageUrl] = useState('');
  const [selectedDestGroup, setSelectedDestGroup] = useState('');
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);

  // Aba 3: Cards de Imagem Automáticos (Feed 1:1 & Story 9:16)
  const [cardFormat, setCardFormat] = useState<'story' | 'feed'>('story');
  const [storyTitle, setStoryTitle] = useState('Fone de Ouvido Bluetooth com Cancelamento Ativo');
  const [storyOriginalPrice, setStoryOriginalPrice] = useState('249,90');
  const [storyPrice, setStoryPrice] = useState('149,90');
  const [storyCoupon, setStoryCoupon] = useState('RADAR10');
  const [storyImageUrl, setStoryImageUrl] = useState('');
  const [exportingStory, setExportingStory] = useState(false);
  const [renderedCardDataUrl, setRenderedCardDataUrl] = useState<string | null>(null);
  const [renderedCardBadge, setRenderedCardBadge] = useState<string | null>(null);

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
        if (o.offerOriginalPrice) setOfferOriginalPrice(o.offerOriginalPrice);
        if (o.offerPrice) setOfferPrice(o.offerPrice);
        if (o.offerCoupon) setOfferCoupon(o.offerCoupon);
        if (o.offerImageUrl) setOfferImageUrl(o.offerImageUrl);
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
    setAffiliateLink('');
    setLinkStatus('ausente');
    setLinkError(null);
    setDealAudit(null);
    setDealAuditError(null);
  };

  // Auditoria de Selo de Promoção Real (30 dias)
  const runPromotionAudit = async (urlToAudit: string, curPriceStr: string, origPriceStr: string) => {
    const curPrice = Number(String(curPriceStr).replace(',', '.'));
    const origPrice = origPriceStr ? Number(String(origPriceStr).replace(',', '.')) : null;
    if (!urlToAudit || !Number.isFinite(curPrice) || curPrice <= 0) {
      return;
    }

    setAuditingDeal(true);
    setDealAuditError(null);
    try {
      const res = await fetch('/api/promotions/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productUrl: urlToAudit,
          currentPrice: curPrice,
          claimedOriginalPrice: origPrice,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setDealAudit(null);
        setDealAuditError(data.error || 'Não foi possível auditar o histórico de preços.');
      } else {
        setDealAudit(data.audit);
      }
    } catch {
      setDealAuditError('Erro de conexão ao consultar histórico de 30 dias.');
    } finally {
      setAuditingDeal(false);
    }
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
    setDealAudit(null);

    try {
      const res = await fetch('/api/converter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl.trim() }),
      });
      const data = await res.json();

      if (data.ok && data.data) {
        const nextTitle = data.data.title || offerTitle;
        const nextPrice = data.data.priceCurrent ? String(data.data.priceCurrent) : offerPrice;
        const nextOrig = data.data.priceOriginal ? String(data.data.priceOriginal) : offerOriginalPrice;
        const nextImg = data.data.imageUrl || offerImageUrl;

        if (data.data.title) {
          setOfferTitle(data.data.title);
          setStoryTitle(data.data.title);
        }
        if (data.data.priceCurrent) {
          setOfferPrice(String(data.data.priceCurrent));
          setStoryPrice(String(data.data.priceCurrent));
        }
        if (data.data.priceOriginal) {
          setOfferOriginalPrice(String(data.data.priceOriginal));
          setStoryOriginalPrice(String(data.data.priceOriginal));
        }
        if (data.data.imageUrl) {
          setOfferImageUrl(data.data.imageUrl);
          setStoryImageUrl(data.data.imageUrl);
        }

        if (data.data.affiliateUrl) {
          setAffiliateLink(data.data.affiliateUrl);
          setLinkStatus(data.data.isValidated ? 'confirmado' : 'gerado');
          setNotice('Link convertido e confirmado pela integração com sucesso!');
        } else {
          setLinkStatus('ausente');
          setNotice('Produto localizado, mas o link de afiliado não pôde ser gerado.');
        }

        if (canUseRealDealBadge && nextPrice) {
          await runPromotionAudit(productUrl.trim(), nextPrice, nextOrig);
        }
      } else {
        setLinkStatus('erro');
        setLinkError(data.error || 'Falha ao converter o link.');
        setNotice(data.error || 'Falha na conversão do link.');
      }
    } catch {
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
          offerOriginalPrice,
          offerPrice,
          offerCoupon,
          offerImageUrl,
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
    const deLine =
      offerOriginalPrice && !dealAudit?.isInflatedOriginalPrice
        ? `De ~R$ ${offerOriginalPrice}~\n`
        : '';
    const badgeLine = dealAudit?.badgeLabel ? `✅ *${dealAudit.badgeLabel.toUpperCase()}*\n\n` : '';
    const compiledMessage = `${badgeLine}*${offerTitle}*\n${deLine}🔥 *Por R$ ${offerPrice || '0,00'}*\n${offerCoupon ? `🎟️ Cupom: *${offerCoupon}*\n` : ''}\n🛒 Compre aqui:\n${affiliateLink || productUrl}`;

    try {
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
            mediaUrl: offerImageUrl || undefined,
            mediaType: offerImageUrl ? 'image' : 'none',
            affiliateUrl: affiliateLink || productUrl,
            status: 'aguardando_aprovacao',
            scheduledFor: new Date().toISOString(),
          },
        }),
      });
      const data = await res.json();

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

      router.push('/envios?aba=revisao');
    } catch {
      setNotice('Erro ao enviar oferta para a revisão.');
    } finally {
      setSubmittingToReview(false);
    }
  };

  // Publicar diretamente no Telegram via API Oficial
  const handleSendToTelegram = async () => {
    if (!offerTitle.trim()) {
      setNotice('Informe o título do produto antes de publicar no Telegram.');
      return;
    }

    setSendingTelegram(true);
    setNotice(null);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          title: offerTitle.trim(),
          price: Number(String(offerPrice).replace(',', '.')) || 0,
          originalPrice:
            offerOriginalPrice && !dealAudit?.isInflatedOriginalPrice
              ? Number(String(offerOriginalPrice).replace(',', '.'))
              : undefined,
          couponCode: offerCoupon.trim() || undefined,
          affiliateUrl: affiliateLink || productUrl,
          imageUrl: offerImageUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setNotice(data.error || 'Falha ao publicar no Telegram. Verifique sua conexão em Conexões → Telegram.');
      } else {
        setNotice(`✅ Oferta publicada no Telegram com sucesso! (Message ID: ${data.messageId || 'enviado'})`);
      }
    } catch {
      setNotice('Erro de rede ao publicar oferta no Telegram.');
    } finally {
      setSendingTelegram(false);
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

  // Renderização e Download de Card Automático (Feed 1:1 ou Story 9:16) via Servidor com Marca d'Água
  const handleRenderAndDownloadCard = async (downloadImmediately: boolean) => {
    if (!storyTitle.trim()) {
      setNotice('Informe o título do produto para gerar o card.');
      return;
    }

    setExportingStory(true);
    setNotice(null);

    try {
      const res = await fetch('/api/cards/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: cardFormat,
          title: storyTitle.trim(),
          currentPrice: storyPrice,
          originalPrice: storyOriginalPrice,
          coupon: storyCoupon.trim(),
          imageUrl: storyImageUrl.trim() || offerImageUrl.trim() || undefined,
          productUrl: productUrl.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setNotice(data.error || 'Falha ao gerar o card de imagem no servidor.');
        return;
      }

      setRenderedCardDataUrl(data.dataUrl);
      setRenderedCardBadge(data.realDealBadge || null);

      if (downloadImmediately && data.dataUrl) {
        const a = document.createElement('a');
        a.href = data.dataUrl;
        a.download = `card-${cardFormat}-radar-ofertas-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setNotice(
          `Card ${cardFormat === 'feed' ? 'Feed (1080×1080)' : 'Story (1080×1920)'} com marca d’água baixado com sucesso!`
        );
      } else {
        setNotice(
          `Prévia do Card ${cardFormat === 'feed' ? 'Feed (1:1)' : 'Story (9:16)'} atualizada com sua marca d’água!`
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setNotice('Erro ao gerar card: ' + msg);
    } finally {
      setExportingStory(false);
    }
  };

  // Salvar Template no Storage
  const handleSaveTemplate = () => {
    if (!templateName.trim() || !templateBody.trim()) {
      setNotice('Informe o nome e o corpo do template.');
      return;
    }

    const updated = templates.map((t) =>
      t.key === activeTemplateKey ? { ...t, name: templateName, body: templateBody } : t
    );

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

  const handleSelectTab = (tab: 'oferta' | 'ia' | 'mensagem' | 'story' | 'templates') => {
    setActiveTab(tab);
    const mapped =
      tab === 'oferta'
        ? 'oferta-link'
        : tab === 'ia'
        ? 'legenda-ia'
        : tab === 'mensagem'
        ? 'mensagem-livre'
        : tab;
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
          <p>Transforme uma oferta em mensagem, card Feed/Story ou disparo multicanal com a sua marca.</p>
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
            aria-selected={activeTab === 'ia'}
            onClick={() => handleSelectTab('ia')}
          >
            ✨ Legenda com IA
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
            🖼️ Cards (Feed &amp; Story)
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

        {/* Painel IA: Gerador de legenda com IA */}
        {activeTab === 'ia' && (
          <div data-panel="ia" role="tabpanel">
            <AiCaptionGenerator
              initialTitle={offerTitle}
              initialPrice={offerPrice}
              initialCoupon={offerCoupon}
              initialAffiliateUrl={affiliateLink || productUrl}
            />
          </div>
        )}

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
                    placeholder="Cole a URL crua do produto (Shopee, Mercado Livre, Amazon...)"
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
                    Preço &quot;De&quot; anunciado (R$ opcional)
                    <input
                      id="rp-offer-original-price"
                      type="number"
                      value={offerOriginalPrice}
                      min="0"
                      step="0.01"
                      placeholder="Ex: 249.90"
                      onChange={(e) => setOfferOriginalPrice(e.target.value)}
                    />
                  </label>
                  <label className="rp-field">
                    Preço atual &quot;Por&quot; (R$)
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
                </div>

                <div className="rp-grid">
                  <label className="rp-field">
                    Cupom
                    <input
                      id="rp-offer-coupon"
                      value={offerCoupon}
                      placeholder="Ex: PROMO10"
                      onChange={(e) => setOfferCoupon(e.target.value)}
                    />
                  </label>
                  <label className="rp-field">
                    URL da foto do produto (opcional)
                    <input
                      type="url"
                      value={offerImageUrl}
                      placeholder="https://..."
                      onChange={(e) => setOfferImageUrl(e.target.value)}
                    />
                  </label>
                </div>

                {/* SELO DE PROMOÇÃO REAL (30 DIAS) & DETECTOR DE PREÇO "DE" INFLADO */}
                <div
                  style={{
                    marginTop: 14,
                    marginBottom: 14,
                    padding: 14,
                    borderRadius: 12,
                    background: '#081526',
                    border: '1px solid #1C314B',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ShieldCheck size={18} style={{ color: '#20C997' }} />
                      <div>
                        <strong style={{ fontSize: 13, color: '#F8FBFF', display: 'block' }}>
                          Selo de Promoção Real (30 dias) &amp; Detector de Preço Inflado
                        </strong>
                        <span style={{ fontSize: 11, color: '#8EADC7' }}>
                          Compara o preço atual e o preço &quot;De&quot; com o histórico real da tabela price_history.
                        </span>
                      </div>
                    </div>

                    {canUseRealDealBadge ? (
                      <button
                        type="button"
                        className="rp-btn"
                        disabled={auditingDeal || !productUrl.trim() || !offerPrice.trim()}
                        onClick={() => runPromotionAudit(productUrl.trim(), offerPrice, offerOriginalPrice)}
                        style={{ fontSize: 12, padding: '6px 12px' }}
                      >
                        {auditingDeal ? 'Auditando 30d...' : 'Verificar histórico (30d)'}
                      </button>
                    ) : (
                      <Link
                        href="/planos"
                        className="rp-btn"
                        style={{
                          fontSize: 11,
                          padding: '5px 10px',
                          color: '#fbbf24',
                          borderColor: 'rgba(245, 158, 11, 0.4)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Lock size={12} /> Exclusivo Plus e Ultimate
                      </Link>
                    )}
                  </div>

                  {dealAuditError && (
                    <p style={{ margin: '10px 0 0', fontSize: 12, color: '#FCA5A5' }}>{dealAuditError}</p>
                  )}

                  {dealAudit && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Sem histórico suficiente -> não mostra selo */}
                      {!dealAudit.hasEnoughHistory && (
                        <div
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: 'rgba(148, 163, 184, 0.1)',
                            border: '1px solid rgba(148, 163, 184, 0.25)',
                            color: '#CBD5E1',
                            fontSize: 12,
                          }}
                        >
                          ℹ️ <strong>Sem selo exibido:</strong> {dealAudit.summaryText}
                        </div>
                      )}

                      {/* Alerta de Preço "De" Inflado */}
                      {dealAudit.isInflatedOriginalPrice && (
                        <div
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            background: 'rgba(239, 68, 68, 0.14)',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            color: '#FCA5A5',
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                          }}
                        >
                          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2, color: '#F87171' }} />
                          <div>
                            <strong>Preço &quot;De&quot; inflado detectado (&quot;metade do dobro&quot;)!</strong>
                            <div style={{ marginTop: 2 }}>{dealAudit.inflationReason}</div>
                            <div style={{ marginTop: 4, fontSize: 11, color: '#FECACA' }}>
                              O preço &quot;De&quot; foi suprimido automaticamente da mensagem e o selo de promoção foi bloqueado.
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Selo de Promoção Real confirmado */}
                      {dealAudit.isRealDeal && dealAudit.badgeLabel && (
                        <div
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            background: 'rgba(16, 185, 129, 0.14)',
                            border: '1px solid rgba(16, 185, 129, 0.45)',
                            color: '#6EE7B7',
                            fontSize: 12,
                          }}
                        >
                          <strong>✅ Selo liberado: {dealAudit.badgeLabel}</strong>
                          <div style={{ marginTop: 3, color: '#A7F3D0' }}>{dealAudit.summaryText}</div>
                        </div>
                      )}

                      {/* Histórico suficiente, mas preço atual está normal/acima da média */}
                      {dealAudit.hasEnoughHistory && !dealAudit.isRealDeal && !dealAudit.isInflatedOriginalPrice && (
                        <div
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: 'rgba(245, 158, 11, 0.12)',
                            border: '1px solid rgba(245, 158, 11, 0.35)',
                            color: '#FDE68A',
                            fontSize: 12,
                          }}
                        >
                          📊 {dealAudit.summaryText} (Selo oculto pois não está abaixo da média de 30 dias).
                        </div>
                      )}
                    </div>
                  )}
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

                <div className="rp-footer" style={{ flexWrap: 'wrap', gap: 10 }}>
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
                    {submittingToReview ? 'Preparando envio...' : 'Enviar p/ WhatsApp →'}
                  </button>

                  {canUseTelegram ? (
                    <button
                      className="rp-btn"
                      type="button"
                      disabled={sendingTelegram}
                      onClick={handleSendToTelegram}
                      style={{
                        borderColor: '#38bdf8',
                        color: '#38bdf8',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Send size={14} />
                      {sendingTelegram ? 'Enviando ao Telegram...' : 'Publicar no Telegram'}
                    </button>
                  ) : (
                    <Link
                      href="/planos"
                      className="rp-btn"
                      style={{
                        fontSize: 12,
                        color: '#fbbf24',
                        borderColor: 'rgba(245, 158, 11, 0.4)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Lock size={13} /> Telegram (Plus)
                    </Link>
                  )}

                  <span
                    className="rp-tag"
                    title="Integração direta com Instagram Graph API em desenvolvimento"
                    style={{ opacity: 0.75, fontSize: 11 }}
                  >
                    📸 Instagram (Em breve)
                  </span>
                </div>
              </div>

              <div className="rp-panel">
                <h2>Prévia no WhatsApp e Canais</h2>
                <div className="rp-message rp-section">
                  {offerImageUrl ? (
                    <div
                      style={{
                        marginBottom: 10,
                        maxHeight: 210,
                        overflow: 'hidden',
                        borderRadius: 8,
                        background: '#ffffff',
                        display: 'flex',
                        justifyContent: 'center',
                      }}
                    >
                      <img
                        src={offerImageUrl}
                        alt={offerTitle || 'Prévia do produto'}
                        style={{ maxHeight: 210, objectFit: 'contain' }}
                      />
                    </div>
                  ) : (
                    <div
                      className="rp-product-photo rp-p1"
                      role="img"
                      aria-label={offerTitle || 'Prévia do produto'}
                    />
                  )}

                  {dealAudit?.badgeLabel && (
                    <div
                      style={{
                        display: 'inline-block',
                        marginBottom: 8,
                        padding: '3px 10px',
                        borderRadius: 999,
                        background: 'rgba(16, 185, 129, 0.2)',
                        border: '1px solid #10b981',
                        color: '#6ee7b7',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      ✅ {dealAudit.badgeLabel}
                    </div>
                  )}

                  <p>
                    <strong id="rp-live-title">
                      {offerTitle || 'Título da oferta aparecerá aqui'}
                    </strong>
                    <br />
                    {offerOriginalPrice && !dealAudit?.isInflatedOriginalPrice && (
                      <>
                        <span style={{ textDecoration: 'line-through', opacity: 0.65 }}>
                          De R$ {offerOriginalPrice}
                        </span>
                        <br />
                      </>
                    )}
                    🔥 Por{' '}
                    <strong id="rp-live-price">
                      {offerPrice ? `R$ ${offerPrice}` : 'R$ --,--'}
                    </strong>
                    <br />
                    {offerCoupon && (
                      <>
                        🎟️ Cupom: <span id="rp-live-coupon">{offerCoupon}</span>
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

        {/* Painel 3: Cards de Imagem Automáticos (Feed 1:1 e Story 9:16) */}
        {activeTab === 'story' && (
          <div data-panel="story" role="tabpanel">
            <PlanGateCard
              feature="auto_image_cards"
              requiredPlan="plus"
              title="Gerador de Cards Automáticos (Feed 1:1 e Story 9:16)"
              description="Gere cards de alta resolução prontos para Feed (1080×1080) e Stories/Status (1080×1920) com foto do produto, comparativo De/Por, cupom, selo de Promoção Real e sua marca d'água oficial. Disponível nos planos Plus e Ultimate."
            >
              <div className="rp-split">
                <div className="rp-panel">
                  <h2>Cards Automáticos de Oferta</h2>
                  <p className="rp-sub">
                    Escolha o formato (Feed 1:1 ou Story 9:16). O card já sai com sua marca d&apos;água e selo de Promoção Real (quando houver histórico de 30 dias).
                  </p>

                  {/* Seletor de Formato: Feed (1:1) vs Story (9:16) */}
                  <div style={{ display: 'flex', gap: 10, marginTop: 12, marginBottom: 14 }}>
                    <button
                      type="button"
                      className={`rp-btn ${cardFormat === 'story' ? 'rp-primary' : ''}`}
                      onClick={() => setCardFormat('story')}
                      style={{ flex: 1 }}
                    >
                      📱 Story / Status (9:16 · 1080×1920)
                    </button>
                    <button
                      type="button"
                      className={`rp-btn ${cardFormat === 'feed' ? 'rp-primary' : ''}`}
                      onClick={() => setCardFormat('feed')}
                      style={{ flex: 1 }}
                    >
                      🖼️ Feed Quadrado (1:1 · 1080×1080)
                    </button>
                  </div>

                  <label className="rp-field">
                    Título do produto
                    <input
                      value={storyTitle}
                      onChange={(e) => setStoryTitle(e.target.value)}
                      placeholder="Ex: Fritadeira Elétrica Air Fryer 4L"
                    />
                  </label>

                  <div className="rp-grid">
                    <label className="rp-field">
                      Preço &quot;De&quot; (R$ opcional)
                      <input
                        value={storyOriginalPrice}
                        onChange={(e) => setStoryOriginalPrice(e.target.value)}
                        placeholder="Ex: 399,90"
                      />
                    </label>
                    <label className="rp-field">
                      Preço &quot;Por&quot; (R$)
                      <input
                        value={storyPrice}
                        onChange={(e) => setStoryPrice(e.target.value)}
                        placeholder="Ex: 249,90"
                      />
                    </label>
                  </div>

                  <div className="rp-grid">
                    <label className="rp-field">
                      Cupom (opcional)
                      <input
                        value={storyCoupon}
                        onChange={(e) => setStoryCoupon(e.target.value)}
                        placeholder="Ex: RADAR10"
                      />
                    </label>
                    <label className="rp-field">
                      URL da foto do produto (opcional)
                      <input
                        type="url"
                        value={storyImageUrl}
                        onChange={(e) => setStoryImageUrl(e.target.value)}
                        placeholder="Cole a URL da imagem do produto..."
                      />
                    </label>
                  </div>

                  <div className="rp-footer" style={{ gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                    <button
                      className="rp-btn"
                      type="button"
                      disabled={exportingStory || !canUseAutoCards}
                      onClick={() => handleRenderAndDownloadCard(false)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Sparkles size={15} />
                      {exportingStory ? 'Renderizando...' : 'Atualizar prévia'}
                    </button>

                    <button
                      className="rp-btn rp-primary"
                      type="button"
                      disabled={exportingStory || !canUseAutoCards}
                      onClick={() => handleRenderAndDownloadCard(true)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Download size={15} />
                      {exportingStory
                        ? 'Gerando PNG...'
                        : `Baixar Card ${cardFormat === 'feed' ? 'Feed (1:1)' : 'Story (9:16)'}`}
                    </button>
                  </div>
                </div>

                <div className="rp-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h2 style={{ margin: 0 }}>
                      Prévia ({cardFormat === 'feed' ? 'Feed 1:1' : 'Story 9:16'})
                    </h2>
                    {renderedCardBadge && (
                      <span className="rp-tag rp-good">✅ {renderedCardBadge}</span>
                    )}
                  </div>

                  {renderedCardDataUrl ? (
                    <div
                      style={{
                        maxWidth: cardFormat === 'feed' ? 380 : 300,
                        width: '100%',
                        borderRadius: 14,
                        overflow: 'hidden',
                        border: '1px solid #1CCAF2',
                        boxShadow: '0 14px 32px rgba(0,0,0,0.45)',
                      }}
                    >
                      <img
                        src={renderedCardDataUrl}
                        alt="Card renderizado com marca d'água"
                        style={{ width: '100%', height: 'auto', display: 'block' }}
                      />
                    </div>
                  ) : (
                    <div
                      className="rp-story"
                      style={{
                        aspectRatio: cardFormat === 'feed' ? '1 / 1' : '9 / 16',
                        maxWidth: cardFormat === 'feed' ? 360 : 280,
                        width: '100%',
                      }}
                    >
                      <div className="rp-product-photo rp-p1" role="img" aria-label="Prévia do card" />
                      <div className="rp-story-caption">
                        <small>RADAR DE OFERTAS</small>
                        <p>{storyTitle}</p>
                        {storyOriginalPrice && (
                          <small style={{ textDecoration: 'line-through', opacity: 0.7 }}>
                            De R$ {storyOriginalPrice}
                          </small>
                        )}
                        <strong>Por R$ {storyPrice}</strong>
                        {storyCoupon && <small>🎟️ CUPOM: {storyCoupon}</small>}
                        <small style={{ marginTop: 6, opacity: 0.75, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ImageIcon size={12} /> Clique em &quot;Atualizar prévia&quot; ou &quot;Baixar Card&quot; para gerar o PNG oficial
                        </small>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </PlanGateCard>
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
                  Campos disponíveis: &#123;titulo&#125;, &#123;preco_de&#125;, &#123;preco_por&#125;, &#123;cupom&#125; e &#123;link&#125;.
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
