import React from 'react';
import { Logo } from '@/components/Logo';
import { ExternalLink, ArrowRight } from 'lucide-react';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function PublicBioLinkPage({ params }: Props) {
  const { slug } = await params;

  // Dados mockados/padrão da bio
  const bioData = {
    title: 'Radar de Ofertas — Comunidade VIP',
    bio: 'Achadinhos imperdíveis, cupons de desconto e erros de preços monitorados 24h por dia.',
    links: [
      {
        title: '🚀 Entrar no Grupo VIP WhatsApp (Grátis)',
        url: 'https://chat.whatsapp.com/exemplo1',
        badge: 'ENTRAR AGORA',
        highlight: true,
      },
      {
        title: '🎟️ Canal de Cupons & Descontos Shopee',
        url: 'https://chat.whatsapp.com/exemplo2',
        badge: 'CUPONS',
      },
      {
        title: '🔥 Oferta Destaque: Smartwatch Pro -40%',
        url: 'https://mercadolivre.com.br',
        badge: 'MELHOR PREÇO',
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#061225] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-[#0D1B31] border border-[#18334D] p-6 sm:p-8 flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
        {/* Glow de fundo */}
        <div className="absolute -top-16 -left-16 w-48 h-48 bg-[#1CCAF2]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-[#0879DF]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Logo */}
        <div className="mb-4">
          <Logo size="lg" showText={false} />
        </div>

        <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] tracking-tight">
          {bioData.title}
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-[#8EADC7] leading-relaxed max-w-sm">
          {bioData.bio}
        </p>

        {/* Lista de Links */}
        <div className="mt-6 w-full space-y-3">
          {bioData.links.map((link, idx) => (
            <a
              key={idx}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-full p-4 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-bold transition-all duration-200 active:scale-[0.98] ${
                link.highlight
                  ? 'bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] shadow-lg shadow-[#1CCAF2]/20 hover:opacity-95'
                  : 'bg-[#061225] border border-[#18334D] text-[#F8FBFF] hover:border-[#1CCAF2]/40 hover:bg-[#122440]'
              }`}
            >
              <span className="truncate pr-2">{link.title}</span>
              <div className="flex items-center gap-2 shrink-0">
                {link.badge && (
                  <span
                    className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                      link.highlight
                        ? 'bg-[#061225] text-[#1CCAF2]'
                        : 'bg-[#1CCAF2]/20 text-[#1CCAF2]'
                    }`}
                  >
                    {link.badge}
                  </span>
                )}
                <ArrowRight className="w-4 h-4 opacity-75" />
              </div>
            </a>
          ))}
        </div>

        <div className="mt-8 text-[11px] text-[#8EADC7]/60">
          🎯 Radar de Ofertas • Links Verificados e Seguros
        </div>
      </div>
    </div>
  );
}
