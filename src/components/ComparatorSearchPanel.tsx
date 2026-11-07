'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Award,
  Truck,
  Star,
  ShoppingBag,
  Tag,
  Send,
  RefreshCw,
  Info,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { PlanGateCard } from '@/components/PlanGateCard';

interface ComparatorOfferItem {
  id: string;
  store: 'mercadolivre' | 'shopee' | 'amazon' | 'netshoes' | 'magalu';
  storeDisplayName: string;
  title: string;
  price: number;
  originalPrice: number | null;
  discountPct: number | null;
  freeShipping: boolean | null;
  shippingLabel: string;
  rating: number | null;
  reviewsCount: number | null;
  soldCount: number | null;
  couponText: string | null;
  imageUrl: string | null;
  productUrl: string;
  affiliateUrl: string;
  isAffiliateLinkVerified: boolean;
  commissionRatePct: number | null;
  dataSourceLabel: string;
  costBenefitScore: number;
  isBestValue: boolean;
  bestValueReason: string | null;
}

interface StoreSearchDiagnostic {
  store: string;
  displayName: string;
  status: 'ok' | 'requires_credentials' | 'catalog_only' | 'error';
  resultsCount: number;
  sourceUsed: string;
  message: string;
}

interface ComparatorSearchResult {
  rawQuery: string;
  effectiveQuery: string;
  didYouMean: string | null;
  autoCorrected: boolean;
  fromCache: boolean;
  cachedAt: string;
  cacheTtlSeconds: number;
  bestOfferId: string | null;
  offers: ComparatorOfferItem[];
  storeDiagnostics: StoreSearchDiagnostic[];
}

const TYPO_TEST_CHIPS = [
  { label: 'Testar erro: "bulsa" → blusa', query: 'bulsa' },
  { label: 'Testar erro: "cadado" → cadeado', query: 'cadado' },
  { label: 'Testar erro: "fritadera" → air fryer', query: 'fritadera' },
  { label: 'Fone Bluetooth', query: 'fone de ouvido bluetooth' },
  { label: 'Cafeteira Expresso', query: 'cafeteira expresso' },
];

