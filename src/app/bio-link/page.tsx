'use client';

import React, { useState } from 'react';
import { Smartphone, ExternalLink, Plus, Eye, MousePointer, Share2, Copy, Check } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { Logo } from '@/components/Logo';

export default function BioLinkEditorPage() {
  const [slug, setSlug] = useState('radarofertas');
  const [title, setTitle] = useState('Radar de Ofertas — VIP');
  const [bio, setBio] = useState('Os melhores achadinhos, cupons exclusivos e bugs de preços da internet.');
  const [copied, setCopied] = useState(false);

  const [blocks, setBlocks] = useState([
    {
      id: 'b1',
      title: '🚀 Entrar no Grupo VIP WhatsApp #1 (Grátis)',
      url: 'https://chat.whatsapp.com/exemplo1',
      badge: 'MAIS PROCURADO',
    },
    {
      id: 'b2',
      title: '🎟️ Canal de Cupons & Descontos Diários',
      url: 'https://chat.whatsapp.com/exemplo2',
      badge: 'CUPONS',
    },
    {
      id: 'b3',
      title: '🔥 Oferta do Dia: Smartwatch Pro -40% OFF',
      url: 'https://mercadolivre.com.br/exemplo',
      badge: 'DESTAQUE',
    },
  ]);

  const publicUrl = `http://localhost:3000/u/${slug}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] tracking-tight">
            Bio Link Público
          </h1>
          <p className="text-xs sm:text-sm text-[#8EADC7] mt-0.5">
            Crie sua página pública de links para colocar na bio do Instagram, TikTok e enviar para contatos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0D1B31] border border-[#18334D] text-[#8EADC7] hover:text-[#1CCAF2]"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#20C997]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Link Copiado' : 'Copiar Link'}</span>
          </button>
          <a
            href={`/u/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#1CCAF2] text-[#061225] hover:opacity-90"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir Página</span>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Editor */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-5 space-y-3.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#1CCAF2]">
              Configurações do Perfil
            </h2>

            <div>
              <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                Link Personalizado (Slug)
              </label>
              <div className="flex items-center bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2">
                <span className="text-xs text-[#8EADC7]">radar.link/u/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  className="flex-1 bg-transparent text-xs text-[#F8FBFF] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                Título do Perfil
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-3.5 py-2 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#8EADC7] block mb-1">
                Descrição / Bio
              </label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl p-3 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>
          </div>

          {/* Blocos de Links */}
          <div className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#1CCAF2]">
                Blocos & Botões de Ação
              </h2>
              <button
                onClick={() =>
                  setBlocks([
                    ...blocks,
                    {
                      id: `b_${Date.now()}`,
                      title: 'Novo Link de Grupo ou Oferta',
                      url: 'https://',
                      badge: 'NOVO',
                    },
                  ])
                }
                className="flex items-center gap-1 text-xs font-bold text-[#1CCAF2] hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Bloco</span>
              </button>
            </div>

            <div className="space-y-3">
              {blocks.map((b, idx) => (
                <div key={b.id} className="p-3 rounded-xl bg-[#061225] border border-[#18334D] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#8EADC7]">Botão #{idx + 1}</span>
                    <button
                      onClick={() => setBlocks(blocks.filter((item) => item.id !== b.id))}
                      className="text-[10px] text-[#F87171] hover:underline"
                    >
                      Remover
                    </button>
                  </div>
                  <input
                    type="text"
                    value={b.title}
                    onChange={(e) => {
                      const updated = [...blocks];
                      updated[idx].title = e.target.value;
                      setBlocks(updated);
                    }}
                    placeholder="Texto do botão"
                    className="w-full bg-[#0D1B31] border border-[#18334D] rounded-lg px-3 py-1.5 text-xs text-[#F8FBFF] focus:outline-none focus:border-[#1CCAF2]"
                  />
                  <input
                    type="text"
                    value={b.url}
                    onChange={(e) => {
                      const updated = [...blocks];
                      updated[idx].url = e.target.value;
                      setBlocks(updated);
                    }}
                    placeholder="https://..."
                    className="w-full bg-[#0D1B31] border border-[#18334D] rounded-lg px-3 py-1.5 text-xs text-[#F8FBFF] font-mono focus:outline-none focus:border-[#1CCAF2]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Simulador Mobile Mockup */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="sticky top-20 w-full max-w-[340px] rounded-[40px] border-4 border-[#18334D] bg-[#061225] p-5 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
            {/* Notch */}
            <div className="w-24 h-4 bg-[#0D1B31] rounded-full mb-6 mx-auto" />

            {/* Logo do Perfil */}
            <Logo size="lg" showText={false} />

            <h3 className="mt-3 text-base font-extrabold text-[#F8FBFF]">{title}</h3>
            <p className="mt-1 text-xs text-[#8EADC7] leading-relaxed">{bio}</p>

            {/* Lista de Botões */}
            <div className="mt-6 w-full space-y-2.5">
              {blocks.map((b) => (
                <div
                  key={b.id}
                  className="w-full p-3 rounded-2xl bg-gradient-to-r from-[#0D1B31] to-[#0A2244] border border-[#1CCAF2]/30 text-xs font-bold text-[#F8FBFF] shadow-md flex items-center justify-between"
                >
                  <span className="truncate pr-2">{b.title}</span>
                  {b.badge && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#1CCAF2] text-[#061225]">
                      {b.badge}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-8 text-[10px] text-[#8EADC7]/60">
              ⚡ Desenvolvido com Radar de Ofertas
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
