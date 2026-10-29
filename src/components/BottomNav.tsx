'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Tag,
  Copy,
  Zap,
  Menu,
  X,
  Share2,
  FileEdit,
  Calendar,
  BarChart3,
  Users,
  Smartphone,
  Send,
  Settings,
  QrCode,
  Store,
} from 'lucide-react';

export function BottomNav() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const mainItems = [
    { label: 'Início', href: '/', icon: LayoutDashboard },
    { label: 'Ofertas', href: '/ofertas', icon: Tag },
    { label: 'Copiador', href: '/copiador', icon: Copy },
    { label: 'Automação', href: '/automacao', icon: Zap },
  ];

  const moreItems = [
    { label: 'Conexão WhatsApp', href: '/conexao-whatsapp', icon: QrCode, desc: 'Pareamento e grupos do WhatsApp' },
    { label: 'Conectar Lojas', href: '/conectar-lojas', icon: Store, desc: 'Mercado Livre, Shopee e Rakuten' },
    { label: 'Gerar Postagem', href: '/gerar-postagem', icon: Share2, desc: 'Conversão instantânea de links' },
    { label: 'Mensagem Avulsa', href: '/mensagem-avulsa', icon: FileEdit, desc: 'Avisos e comunicados manuais' },
    { label: 'Agenda de Envios', href: '/agenda', icon: Calendar, desc: 'Fila e horários programados' },
    { label: 'Relatórios', href: '/relatorios', icon: BarChart3, desc: 'Métricas e comissões' },
    { label: 'Analytics Grupos', href: '/analytics', icon: Users, desc: 'Disparos e membros' },
    { label: 'Bio Link Público', href: '/bio-link', icon: Smartphone, desc: 'Página pública de links' },
    { label: 'Gerador Stories', href: '/stories', icon: Send, desc: 'Artes no formato 9:16' },
    { label: 'Configurações', href: '/ajustes', icon: Settings, desc: 'WhatsApp, lojas e filtros' },
  ];

  const isMoreActive = moreItems.some((item) => pathname.startsWith(item.href));

  return (
    <>
      {/* Drawer deslizante de acesso às demais páginas em celular */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden bg-black/70 backdrop-blur-sm flex flex-col justify-end animate-fade-in"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="bg-[#0D1B31] border-t border-[#18334D] rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto safe-area-bottom shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#18334D]">
              <div>
                <h3 className="text-sm font-bold text-[#F8FBFF]">Recursos do Radar de Ofertas</h3>
                <p className="text-[11px] text-[#8EADC7]">Acesse rapidamente qualquer módulo do painel</p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-9 h-9 rounded-xl bg-[#061225] border border-[#18334D] text-[#8EADC7] flex items-center justify-center hover:text-[#F8FBFF]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all min-h-[48px] ${
                      isActive
                        ? 'bg-[#061225] border-[#1CCAF2] text-[#1CCAF2]'
                        : 'bg-[#061225]/80 border-[#18334D] text-[#8EADC7] hover:border-[#1CCAF2]/40 hover:text-[#F8FBFF]'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isActive ? 'bg-[#1CCAF2]/15 text-[#1CCAF2]' : 'bg-[#0D1B31] text-[#8EADC7]'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="leading-tight text-left">
                      <p className={`text-xs font-bold ${isActive ? 'text-[#1CCAF2]' : 'text-[#F8FBFF]'}`}>
                        {item.label}
                      </p>
                      <p className="text-[10px] text-[#8EADC7] mt-0.5">{item.desc}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Barra de Navegação Inferior Fixa */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-[#061225]/95 backdrop-blur-md border-t border-[#18334D] px-2 py-1.5 safe-area-bottom">
        <div className="grid grid-cols-5 items-center justify-around">
          {mainItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all min-h-[44px] active:scale-95 ${
                  isActive
                    ? 'text-[#1CCAF2] font-semibold'
                    : 'text-[#8EADC7] hover:text-[#F8FBFF]'
                }`}
              >
                <div
                  className={`relative flex items-center justify-center w-8 h-8 rounded-lg ${
                    isActive ? 'bg-[#1CCAF2]/15' : ''
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-[#1CCAF2]' : 'text-[#8EADC7]'}`} />
                  {isActive && (
                    <span className="absolute -top-0.5 right-1 w-1.5 h-1.5 bg-[#1CCAF2] rounded-full" />
                  )}
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight font-medium">{item.label}</span>
              </Link>
            );
          })}

          {/* Botão Mais / Gaveta */}
          <button
            onClick={() => setDrawerOpen(true)}
            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all min-h-[44px] active:scale-95 ${
              isMoreActive || drawerOpen
                ? 'text-[#1CCAF2] font-semibold'
                : 'text-[#8EADC7] hover:text-[#F8FBFF]'
            }`}
          >
            <div
              className={`relative flex items-center justify-center w-8 h-8 rounded-lg ${
                isMoreActive || drawerOpen ? 'bg-[#1CCAF2]/15' : ''
              }`}
            >
              <Menu className={`w-5 h-5 ${isMoreActive || drawerOpen ? 'text-[#1CCAF2]' : 'text-[#8EADC7]'}`} />
              {isMoreActive && (
                <span className="absolute -top-0.5 right-1 w-1.5 h-1.5 bg-[#1CCAF2] rounded-full" />
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight font-medium">Mais</span>
          </button>
        </div>
      </nav>
    </>
  );
}
