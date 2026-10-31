'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowLeftRight,
  PenTool,
  Tag,
  Send,
  BarChart3,
  Globe,
  Radio,
  ChevronDown,
  X,
  ExternalLink,
  User,
  HelpCircle,
  LogOut,
  Sliders,
  Check,
} from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showStoresDialog, setShowStoresDialog] = useState(false);

  // Informações de autenticação e conexão reais
  const [userName, setUserName] = useState('Muryllo Henrique');
  const [userEmail, setUserEmail] = useState('');
  const [waConnected, setWaConnected] = useState<boolean>(false);
  const [waPhone, setWaPhone] = useState<string>('');
  const [prefNightPause, setPrefNightPause] = useState(true);
  const [prefInterval, setPrefInterval] = useState(30);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Escuta evento customizado para abrir o diálogo de lojas de qualquer lugar
  useEffect(() => {
    const handleOpenStores = () => setShowStoresDialog(true);
    window.addEventListener('open-stores-dialog', handleOpenStores);
    return () => window.removeEventListener('open-stores-dialog', handleOpenStores);
  }, []);

  // Carrega sessão do usuário e status real do WhatsApp
  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.user) {
          if (data.user.email) setUserEmail(data.user.email);
        }
      })
      .catch(() => {});

    fetch('/api/whatsapp/connect')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.whatsapp) {
          setWaConnected(data.whatsapp.status === 'connected');
          if (data.whatsapp.profileName) setUserName(data.whatsapp.profileName);
          if (data.whatsapp.phoneNumber) setWaPhone(data.whatsapp.phoneNumber);
        }
      })
      .catch(() => {});
  }, []);

  // Fecha menu móvel ao mudar de rota
  useEffect(() => {
    setMenuOpen(false);
    setAccountMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    startTransition(() => {
      router.push('/login');
    });
  };

  const getPageTitle = () => {
    if (pathname === '/') return 'Início';
    if (pathname.startsWith('/copiador')) return 'Copiador';
    if (pathname.startsWith('/criar-conteudo') || pathname.startsWith('/gerar-postagem') || pathname.startsWith('/mensagem-avulsa') || pathname.startsWith('/stories')) return 'Criar conteúdo';
    if (pathname.startsWith('/ofertas')) return 'Ofertas';
    if (pathname.startsWith('/envios') || pathname.startsWith('/agenda')) return 'Envios';
    if (pathname.startsWith('/resultados') || pathname.startsWith('/analytics') || pathname.startsWith('/relatorios')) return 'Resultados';
    if (pathname.startsWith('/pagina-publica') || pathname.startsWith('/bio-link')) return 'Página pública';
    if (pathname.startsWith('/conexoes') || pathname.startsWith('/conexao-whatsapp') || pathname.startsWith('/conectar-lojas') || pathname.startsWith('/ajustes')) return 'Conexões';
    return 'Início';
  };

  const pageTitle = getPageTitle();

  const isCurrent = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const userInitials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'MH';

  return (
    <div className="rdv3-app" data-menu-open={menuOpen ? 'true' : 'false'}>
      {/* Backdrop móvel */}
      <button
        className="rdv3-menu-backdrop"
        type="button"
        aria-label="Fechar menu"
        onClick={() => setMenuOpen(false)}
      />

      {/* Barra lateral compartilhada à esquerda */}
      <aside className="rdv3-sidebar" id="rdv3-sidebar-panel" aria-label="Menu do painel">
        <button
          className="rdv3-menu-button rdv3-close-menu"
          type="button"
          onClick={() => setMenuOpen(false)}
        >
          Fechar ✕
        </button>

        {/* Marca Radar de Ofertas */}
        <Link href="/" className="rdv3-brand">
          <span className="rdv3-brand-mark" aria-hidden="true">
            ◎
          </span>
          <span>
            <strong>RADAR</strong>
            <small>DE OFERTAS</small>
          </span>
        </Link>

        {/* Navegação principal nas 8 áreas */}
        <nav className="rdv3-nav" aria-label="Navegação principal">
          <h2>Visão geral</h2>
          <Link
            href="/"
            className={isCurrent('/') ? 'rdv3-active' : ''}
            aria-current={isCurrent('/') ? 'page' : undefined}
          >
            <span className="nav-icon">
              <LayoutDashboard className="w-3.5 h-3.5" />
            </span>
            Início
          </Link>

          <h2>Operação</h2>
          <Link
            href="/copiador"
            className={isCurrent('/copiador') ? 'rdv3-active' : ''}
            aria-current={isCurrent('/copiador') ? 'page' : undefined}
          >
            <span className="nav-icon">
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </span>
            Copiador
          </Link>

          <Link
            href="/criar-conteudo"
            className={isCurrent('/criar-conteudo') ? 'rdv3-active' : ''}
            aria-current={isCurrent('/criar-conteudo') ? 'page' : undefined}
          >
            <span className="nav-icon">
              <PenTool className="w-3.5 h-3.5" />
            </span>
            Criar conteúdo
          </Link>

          <Link
            href="/ofertas"
            className={isCurrent('/ofertas') ? 'rdv3-active' : ''}
            aria-current={isCurrent('/ofertas') ? 'page' : undefined}
          >
            <span className="nav-icon">
              <Tag className="w-3.5 h-3.5" />
            </span>
            Ofertas
          </Link>

          <Link
            href="/envios"
            className={isCurrent('/envios') ? 'rdv3-active' : ''}
            aria-current={isCurrent('/envios') ? 'page' : undefined}
          >
            <span className="nav-icon">
              <Send className="w-3.5 h-3.5" />
            </span>
            Envios
          </Link>

          <h2>Gestão</h2>
          <Link
            href="/resultados"
            className={isCurrent('/resultados') ? 'rdv3-active' : ''}
            aria-current={isCurrent('/resultados') ? 'page' : undefined}
          >
            <span className="nav-icon">
              <BarChart3 className="w-3.5 h-3.5" />
            </span>
            Resultados
          </Link>

          <Link
            href="/pagina-publica"
            className={isCurrent('/pagina-publica') ? 'rdv3-active' : ''}
            aria-current={isCurrent('/pagina-publica') ? 'page' : undefined}
          >
            <span className="nav-icon">
              <Globe className="w-3.5 h-3.5" />
            </span>
            Página pública
          </Link>

          <Link
            href="/conexoes"
            className={isCurrent('/conexoes') ? 'rdv3-active' : ''}
            aria-current={isCurrent('/conexoes') ? 'page' : undefined}
          >
            <span className="nav-icon">
              <Radio className="w-3.5 h-3.5" />
            </span>
            Conexões
          </Link>
        </nav>

        {/* Rodapé inferior esquerdo da lateral: Perfil e menu de conta */}
        <div className="rp-account-menu">
          <div
            className="rdv3-account"
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
            role="button"
            tabIndex={0}
            aria-expanded={accountMenuOpen}
            aria-label="Abrir menu de conta"
          >
            <span className="rdv3-avatar">{userInitials}</span>
            <span>
              <small>Minha conta</small>
              <strong>{userName}</strong>
            </span>
            <span className="rdv3-chevron" aria-hidden="true">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} />
            </span>
          </div>

          {accountMenuOpen && (
            <div className="rp-account-options">
              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen(false);
                  setShowAccountDialog(true);
                }}
              >
                <Sliders className="w-3.5 h-3.5 text-[#39bee6]" />
                Minha conta e preferências
              </button>

              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen(false);
                  setShowHelpDialog(true);
                }}
              >
                <HelpCircle className="w-3.5 h-3.5 text-[#aab2b7]" />
                Ajuda
              </button>

              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen(false);
                  handleLogout();
                }}
              >
                <LogOut className="w-3.5 h-3.5 text-[#e28585]" />
                Sair
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Cabeçalho mobile */}
      <header className="rdv3-mobile-head">
        <button
          className="rdv3-menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="rdv3-sidebar-panel"
          onClick={() => setMenuOpen(true)}
        >
          ☰ Menu
        </button>
        <div className="rdv3-brand">
          <span className="rdv3-brand-mark" aria-hidden="true">
            ◎
          </span>
          <span>
            <strong>RADAR</strong>
            <small>DE OFERTAS</small>
          </span>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="rdv3-content">
        <div className="rdv3-top">
          <span className="rdv3-crumb">
            Radar de Ofertas / <span className="rp-location">{pageTitle}</span>
          </span>
          <span
            className={waConnected ? 'rdv3-connected' : 'rdv3-connected rdv3-disconnected'}
            title={waConnected ? `Conectado via ${waPhone || 'WhatsApp'}` : 'WhatsApp desconectado'}
          >
            {waConnected ? 'WhatsApp conectado' : 'WhatsApp desconectado'}
          </span>
        </div>

        {/* Feedback toast global se ativo */}
        {feedback && (
          <div className="rp-toast" role="status">
            {feedback}
          </div>
        )}

        {children}
      </main>

      {/* Modal: Escolha uma loja */}
      {showStoresDialog && (
        <dialog
          className="rdv3-shop-dialog"
          open
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowStoresDialog(false);
          }}
        >
          <div className="rdv3-dialog-head">
            <div>
              <span className="rdv3-kicker">Acessos diretos</span>
              <h2>Escolha uma loja</h2>
            </div>
            <button
              className="rdv3-close-stores"
              type="button"
              aria-label="Fechar"
              onClick={() => setShowStoresDialog(false)}
            >
              ✕
            </button>
          </div>
          <p className="rdv3-dialog-desc">
            Os links abrem o site da loja em uma nova aba.
          </p>
          <div className="rdv3-store-options">
            <a href="https://shopee.com.br" target="_blank" rel="noopener noreferrer">
              <BrandLogo brand="shopee" size={20} containerSize={28} withBackground />
              Shopee
              <span>↗</span>
            </a>
            <a href="https://www.netshoes.com.br" target="_blank" rel="noopener noreferrer">
              <BrandLogo brand="netshoes" size={20} containerSize={28} withBackground />
              Netshoes
              <span>↗</span>
            </a>
            <a href="https://www.amazon.com.br" target="_blank" rel="noopener noreferrer">
              <BrandLogo brand="amazon" size={20} containerSize={28} withBackground />
              Amazon
              <span>↗</span>
            </a>
            <a href="https://www.mercadolivre.com.br" target="_blank" rel="noopener noreferrer">
              <BrandLogo brand="mercadolivre" size={20} containerSize={28} withBackground />
              Mercado Livre
              <span>↗</span>
            </a>
            <a href="https://www.magazineluiza.com.br" target="_blank" rel="noopener noreferrer">
              <BrandLogo brand="magalu" size={20} containerSize={28} withBackground />
              Magalu
              <span>↗</span>
            </a>
          </div>
        </dialog>
      )}

      {/* Modal: Minha conta e preferências */}
      {showAccountDialog && (
        <dialog
          className="rp-dialog"
          open
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAccountDialog(false);
          }}
        >
          <div className="rdv3-dialog-head">
            <div>
              <span className="rp-step">Perfil & Preferências</span>
              <h2>Minha Conta</h2>
            </div>
            <button
              className="rdv3-close-stores"
              type="button"
              aria-label="Fechar"
              onClick={() => setShowAccountDialog(false)}
            >
              ✕
            </button>
          </div>

          <div className="rp-stack rp-section">
            <label className="rp-field">
              Nome do titular
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
            </label>

            <label className="rp-field">
              E-mail da conta
              <input
                type="email"
                value={userEmail || 'muryllo@radardeofertas.com.br'}
                disabled
              />
            </label>

            <label className="rp-field">
              WhatsApp vinculado
              <input
                type="text"
                value={waPhone ? `+${waPhone}` : 'Nenhum número pareado'}
                disabled
              />
            </label>

            <label className="rp-check">
              <input
                type="checkbox"
                checked={prefNightPause}
                onChange={(e) => setPrefNightPause(e.target.checked)}
              />
              Pausa noturna de envios (22h30 às 07h30)
            </label>

            <label className="rp-field">
              Intervalo mínimo entre envios (segundos)
              <input
                type="number"
                min={10}
                max={300}
                value={prefInterval}
                onChange={(e) => setPrefInterval(Number(e.target.value))}
              />
            </label>

            <div className="rp-row rp-section">
              <button
                type="button"
                className="rp-btn rp-primary"
                onClick={() => {
                  setShowAccountDialog(false);
                  setFeedback('Preferências salvas com sucesso.');
                  setTimeout(() => setFeedback(null), 3500);
                }}
              >
                Salvar preferências
              </button>
              <button
                type="button"
                className="rp-btn rp-quiet"
                onClick={() => setShowAccountDialog(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </dialog>
      )}

      {/* Modal: Ajuda */}
      {showHelpDialog && (
        <dialog
          className="rp-dialog"
          open
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowHelpDialog(false);
          }}
        >
          <div className="rdv3-dialog-head">
            <div>
              <span className="rp-step">Suporte & Guia</span>
              <h2>Ajuda do Radar</h2>
            </div>
            <button
              className="rdv3-close-stores"
              type="button"
              aria-label="Fechar"
              onClick={() => setShowHelpDialog(false)}
            >
              ✕
            </button>
          </div>

          <div className="rp-stack rp-section" style={{ fontSize: 12, lineHeight: 1.6, color: '#c6ccce' }}>
            <p>
              <strong>1. Início:</strong> Visão geral rápida com carrossel de novidades, atalhos para as principais operações e lojas parceiras.
            </p>
            <p>
              <strong>2. Copiador:</strong> Espelhamento e conversão de grupos do WhatsApp. Capture promoções de grupos de garimpo e envie direto para seus canais.
            </p>
            <p>
              <strong>3. Criar conteúdo:</strong> Gere ofertas por link com metadados automáticos, redija mensagens livres, crie Stories 9:16 e gerencie seus templates.
            </p>
            <p>
              <strong>4. Ofertas:</strong> Seu catálogo de produtos aprovados, motor de busca automática e curadoria estratégica de notas e preços.
            </p>
            <p>
              <strong>5. Envios:</strong> Centralize a aprovação manual de ofertas, agendamentos futuros, campanhas em lote e histórico de entregas.
            </p>
            <p>
              <strong>6. Resultados:</strong> Desempenho e métricas dos seus grupos WhatsApp e relatórios de comissões por loja.
            </p>
            <p>
              <strong>7. Página pública:</strong> Sua vitrine pessoal (Bio Link) com suas redes, canais VIP e ofertas em destaque.
            </p>
            <p>
              <strong>8. Conexões:</strong> Gerenciamento seguro da conexão WhatsApp via Evolution API e credenciais das lojas de afiliados.
            </p>

            <div className="rp-row rp-section">
              <button
                type="button"
                className="rp-btn rp-primary"
                onClick={() => setShowHelpDialog(false)}
              >
                Entendi
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}

