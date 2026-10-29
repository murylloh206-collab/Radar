'use client';

import React, { useEffect, useState } from 'react';
import { Tag, Search, Filter, Share2, Star, ShoppingBag, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { ProductItem, StoreName } from '@/lib/types';
import Link from 'next/link';

export default function OfertasCatalogoPage() {
  const [selectedStore, setSelectedStore] = useState<string>('todas');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductItem[]>([]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/products?store=${selectedStore}&search=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (data.ok) {
        setProducts(data.products || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [selectedStore]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProducts();
  };

  const getStoreBadgeColor = (store: StoreName) => {
    switch (store) {
      case 'shopee':
        return '#1CCAF2';
      case 'mercadolivre':
        return '#F7B84B';
      case 'netshoes':
        return '#9B51E0';
      case 'amazon':
        return '#20C997';
      case 'magalu':
        return '#0879DF';
      default:
        return '#8EADC7';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] tracking-tight">
            Catálogo de Ofertas Verificadas
          </h1>
          <p className="text-xs sm:text-sm text-[#8EADC7] mt-0.5">
            Produtos reais capturados pelas origens ou analisados pelo Radar de Ofertas com histórico de preços.
          </p>
        </div>

        <Link
          href="/gerar-postagem"
          className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] flex items-center justify-center gap-2 shadow-md shadow-[#1CCAF2]/15"
        >
          <Share2 className="w-4 h-4" />
          <span>Garimpar Novo Link</span>
        </Link>
      </div>

      {/* Filtros e Busca */}
      <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#8EADC7] absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por título ou palavra-chave..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#061225] border border-[#18334D] rounded-xl pl-9 pr-3 py-2 text-xs text-[#F8FBFF] placeholder-[#8EADC7]/50 focus:outline-none focus:border-[#1CCAF2]"
          />
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="flex-1 sm:flex-none min-h-[40px] bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
          >
            <option value="todas">Todas as Lojas</option>
            <option value="shopee">Shopee</option>
            <option value="mercadolivre">Mercado Livre</option>
            <option value="netshoes">Netshoes</option>
            <option value="amazon">Amazon</option>
            <option value="magalu">Magazine Luiza</option>
          </select>

          <button
            onClick={fetchProducts}
            title="Atualizar lista de produtos"
            className="min-h-[40px] px-3 py-2 rounded-xl bg-[#061225] border border-[#18334D] text-[#8EADC7] hover:text-[#1CCAF2]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#1CCAF2]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Grid de Produtos Reais */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-[#8EADC7] text-xs">
          <RefreshCw className="w-6 h-6 animate-spin text-[#1CCAF2] mb-2" />
          <span>Carregando ofertas verificadas...</span>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-8 text-center">
          <div className="flex justify-center mb-3">
            <div className="p-3 rounded-2xl bg-[#1CCAF2]/10 text-[#1CCAF2]">
              <ShoppingBag className="w-8 h-8" />
            </div>
          </div>
          <h3 className="text-sm font-bold text-[#F8FBFF]">Nenhuma oferta registrada no catálogo</h3>
          <p className="text-xs text-[#8EADC7] max-w-md mx-auto mt-1">
            As ofertas capturadas através do Copiador de Ofertas ou geradas no painel com dados reais de preços aparecerão aqui automaticamente.
          </p>
          <div className="mt-4">
            <Link
              href="/gerar-postagem"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#061225] border border-[#1CCAF2]/40 text-[#1CCAF2] hover:bg-[#1CCAF2]/10"
            >
              <span>Processar Primeira Oferta</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((prod) => (
            <div
              key={prod.id}
              className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-4 flex flex-col justify-between hover:border-[#1CCAF2]/40 transition-all group"
            >
              <div>
                <div className="relative aspect-video w-full rounded-xl bg-[#061225] border border-[#18334D] overflow-hidden mb-3 flex items-center justify-center">
                  {prod.imageUrl ? (
                    <img
                      src={prod.imageUrl}
                      alt={prod.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <ShoppingBag className="w-8 h-8 text-[#18334D]" />
                  )}

                  <span
                    className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
                    style={{
                      backgroundColor: `${getStoreBadgeColor(prod.storeName)}20`,
                      color: getStoreBadgeColor(prod.storeName),
                      border: `1px solid ${getStoreBadgeColor(prod.storeName)}40`,
                    }}
                  >
                    {prod.storeName}
                  </span>

                  {prod.discountPct > 0 && (
                    <span className="absolute top-2 right-2 text-[10px] font-black px-1.5 py-0.5 rounded-md bg-[#20C997] text-[#061225]">
                      -{prod.discountPct}% OFF
                    </span>
                  )}
                </div>

                <h3 className="text-xs font-bold text-[#F8FBFF] line-clamp-2 leading-snug">
                  {prod.title}
                </h3>

                <div className="flex items-center gap-2 mt-2">
                  {prod.originalPrice && prod.originalPrice > prod.currentPrice && (
                    <span className="text-[11px] text-[#8EADC7] line-through">
                      R$ {prod.originalPrice.toFixed(2).replace('.', ',')}
                    </span>
                  )}
                  <span className="text-sm font-black text-[#1CCAF2]">
                    R$ {prod.currentPrice.toFixed(2).replace('.', ',')}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[10px] text-[#8EADC7] mt-2 pt-2 border-t border-[#18334D]">
                  {prod.rating ? (
                    <div className="flex items-center gap-1 text-[#F7B84B]">
                      <Star className="w-3 h-3 fill-current" />
                      <span>{prod.rating.toFixed(1)}</span>
                    </div>
                  ) : (
                    <span className="text-[#8EADC7]/70">Sem nota verificada</span>
                  )}

                  {prod.reviewsCount !== undefined && prod.reviewsCount > 0 ? (
                    <span>{prod.reviewsCount} avaliações</span>
                  ) : null}

                  {prod.salesCount !== undefined && prod.salesCount > 0 ? (
                    <span>{prod.salesCount} vendas</span>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-[#18334D] flex items-center justify-between">
                <span className="text-[10px] text-[#8EADC7]/70">
                  {new Date(prod.lastCheckedAt).toLocaleDateString('pt-BR')}
                </span>

                <a
                  href={prod.affiliateUrl || prod.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] font-bold text-[#1CCAF2] hover:underline"
                >
                  <span>Ver Oferta</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
