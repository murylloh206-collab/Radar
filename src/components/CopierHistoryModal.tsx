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
  FileText,
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
  const [activeModalTab, setActiveModalTab] = useState<'story' | 'feed'>('story');

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
      <div className="fixed inset-0 z-[2147482990] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
        <div className="relative w-full max-w-4xl bg-[#0b0b0a] border border-[#2c2c2c] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden my-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#2c2c2c] bg-[#0c0c0d] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#d9a520] to-[#f5c542] flex items-center justify-center shadow-lg shadow-[#f5c542]/20">
                <History className="w-5 h-5 text-[#0c0c0d]" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-[#f6f2e8]">
                  Histórico de Ofertas Copiadas
                </h2>
                <p className="text-[11px] sm:text-xs text-[#a8a39a]">
                  Ofertas capturadas, convertidas e enviadas pelo Copiador com opção de Story direto.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#a8a39a] hover:text-[#f6f2e8] hover:bg-[#2c2c2c]/60 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Barra de Busca e Filtros */}
          <div className="px-5 py-3 border-b border-[#2c2c2c] bg-[#1f1e1c]/50 shrink-0 flex items-center gap-3">
            <form onSubmit={handleSearchSubmit} className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto por nome..."
                className="w-full bg-[#0c0c0d] border border-[#2c2c2c] rounded-xl pl-9 pr-3 py-2 text-xs text-[#f6f2e8] placeholder-[#a8a39a]/50 focus:outline-none focus:border-[#f5c542]"
              />
              <Search className="w-4 h-4 text-[#a8a39a] absolute left-3 top-2.5" />
            </form>

            <button
              type="button"
              onClick={() => fetchHistory(search)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0c0c0d] border border-[#2c2c2c] hover:border-[#f5c542]/60 text-xs font-bold text-[#a8a39a] hover:text-[#f6f2e8] transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Atualizar
            </button>
          </div>

          {/* Lista de Ofertas */}
          <div className="p-5 overflow-y-auto space-y-3 flex-1">
            {loading ? (
              <div className="py-16 text-center text-xs text-[#a8a39a]">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#f5c542]" />
                Carregando ofertas copiadas...
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center text-xs text-[#a8a39a] bg-[#161616] border border-[#2c2c2c] rounded-xl p-8">
                <History className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#f5c542]" />
                <p className="font-bold text-[#f6f2e8] text-sm">Nenhuma oferta encontrada</p>
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
                    className="p-4 rounded-xl bg-[#161616] border border-[#2c2c2c] hover:border-[#f5c542]/40 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    {/* Imagem + Infos */}
                    <div className="flex items-center gap-3.5 flex-1 min-w-0">
                      {item.mediaUrl ? (
                        <div className="w-16 h-16 rounded-xl bg-white border border-[#2c2c2c] shrink-0 p-1 overflow-hidden flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.mediaUrl}
                            alt={item.title}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-[#0c0c0d] border border-[#2c2c2c] shrink-0 flex items-center justify-center text-xs text-[#a8a39a]">
                          Sem foto
                        </div>
                      )}

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase text-[#f5c542] tracking-wider">
                            {item.store}
                          </span>
                          <span className="text-[10px] text-[#a8a39a] flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(item.sentAt).toLocaleDateString('pt-BR')} às{' '}
                            {new Date(item.sentAt).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <h3 className="text-xs sm:text-sm font-bold text-[#f6f2e8] truncate" title={item.title}>
                          {item.title}
                        </h3>

                        <div className="flex items-baseline gap-2 pt-0.5">
                          {item.priceOriginal && (
                            <span className="text-[11px] text-[#a8a39a] line-through">
                              De: R$ {item.priceOriginal}
                            </span>
                          )}
                          <span className="text-xs sm:text-sm font-black text-[#f5c542]">
                            Por: R$ {item.priceCurrent}
                          </span>
                          {discount && (
                            <span className="text-[10px] font-bold text-[#5fd0a0] bg-[#5fd0a0]/15 px-1.5 py-0.2 rounded">
                              -{discount}% OFF
                            </span>
                          )}
                          {item.coupon && (
                            <span className="text-[10px] font-bold text-[#f5c542] bg-[#f5c542]/15 px-1.5 py-0.2 rounded">
                              🎟️ {item.coupon}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end border-t sm:border-t-0 border-[#2c2c2c]/60 pt-2 sm:pt-0">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(item)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0c0c0d] border border-[#2c2c2c] hover:border-[#f5c542]/60 text-xs font-bold text-[#f6f2e8] transition-all cursor-pointer"
                        title="Copiar Link de Afiliado"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#5fd0a0]" />
                            <span className="text-[#5fd0a0]">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[#a8a39a]" />
                            <span>Link</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOfferForStory(item);
                          setActiveModalTab('feed');
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0c0c0d] border border-[#2c2c2c] hover:border-[#f5c542]/60 text-xs font-bold text-[#f6f2e8] transition-all cursor-pointer"
                        title="Criar Post de Feed com legenda gerada automaticamente"
                      >
                        <FileText className="w-3.5 h-3.5 text-[#f5c542]" />
                        <span>Criar Post</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOfferForStory(item);
                          setActiveModalTab('story');
                        }}
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

      {/* Modal de Publicação (Story ou Feed Post) para a Oferta Selecionada */}
      {selectedOfferForStory && (
        <StoryPublisherModal
          isOpen={!!selectedOfferForStory}
          onClose={() => setSelectedOfferForStory(null)}
          offer={selectedOfferForStory}
          initialTab={activeModalTab}
          onPublished={(offerId) => {
            fetchHistory(search);
          }}
        />
      )}
    </>
  );
}
