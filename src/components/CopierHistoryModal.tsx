'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  Search,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Loader2,
  Calendar,
  Tag,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { InstagramIcon } from './SocialIcons';
import { CopiedOfferHistoryItem } from '@/app/api/copier/history/route';
import StoryPublisherModal from './StoryPublisherModal';

interface CopierHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CopierHistoryModal({ isOpen, onClose }: CopierHistoryModalProps) {
  const [items, setItems] = useState<CopiedOfferHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedOfferForStory, setSelectedOfferForStory] = useState<CopiedOfferHistoryItem | null>(null);

  const fetchHistory = async (query = '') => {
    setLoading(true);
    try {
      const url = query
        ? `/api/copier/history?search=${encodeURIComponent(query)}`
        : '/api/copier/history';
      const res = await fetch(url);
      const data = await res.json();
      if (data.ok && Array.isArray(data.items)) {
        setItems(data.items);
      }
    } catch {
      // Falha silenciosa
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory(search);
    }
  }, [isOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchHistory(search);
  };

  const handleCopyLink = (item: CopiedOfferHistoryItem) => {
    if (item.affiliateUrl) {
      navigator.clipboard.writeText(item.affiliateUrl);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
        <div className="relative w-full max-w-4xl bg-[#091526] border border-[#18334D] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden my-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#18334D] bg-[#061225] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0879DF] to-[#1CCAF2] flex items-center justify-center shadow-lg shadow-[#1CCAF2]/20">
                <History className="w-5 h-5 text-[#061225]" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-[#F8FBFF]">
                  Histórico de Ofertas Copiadas
                </h2>
                <p className="text-[11px] sm:text-xs text-[#8EADC7]">
                  Ofertas capturadas, convertidas e enviadas pelo Copiador com opção de Story direto.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#8EADC7] hover:text-[#F8FBFF] hover:bg-[#18334D]/60 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Barra de Busca e Filtros */}
          <div className="px-5 py-3 border-b border-[#18334D] bg-[#0B1A30]/50 shrink-0 flex items-center gap-3">
            <form onSubmit={handleSearchSubmit} className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto por nome..."
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl pl-9 pr-3 py-2 text-xs text-[#F8FBFF] placeholder-[#8EADC7]/50 focus:outline-none focus:border-[#1CCAF2]"
              />
              <Search className="w-4 h-4 text-[#8EADC7] absolute left-3 top-2.5" />
            </form>

            <button
              type="button"
              onClick={() => fetchHistory(search)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#061225] border border-[#18334D] hover:border-[#1CCAF2]/60 text-xs font-bold text-[#8EADC7] hover:text-[#F8FBFF] transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Atualizar
            </button>
          </div>

          {/* Lista de Ofertas */}
          <div className="p-5 overflow-y-auto space-y-3 flex-1">
            {loading ? (
              <div className="py-16 text-center text-xs text-[#8EADC7]">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#1CCAF2]" />
                Carregando ofertas copiadas...
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center text-xs text-[#8EADC7] bg-[#0D1B31] border border-[#18334D] rounded-xl p-8">
                <History className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#1CCAF2]" />
                <p className="font-bold text-[#F8FBFF] text-sm">Nenhuma oferta encontrada</p>
                <p className="mt-1">
                  Assim que o Copiador processar e enviar produtos de grupos do WhatsApp, eles aparecerão aqui.
                </p>
              </div>
            ) : (
              items.map((item) => {
                const discount = item.discountPct ? item.discountPct.replace(/\D/g, '') : '';
                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl bg-[#0D1B31] border border-[#18334D] hover:border-[#1CCAF2]/40 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    {/* Imagem + Infos */}
                    <div className="flex items-center gap-3.5 flex-1 min-w-0">
                      {item.mediaUrl ? (
                        <div className="w-16 h-16 rounded-xl bg-white border border-[#18334D] shrink-0 p-1 overflow-hidden flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.mediaUrl}
                            alt={item.title}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-[#061225] border border-[#18334D] shrink-0 flex items-center justify-center text-xs text-[#8EADC7]">
                          Sem foto
                        </div>
                      )}

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase text-[#1CCAF2] tracking-wider">
                            {item.store}
                          </span>
                          <span className="text-[10px] text-[#8EADC7] flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(item.sentAt).toLocaleDateString('pt-BR')} às{' '}
                            {new Date(item.sentAt).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <h3 className="text-xs sm:text-sm font-bold text-[#F8FBFF] truncate" title={item.title}>
                          {item.title}
                        </h3>

                        <div className="flex items-baseline gap-2 pt-0.5">
                          {item.priceOriginal && (
                            <span className="text-[11px] text-[#8EADC7] line-through">
                              De: R$ {item.priceOriginal}
                            </span>
                          )}
                          <span className="text-xs sm:text-sm font-black text-[#1CCAF2]">
                            Por: R$ {item.priceCurrent}
                          </span>
                          {discount && (
                            <span className="text-[10px] font-bold text-[#20C997] bg-[#20C997]/15 px-1.5 py-0.2 rounded">
                              -{discount}% OFF
                            </span>
                          )}
                          {item.coupon && (
                            <span className="text-[10px] font-bold text-[#1CCAF2] bg-[#1CCAF2]/15 px-1.5 py-0.2 rounded">
                              🎟️ {item.coupon}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end border-t sm:border-t-0 border-[#18334D]/60 pt-2 sm:pt-0">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(item)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#061225] border border-[#18334D] hover:border-[#1CCAF2]/60 text-xs font-bold text-[#F8FBFF] transition-all cursor-pointer"
                        title="Copiar Link de Afiliado"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#20C997]" />
                            <span className="text-[#20C997]">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[#8EADC7]" />
                            <span>Link</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedOfferForStory(item)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#FCB045] text-white text-xs font-black shadow-md shadow-[#FD1D1D]/15 hover:opacity-95 transition-all cursor-pointer"
                        title="Gerar e Postar Story no Instagram"
                      >
                        <InstagramIcon className="w-3.5 h-3.5" />
                        <span>Postar Story</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal de Publicação do Story para a Oferta Selecionada */}
      {selectedOfferForStory && (
        <StoryPublisherModal
          isOpen={!!selectedOfferForStory}
          onClose={() => setSelectedOfferForStory(null)}
          offer={selectedOfferForStory}
          onStoryPublished={(offerId) => {
            fetchHistory(search);
          }}
        />
      )}
    </>
  );
}