export function ComparatorSearchPanel() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComparatorSearchResult | null>(null);

  const executeSearch = async (searchQuery: string, forceRefresh = false) => {
    const q = searchQuery.trim();
    if (!q) {
      setError('Digite o nome de um produto para buscar e comparar.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/comparator/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, forceRefresh }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Não foi possível realizar a busca comparadora.');
        setResult(null);
      } else {
        setResult(data.result);
      }
    } catch {
      setError('Erro de conexão ao consultar o Buscador Comparador.');
    } finally {
      setLoading(false);
    }
  };

  // Transporta a oferta escolhida diretamente para o Estúdio (/criar-conteudo) com o link de afiliado certo
  const handlePostThisOffer = (offer: ComparatorOfferItem) => {
    try {
      localStorage.setItem(
        'radar_draft_offer',
        JSON.stringify({
          productUrl: offer.productUrl,
          offerTitle: offer.title,
          offerOriginalPrice: offer.originalPrice ? String(offer.originalPrice) : '',
          offerPrice: String(offer.price),
          offerCoupon: offer.couponText || '',
          offerImageUrl: offer.imageUrl || '',
          affiliateLink: offer.affiliateUrl,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch {}

    router.push('/criar-conteudo?aba=oferta-link');
  };

  return (
    <PlanGateCard
      feature="comparator_search"
      requiredPlan="ultimate"
      title="Buscador Comparador Multiloja Tolerante a Erros (Exclusivo Ultimate)"
      description="Compare preços, frete, avaliações, volume de vendas e cupons lado a lado entre as lojas usando fontes oficiais, correção ortográfica inteligente (pg_trgm + unaccent), destaque automático de melhor custo-benefício e botão 'Postar esta oferta' em 1 clique."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Barra de Busca e Chips de Teste */}
        <div className="rp-panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>
                🔎 Buscador Comparador Lado a Lado
              </h2>
              <p className="rp-sub" style={{ marginTop: 4 }}>
                Busca tolerante a erros de digitação (<code style={{ color: '#1CCAF2' }}>pg_trgm</code> +{' '}
                <code style={{ color: '#1CCAF2' }}>unaccent</code> + dicionário) com consulta em fontes oficiais e cache de 5 minutos.
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeSearch(query, false);
            }}
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 14,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Digite o produto (ex: bulsa, cadado, fone bluetooth, air fryer)..."
                style={{
                  width: '100%',
                  background: '#050E1C',
                  border: '1px solid #1E3A5F',
                  borderRadius: 10,
                  padding: '11px 14px',
                  color: '#F8FBFF',
                  fontSize: 14,
                }}
              />
            </div>

            <button
              type="submit"
              className="rp-btn rp-primary"
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 20px' }}
            >
              <Search size={16} />
              {loading ? 'Comparando lojas...' : 'Buscar e Comparar'}
            </button>

            {result && (
              <button
                type="button"
                className="rp-btn"
                disabled={loading}
                onClick={() => executeSearch(query, true)}
                title="Ignorar cache de 5 minutos e consultar APIs novamente"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <RefreshCw size={14} />
                Atualizar ao vivo
              </button>
            )}
          </form>

          {/* Atalhos para testar tolerância a erros de digitação */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#8EADC7', fontWeight: 600 }}>
              Testar busca rápida:
            </span>
            {TYPO_TEST_CHIPS.map((chip) => (
              <button
                key={chip.query}
                type="button"
                onClick={() => {
                  setQuery(chip.query);
                  executeSearch(chip.query, false);
                }}
                style={{
                  background: '#0B1728',
                  border: '1px solid #1C2E46',
                  borderRadius: 999,
                  padding: '4px 10px',
                  color: '#CBD5E1',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rp-panel" style={{ borderColor: '#EF4444', color: '#FCA5A5', padding: 16 }}>
            {error}
          </div>
        )}

        {/* Banner "Você quis dizer: ...?" */}
        {result && result.didYouMean && (
          <div
            style={{
              background: 'rgba(28, 202, 242, 0.1)',
              border: '1px solid rgba(28, 202, 242, 0.45)',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, color: '#E2E8F0' }}>
              💡 Você pesquisou por <strong>&quot;{result.rawQuery}&quot;</strong>.{' '}
              <span style={{ color: '#1CCAF2', fontWeight: 700 }}>
                Você quis dizer:{' '}
                <button
                  type="button"
                  onClick={() => {
                    setQuery(result.didYouMean!);
                    executeSearch(result.didYouMean!, false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#1CCAF2',
                    textDecoration: 'underline',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontSize: 13,
                    padding: 0,
                  }}
                >
                  {result.didYouMean}
                </button>
                ?
              </span>
              {result.autoCorrected && (
                <span style={{ marginLeft: 8, fontSize: 12, color: '#94A3B8' }}>
                  (Exibindo resultados corrigidos automaticamente para <strong>&quot;{result.effectiveQuery}&quot;</strong>)
                </span>
              )}
            </div>

            <span style={{ fontSize: 11, color: '#8EADC7' }}>
              {result.fromCache
                ? `⚡ Resposta em cache (válido por ${Math.round(result.cacheTtlSeconds / 60)} min)`
                : '🔄 Consulta ao vivo nas fontes oficiais'}
            </span>
          </div>
        )}

        {/* Transparência de Fontes Oficiais por Loja */}
        {result && (
          <div
            style={{
              background: '#081322',
              border: '1px solid #18283D',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Info size={16} className="text-[#1CCAF2]" />
              <strong style={{ fontSize: 13, color: '#F8FBFF' }}>
                Transparência das Fontes Oficiais Consultadas (Sem Scraping Frágil)
              </strong>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 10,
              }}
            >
              {result.storeDiagnostics.map((diag) => (
                <div
                  key={diag.store}
                  style={{
                    background: '#050C17',
                    border: '1px solid #15253B',
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <strong style={{ color: '#F8FBFF', fontSize: 12 }}>{diag.displayName}</strong>
                    <span
                      style={{
                        padding: '2px 7px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        background:
                          diag.status === 'ok'
                            ? 'rgba(32, 201, 151, 0.16)'
                            : diag.status === 'requires_credentials'
                            ? 'rgba(245, 158, 11, 0.16)'
                            : 'rgba(148, 163, 184, 0.14)',
                        color:
                          diag.status === 'ok'
                            ? '#20C997'
                            : diag.status === 'requires_credentials'
                            ? '#FBBF24'
                            : '#CBD5E1',
                      }}
                    >
                      {diag.resultsCount} oferta(s)
                    </span>
                  </div>
                  <div style={{ color: '#1CCAF2', marginBottom: 4, fontWeight: 600 }}>
                    Fonte: {diag.sourceUsed}
                  </div>
                  <div style={{ color: '#94A3B8', lineHeight: 1.4 }}>{diag.message}</div>
                  {diag.status === 'requires_credentials' && (
                    <Link
                      href="/conexoes"
                      style={{
                        display: 'inline-block',
                        marginTop: 6,
                        color: '#FBBF24',
                        textDecoration: 'underline',
                        fontWeight: 700,
                      }}
                    >
                      Conectar API Oficial em Conexões →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grade Comparativa Lado a Lado */}
        {result && (
          <div>
            {result.offers.length === 0 ? (
              <div className="rp-panel" style={{ textAlign: 'center', padding: 36 }}>
                <p className="rp-sub">
                  Nenhuma oferta encontrada nas fontes oficiais para &quot;{result.effectiveQuery}&quot;.
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                  gap: 16,
                }}
              >
                {result.offers.map((offer) => (
                  <div
                    key={offer.id}
                    style={{
                      background: offer.isBestValue
                        ? 'linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, #091526 35%)'
                        : '#091526',
                      border: offer.isBestValue
                        ? '2px solid #10B981'
                        : '1px solid #18283D',
                      borderRadius: 14,
                      padding: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                      position: 'relative',
                    }}
                  >
                    <div>
                      {/* Cabeçalho do Card: Selo de Melhor Custo-Benefício + Loja */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: '3px 9px',
                            borderRadius: 6,
                            background:
                              offer.store === 'shopee'
                                ? 'rgba(255, 87, 34, 0.18)'
                                : offer.store === 'mercadolivre'
                                ? 'rgba(255, 230, 0, 0.16)'
                                : 'rgba(28, 202, 242, 0.15)',
                            color:
                              offer.store === 'shopee'
                                ? '#FF7043'
                                : offer.store === 'mercadolivre'
                                ? '#FFE600'
                                : '#1CCAF2',
                            textTransform: 'uppercase',
                          }}
                        >
                          {offer.storeDisplayName}
                        </span>

                        {offer.isBestValue && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '3px 10px',
                              borderRadius: 999,
                              background: '#10B981',
                              color: '#04130D',
                              fontSize: 11,
                              fontWeight: 800,
                            }}
                          >
                            <Award size={13} />
                            MELHOR CUSTO-BENEFÍCIO
                          </span>
                        )}
                      </div>

                      {offer.isBestValue && offer.bestValueReason && (
                        <div
                          style={{
                            fontSize: 11,
                            color: '#6EE7B7',
                            marginBottom: 10,
                            fontWeight: 600,
                          }}
                        >
                          ✨ {offer.bestValueReason}
                        </div>
                      )}

                      {/* Foto do Produto */}
                      {offer.imageUrl && (
                        <div
                          style={{
                            width: '100%',
                            height: 170,
                            background: '#FFFFFF',
                            borderRadius: 10,
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 12,
                          }}
                        >
                          <img
                            src={offer.imageUrl}
                            alt={offer.title}
                            style={{ maxHeight: 160, maxWidth: '92%', objectFit: 'contain' }}
                          />
                        </div>
                      )}

                      <h3
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: '#F8FBFF',
                          lineHeight: 1.4,
                          margin: '0 0 10px',
                        }}
                      >
                        {offer.title}
                      </h3>

                      {/* Preço De / Por + Desconto */}
                      <div style={{ marginBottom: 10 }}>
                        {offer.originalPrice && offer.originalPrice > offer.price && (
                          <div style={{ fontSize: 12, color: '#64748B', textDecoration: 'line-through' }}>
                            De R$ {offer.originalPrice.toFixed(2).replace('.', ',')}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 24, fontWeight: 900, color: '#1CCAF2' }}>
                            R$ {offer.price.toFixed(2).replace('.', ',')}
                          </span>
                          {offer.discountPct && offer.discountPct > 0 && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: '#20C997',
                                background: 'rgba(32, 201, 151, 0.14)',
                                padding: '2px 7px',
                                borderRadius: 999,
                              }}
                            >
                              -{offer.discountPct}% OFF
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Frete, Avaliações, Vendas e Cupom */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#CBD5E1' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Truck size={13} style={{ color: offer.freeShipping ? '#20C997' : '#8EADC7' }} />
                          <span style={{ color: offer.freeShipping ? '#20C997' : '#CBD5E1', fontWeight: offer.freeShipping ? 700 : 400 }}>
                            {offer.shippingLabel}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          {offer.rating !== null && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#FBBF24' }}>
                              <Star size={13} /> {offer.rating}
                            </span>
                          )}
                          {offer.soldCount !== null && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#94A3B8' }}>
                              <ShoppingBag size={13} /> {offer.soldCount} vendidos
                            </span>
                          )}
                        </div>

                        {offer.couponText && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6EE7B7', fontWeight: 600 }}>
                            <Tag size={13} />
                            <span>{offer.couponText}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Rodapé do Card: Status do Link de Afiliado + Botão "Postar esta oferta" */}
                    <div style={{ borderTop: '1px solid #16263B', paddingTop: 12, marginTop: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 10 }}>
                        {offer.isAffiliateLinkVerified ? (
                          <span style={{ color: '#20C997', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={12} /> Link de afiliado pronto
                          </span>
                        ) : (
                          <span style={{ color: '#FBBF24', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle size={12} /> Link oficial (conecte sua tag p/ comissão)
                          </span>
                        )}
                        <span style={{ marginLeft: 'auto', color: '#64748B', fontSize: 10 }}>
                          {offer.dataSourceLabel}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="rp-btn rp-primary"
                        onClick={() => handlePostThisOffer(offer)}
                        style={{
                          width: '100%',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                        }}
                      >
                        <Send size={14} />
                        Postar esta oferta →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PlanGateCard>
  );
}

