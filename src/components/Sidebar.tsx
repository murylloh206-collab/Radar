'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Tag,
  Copy,
  Zap,
  Settings,
  Send,
  Calendar,
  BarChart3,
  Users,
  Smartphone,
  Share2,
  FileEdit,
  Wifi,
  WifiOff,
  QrCode,
  Store,
} from 'lucide-react';
import { Logo } from './Logo';

export function Sidebar() {
  const pathname = usePathname();
  const [waConnected, setWaConnected] = useState<boolean>(false);
  const [accountLabel, setAccountLabel] = useState<string>('Conta WhatsApp');

  useEffect(() => {
    fetch('/api/whatsapp/connect')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.whatsapp) {
          setWaConnected(data.whatsapp.status === 'connected');
          setAccountLabel(
            data.whatsapp.phoneNumber
              ? `+${data.whatsapp.phoneNumber}`
              : data.whatsapp.profileName || 'Conta WhatsApp'
          );
        }
      })
      .catch(() => {});
  }, []);

  const navGroups = [
    {
      title: 'Principal',
      items: [
        { label: 'Início', href: '/painel', icon: LayoutDashboard },
        { label: 'Conexão WhatsApp', href: '/conexao-whatsapp', icon: QrCode },
        { label: 'Conectar Lojas', href: '/conectar-lojas', icon: Store, badge: 'SaaS' },
        { label: 'Copiador WhatsApp', href: '/copiador', icon: Copy },
        { label: 'Catálogo de Ofertas', href: '/ofertas', icon: Tag },
      ],
    },
    {
      title: 'Publicação Rápida',
      items: [
        { label: 'Gerar Postagem', href: '/gerar-postagem', icon: Share2 },
        { label: 'Mensagem Avulsa', href: '/mensagem-avulsa', icon: FileEdit },
        { label: 'Agenda de Envios', href: '/agenda', icon: Calendar },
      ],
    },
    {
      title: 'Motores & Automação',
      items: [
        { label: 'Automação (Fila & Curador)', href: '/automacao', icon: Zap },
        { label: 'Analytics de Grupos', href: '/analytics', icon: Users },
        { label: 'Relatórios de Performance', href: '/relatorios', icon: BarChart3 },
      ],
    },
    {
      title: 'Divulgação & Marca',
      items: [
        { label: 'Bio Link Público', href: '/bio-link', icon: Smartphone },
        { label: 'Gerador Stories 9:16', href: '/stories', icon: Send },
        { label: 'Configurações', href: '/ajustes', icon: Settings },
      ],
    },
  ];

  return (
    <aside className="hidden md:flex flex-col w-20 xl:w-64 h-screen fixed left-0 top-0 bg-[#0c0c0d] border-r border-[#2c2c2c] z-40 select-none transition-all duration-200">
      {/* Top Logo */}
      <div className="p-3.5 xl:p-5 border-b border-[#2c2c2c] flex items-center justify-center xl:justify-start">
        <Link href="/painel" className="block">
          <div className="xl:hidden">
            <Logo size="sm" />
          </div>
          <div className="hidden xl:block">
            <Logo size="md" />
          </div>
        </Link>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-2 xl:px-3 py-4 space-y-5">
        {navGroups.map((group) => (
          <div key={group.title}>
            <p className="hidden xl:block px-3 text-[10px] font-bold uppercase tracking-wider text-[#a8a39a]/70 mb-2">
              {group.title}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={`flex items-center justify-center xl:justify-between px-2.5 xl:px-3 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                      isActive
                        ? 'bg-[#161616] text-[#f5c542] border border-[#f5c542]/30 shadow-sm'
                        : 'text-[#a8a39a] hover:text-[#f6f2e8] hover:bg-[#161616]/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-[#f5c542]' : 'text-[#a8a39a]'}`} />
                      <span className="hidden xl:inline">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="hidden xl:inline text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#f5c542]/15 text-[#f5c542] border border-[#f5c542]/30">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* WhatsApp Status Footer */}
      <div className="p-2.5 xl:p-3 border-t border-[#2c2c2c] bg-[#161616]/40">
        <Link
          href="/conexao-whatsapp"
          className="flex items-center justify-center xl:justify-between p-2 rounded-xl bg-[#0c0c0d] border border-[#2c2c2c] hover:border-[#f5c542]/40 transition-colors"
          title={waConnected ? 'WhatsApp Conectado — Clique para gerenciar' : 'WhatsApp Desconectado — Clique para conectar'}
        >
          <div className="flex items-center gap-2">
            {waConnected ? (
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#5fd0a0]/15 text-[#5fd0a0]">
                <Wifi className="w-4 h-4" />
              </div>
            ) : (
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#f07878]/15 text-[#f07878]">
                <WifiOff className="w-4 h-4" />
              </div>
            )}
            <div className="hidden xl:block leading-none text-left">
              <p className="text-xs font-bold text-[#f6f2e8] truncate max-w-[110px]">{accountLabel}</p>
              <p
                className={`text-[10px] mt-0.5 font-medium ${
                  waConnected ? 'text-[#5fd0a0]' : 'text-[#f07878]'
                }`}
              >
                {waConnected ? 'Online' : 'Desconectado'}
              </p>
            </div>
          </div>
          <span className="hidden xl:inline text-[11px] font-semibold text-[#f5c542]">
            {waConnected ? 'Ver Grupos' : 'Parear'}
          </span>
        </Link>
      </div>
    </aside>
  );
}
