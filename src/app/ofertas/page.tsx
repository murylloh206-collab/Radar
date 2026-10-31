'use client';

import React, { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProductItem } from '@/lib/types';

function OfertasContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get('aba');

  const parseTab = (val: string | null) => {
    if (val === 'busca' || val === 'busca-automatica') return 'busca';
    if (val === 'curadoria') return 'curadoria';
    return 'catalogo';
  };

  const [activeTab, setActiveTab] = useState<'catalogo' | 'busca' | 'curadoria'>(() =>
    parseTab(initialTabParam)
  );

  useEffect(() => {
    if (initialTabParam) {
      setActiveTab(parseTab(initialTabParam));
    }
  }, [initialTabParam]);

  // Aba 1: Catálogo
  const [searchTerm, setSearchTerm] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Aba 2: Busca automática
  const [searchActive, setSearchActive] = useState(false);
  const [primaryStore, setPrimaryStore] = useState('Shopee');
  const [categories, setCategories] = useState('Tecnologia, casa e conforto');
  const [searchInterval, setSearchInterval] = useState('A cada 30 minutos');
  const [sendToReview, setSendToReview] = useState(true);

  // Aba 3: Curadoria
  const [interests, setInterests] = useState(
    'Produtos úteis para casa, tecnologia acessível e conforto no dia a dia.'
  );
  const [minRating, setMinRating] = useState('4.5');
  const [minReviews, setMinReviews] = useState('100');
  const [offersPerDay, setOffersPerDay] = useState('10');
  const [noRepeatDays, setNoRepeatDays] = useState('7');
  const [alternateCategories, setAlternateCategories] = useState(true);
  const [reviewMissingInfo, setReviewMissingInfo] = useState(true);

  const [notice, setNotice] = useState<string | null>(null);

  // Carregar produtos
  useEffect(() => {
    setLoadingProducts(true);
    fetch('/api/products')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.products)) {
          setProducts(data.products);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  // Carregar dados de automação
  useEffect(() => {
    fetch('/api/automation')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.queueCampaigns && data.queueCampaigns.length > 0) {
          const q = data.queueCampaigns[0];
          setSearchActive(Boolean(q.isActive));
          if (q.storeName) setPrimaryStore(q.storeName);
          if (q.minRating) setMinRating(String(q.minRating));
          if (q.minReviews) setMinReviews(String(q.minReviews));
        }
      })
      .catch(() => {});
  }, []);

  // Produtos filtrados
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchStore = storeFilter === 'all' || p.storeName === storeFilter;
      const matchSearch =
        !searchTerm.trim() ||
        p.title.toLowerCase().includes(searchTerm.toLowerCase().trim());
      return matchStore && matchSearch;
    });
  }, [products, storeFilter, searchTerm]);

  const handleSelectTab = (tab: 'catalogo' | 'busca' | 'curadoria') => {
    setActiveTab(tab);
    const mapped = tab === 'busca' ? 'busca-automatica' : tab;
    router.replace(`/ofertas?aba=${mapped}`, { scroll: false });
  };

  const handleSaveSearch = async () => {
    try {
      const res = await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_queue',
          queueData: {
            name: 'Busca Automática Radar',
            storeName: primaryStore.toLowerCase(),
            isActive: searchActive,
            minRating: parseFloat(minRating) || 4.5,
            minReviews: parseInt(minReviews, 10) || 100,
          },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setNotice('Preferências de busca automática salvas com sucesso!');
      } else {
        setNotice('Falha ao salvar preferências.');
      }
    } catch {
      setNotice('Erro de rede ao salvar preferências.');
    }
  };

  const handleSaveCurator = async () => {
    setNotice('Critérios de curadoria salvos com sucesso!');
  };

  return (
    <section className="rp-page" aria-label="Ofertas">
      {/* Cabeçalho da página */}
      <div className="rp-head">
        <div>
          <span className="rp-step">Descobertas</span>
          <h1>Ofertas</h1>
          <p>Organize seu catálogo e defina o que vale compartilhar.</p>
        </div>
        <Link href="/criar-conteudo" className="rp-btn rp-primary">
          Adicionar por link
        </Link>
      </div>

      {notice && (
        <div className="rp-panel rp-section" style={{ borderColor: '#39bee6' }}>
          <p>{notice}</p>
        </div>
      )}

      {/* Abas */}
      <div data-tab-group="offers">
        <div className="rp-tabs" role="tablist" aria-label="Área de ofertas">
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'catalogo'}
            onClick={() => handleSelectTab('catalogo')}
          >
            Catálogo
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'busca'}
            onClick={() => handleSelectTab('busca')}
          >
            Busca automática
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={activeTab === 'curadoria'}
            onClick={() => handleSelectTab('curadoria')}
          >
            Curadoria
          </button>
        </div>

        {/* Aba 1: Catálogo */}
        {activeTab === 'catalogo' && (
          <div data-panel="catalogo" role="tabpanel">
            <div className="rp-grid">
              <label className="rp-field">
                Buscar produto
                <input
                  id="rp-catalog-search"
                  type="search"
                  placeholder="Nome do produto"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </label>

              <label className="rp-field">
                Loja
                <select
                  id="rp-catalog-store"
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                >
                  <option value="all">Todas as lojas</option>
                  <option value="shopee">Shopee</option>
                  <option value="amazon">Amazon</option>
                  <option value="mercadolivre">Mercado Livre</option>
                  <option value="netshoes">Netshoes</option>
                </select>
              </label>
            </div>

            {loadingProducts ? (
              <p className="rp-sub rp-section">Carregando catálogo...</p>
            ) : filteredProducts.length === 0 ? (
              /* Fallback com os 3 cards do protótipo se não houver produtos reais ainda */
              <div className="rp-three rp-section" id="rp-catalog">
                <div className="rp-panel rp-catalog-card">
                  <div className="rp-product-photo rp-p1" role="img" aria-label="Fone bege" />
                  <p className="rp-sub">Shopee · Exemplo</p>
                  <h3>Fone sem fio</h3>
                  <p className="rp-price">R$ 149,90</p>
                  <span className="rp-tag">Em revisão</span>
                  <Link href="/criar-conteudo" className="rp-btn rp-section">
                    Criar postagem
                  </Link>
                </div>

                <div className="rp-panel rp-catalog-card">
                  <div className="rp-product-photo rp-p2" role="img" aria-label="Almofada de linho" />
                  <p className="rp-sub">Amazon · Exemplo</p>
                  <h3>Almofada de linho</h3>
                  <p className="rp-price">R$ 69,90</p>
                  <span className="rp-tag rp-warn">Validar link</span>
                  <Link href="/criar-conteudo" className="rp-btn rp-section">
                    Criar postagem
                  </Link>
                </div>

                <div className="rp-panel rp-catalog-card">
                  <div className="rp-product-photo rp-p3" role="img" aria-label="Luminária de mesa" />
                  <p className="rp-sub">Shopee · Exemplo</p>
                  <h3>Luminária de mesa</h3>
                  <p className="rp-price">R$ 119,90</p>
                  <span className="rp-tag">Em revisão</span>
                  <Link href="/criar-conteudo" className="rp-btn rp-section">
                    Criar postagem
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rp-three rp-section" id="rp-catalog">
                {filteredProducts.map((p, idx) => {
                  const photoClass = idx % 3 === 0 ? 'rp-p1' : idx % 3 === 1 ? 'rp-p2' : 'rp-p3';
                  return (
                    <div key={p.id} className="rp-panel rp-catalog-card">
                      <div className={`rp-product-photo ${photoClass}`} role="img" aria-label={p.title} />
                      <p className="rp-sub">
                        {p.storeName.toUpperCase()} · Avaliação {p.rating || '4.8'}
                      </p>
                      <h3>{p.title}</h3>
                      <p className="rp-price">
                        R$ {p.currentPrice?.toFixed(2).replace('.', ',')}
                      </p>
                      <span className="rp-tag rp-good">Apto</span>
                      <Link
                        href={`/criar-conteudo?aba=oferta-link`}
                        className="rp-btn rp-section"
                      >
                        Criar postagem
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Aba 2: Busca automática */}
        {activeTab === 'busca' && (
          <div data-panel="busca" role="tabpanel">
            <div className="rp-banner">
              <span>
                Busca automática{' '}
                <strong id="rp-search-state">
                  {searchActive ? 'ativa' : 'pausada'}
                </strong>
              </span>
              <button
                className="rp-btn"
                id="rp-toggle-search"
                type="button"
                onClick={() => setSearchActive(!searchActive)}
              >
                {searchActive ? 'Pausar busca' : 'Ativar busca'}
              </button>
            </div>

            <div className="rp-split">
              <div className="rp-panel">
                <h2>Onde buscar</h2>

                <label className="rp-field">
                  Loja principal
                  <select
                    value={primaryStore}
                    onChange={(e) => setPrimaryStore(e.target.value)}
                  >
                    <option value="Shopee">Shopee</option>
                    <option value="Mercado Livre">Mercado Livre</option>
                    <option value="Netshoes">Netshoes</option>
                    <option value="Amazon">Amazon</option>
                  </select>
                </label>

                <label className="rp-field">
                  Categorias
                  <input
                    value={categories}
                    onChange={(e) => setCategories(e.target.value)}
                  />
                </label>

                <label className="rp-field">
                  Intervalo de busca
                  <select
                    value={searchInterval}
                    onChange={(e) => setSearchInterval(e.target.value)}
                  >
                    <option value="A cada 30 minutos">A cada 30 minutos</option>
                    <option value="A cada 60 minutos">A cada 60 minutos</option>
                  </select>
                </label>

                <label className="rp-check">
                  <input
                    type="checkbox"
                    checked={sendToReview}
                    onChange={(e) => setSendToReview(e.target.checked)}
                  />
                  Encaminhar achados para revisão
                </label>

                <button
                  className="rp-btn rp-primary rp-section"
                  type="button"
                  onClick={handleSaveSearch}
                >
                  Salvar busca
                </button>
              </div>

              <div className="rp-panel">
                <h2>Qualidade antes de volume</h2>
                <p className="rp-sub">
                  A busca usa os critérios da curadoria e evita produtos repetidos.
                </p>

                <div className="rp-list">
                  <div className="rp-list-item">
                    <div className="rp-list-copy">
                      <strong>Nota mínima</strong>
                      <p>{minRating} estrelas</p>
                    </div>
                  </div>
                  <div className="rp-list-item">
                    <div className="rp-list-copy">
                      <strong>Prova social</strong>
                      <p>{minReviews} avaliações ou mais</p>
                    </div>
                  </div>
                  <div className="rp-list-item">
                    <div className="rp-list-copy">
                      <strong>Repetição</strong>
                      <p>Não repetir por {noRepeatDays} dias</p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="rp-btn"
                  onClick={() => handleSelectTab('curadoria')}
                >
                  Editar curadoria
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Aba 3: Curadoria */}
        {activeTab === 'curadoria' && (
          <div data-panel="curadoria" role="tabpanel">
            <div className="rp-panel">
              <h2>O que seu público procura?</h2>

              <label className="rp-field">
                Interesses
                <textarea
                  rows={3}
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                />
              </label>

              <div className="rp-grid">
                <label className="rp-field">
                  Nota mínima
                  <input
                    type="number"
                    value={minRating}
                    min="0"
                    max="5"
                    step="0.1"
                    onChange={(e) => setMinRating(e.target.value)}
                  />
                </label>
                <label className="rp-field">
                  Avaliações mínimas
                  <input
                    type="number"
                    value={minReviews}
                    min="0"
                    onChange={(e) => setMinReviews(e.target.value)}
                  />
                </label>
                <label className="rp-field">
                  Ofertas por dia
                  <input
                    type="number"
                    value={offersPerDay}
                    min="1"
                    onChange={(e) => setOffersPerDay(e.target.value)}
                  />
                </label>
                <label className="rp-field">
                  Dias sem repetir produto
                  <input
                    type="number"
                    value={noRepeatDays}
                    min="1"
                    onChange={(e) => setNoRepeatDays(e.target.value)}
                  />
                </label>
              </div>

              <label className="rp-check">
                <input
                  type="checkbox"
                  checked={alternateCategories}
                  onChange={(e) => setAlternateCategories(e.target.checked)}
                />
                Alternar categorias ao longo do dia
              </label>

              <label className="rp-check">
                <input
                  type="checkbox"
                  checked={reviewMissingInfo}
                  onChange={(e) => setReviewMissingInfo(e.target.checked)}
                />
                Enviar para revisão quando faltarem informações
              </label>

              <div className="rp-footer">
                <button
                  className="rp-btn rp-primary"
                  type="button"
                  onClick={handleSaveCurator}
                >
                  Salvar critérios
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function OfertasPage() {
  return (
    <Suspense fallback={<div className="rp-page"><p className="rp-sub">Carregando ofertas...</p></div>}>
      <OfertasContent />
    </Suspense>
  );
}
