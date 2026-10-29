'use client';

import React, { useState } from 'react';
import { Send, Download, Sparkles, Image as ImageIcon, Flame, ShoppingBag } from 'lucide-react';
import { Logo } from '@/components/Logo';

export default function StoriesPage() {
  const [title, setTitle] = useState('Smartwatch Pro Series 9 com Monitor Cardíaco');
  const [priceOriginal, setPriceOriginal] = useState('299,00');
  const [priceCurrent, setPriceCurrent] = useState('179,90');
  const [discountPct, setDiscountPct] = useState('40');
  const [imageUrl, setImageUrl] = useState('https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=60');
  const [coupon, setCoupon] = useState('RADAR10');
  const [ctaText, setCtaText] = useState('ARRASTE PRA CIMA OU CLIQUE NO LINK');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] tracking-tight">
          Gerador de Stories 9:16
        </h1>
        <p className="text-xs sm:text-sm text-[#8EADC7] mt-0.5">
          Gere templates verticais de alta conversão para o WhatsApp Status e Instagram Stories com a identidade do Radar de Ofertas.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Controles */}
        <div className="lg:col-span-6 space-y-4">
          <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-5 space-y-3.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#1CCAF2]">
              Configuração do Story
            </h2>

            <div>
              <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                Título do Produto
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#8EADC7] block mb-1">Preço De (R$)</label>
                <input
                  type="text"
                  value={priceOriginal}
                  onChange={(e) => setPriceOriginal(e.target.value)}
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8EADC7] block mb-1">Preço Por (R$)</label>
                <input
                  type="text"
                  value={priceCurrent}
                  onChange={(e) => setPriceCurrent(e.target.value)}
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8EADC7] block mb-1">Desconto (%)</label>
                <input
                  type="text"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)}
                  className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                Cupom de Desconto (Opcional)
              </label>
              <input
                type="text"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] uppercase focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                URL da Imagem do Produto
              </label>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>
          </div>
        </div>

        {/* Prévia 9:16 do Story */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="w-full max-w-[320px] aspect-[9/16] rounded-3xl bg-gradient-to-b from-[#061225] via-[#0D1B31] to-[#061225] border-2 border-[#18334D] p-5 flex flex-col justify-between shadow-2xl relative overflow-hidden text-center">
            {/* Top Logo */}
            <div className="flex items-center justify-between z-10">
              <Logo size="sm" />
              <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#F87171] text-[#061225]">
                <Flame className="w-3 h-3 fill-[#061225]" />
                OFERTA DO DIA
              </span>
            </div>

            {/* Imagem Central */}
            <div className="my-auto relative rounded-2xl overflow-hidden border-2 border-[#1CCAF2]/40 bg-[#061225] shadow-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={title} className="w-full h-48 object-cover" />
              <div className="absolute top-2 right-2 bg-[#20C997] text-[#061225] text-xs font-black px-2.5 py-1 rounded-xl shadow-lg">
                -{discountPct}% OFF
              </div>
            </div>

            {/* Texto e Preço */}
            <div className="z-10 space-y-2">
              <h3 className="text-sm font-extrabold text-[#F8FBFF] line-clamp-2 leading-snug">
                {title}
              </h3>

              <div className="flex items-baseline justify-center gap-2">
                <span className="text-xs text-[#8EADC7] line-through">De: R$ {priceOriginal}</span>
                <span className="text-xl font-black text-[#1CCAF2]">Por: R$ {priceCurrent}</span>
              </div>

              {coupon && (
                <div className="inline-block px-3 py-1 rounded-xl bg-[#1CCAF2]/15 border border-[#1CCAF2]/40 text-xs font-bold text-[#1CCAF2]">
                  🎟️ Cupom: {coupon}
                </div>
              )}

              {/* Botão de Ação */}
              <div className="mt-3 p-2.5 rounded-2xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] text-xs font-black shadow-lg shadow-[#1CCAF2]/20">
                {ctaText}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
