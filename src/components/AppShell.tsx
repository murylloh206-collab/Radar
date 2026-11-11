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
  Sparkles,
  FlaskConical,
} from 'lucide-react';
import { useWhatsAppWorkspace } from '@/components/WhatsAppWorkspaceProvider';
import { usePlan } from '@/components/PlanProvider';
import { PlanId } from '@/lib/plans-config';
import { BrandLogo } from '@/components/BrandLogo';

interface AppShellProps {
  children: React.ReactNode;
}

const STANDALONE_PAGES = ['/login', '/cadastro', '/termos', '/ajuda', '/grupo'];

function isStandalonePage(pathname: string | null): boolean {
  if (!pathname) return false;
  if (STANDALONE_PAGES.includes(pathname) || pathname.startsWith('/grupo/')) return true;
  if (
    pathname.startsWith('/r/') ||
    pathname.startsWith('/u/') ||
    pathname.startsWith('/@') ||
    pathname.startsWith('/%40')
  ) {
    return true;
  }
  return false;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  // Rotas públicas, autenticação e vitrines independentes não renderizam a barra lateral nem os menus operacionais
  if (isStandalonePage(pathname)) {
    return <>{children}</>;
  }

  const sharedWhatsApp = useWhatsAppWorkspace();
  const { isDevMode, subscription, planDefinition, quota, setTestPlan, hasFeature } = usePlan();
  const canUsePanelBranding = hasFeature('panel_branding');
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showStoresDialog, setShowStoresDialog] = useState(false);

  // Branding personalizado do painel (Plus e Ultimate)
  const [customPanelName, setCustomPanelName] = useState<string>('Radar de Ofertas');
  const [customPanelLogoUrl, setCustomPanelLogoUrl] = useState<string | null>(null);
  const [customAccentColor, setCustomAccentColor] = useState<string>('#1CCAF2');

  // Informações de autenticação e conexão reais
  const [userName, setUserName] = useState<string>('Minha Conta');
  const [userEmail, setUserEmail] = useState<string>('');
  const [waConnected, setWaConnected] = useState<boolean>(false);
  const [waStatusLabel, setWaStatusLabel] = useState('Consultando WhatsApp…');
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

  // Carrega sessão do usuário e configurações de marca do painel
  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.user) {
          if (data.user.email) {
            setUserEmail(data.user.email);
            const prefix = data.user.email.split('@')[0];
            const cleanName = prefix
              .split(/[._-]/)
              .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ');
            setUserName(cleanName || 'Usuário');
          }
        }
      })
      .catch(() => {});

    const fetchBranding = () => {
      fetch('/api/brand-settings')
        .then((r) => r.json())
        .then((data) => {
          if (data.ok && data.settings) {
            setCustomPanelName(data.settings.panelName || 'Radar de Ofertas');
            setCustomPanelLogoUrl(data.settings.panelLogoUrl || null);
            setCustomAccentColor(data.settings.accentColor || '#1CCAF2');
          }
        })
        .catch(() => {});
    };

    fetchBranding();
    window.addEventListener('brand-settings-updated', fetchBranding);
    return () => window.removeEventListener('brand-settings-updated', fetchBranding);
  }, []);

  useEffect(() => {
    const account = sharedWhatsApp.workspace?.connection;
    setWaConnected(account?.status === 'connected');
    setWaStatusLabel(account?.statusLabel || (sharedWhatsApp.loading ? 'Carregando WhatsApp…' : 'Selecione seu WhatsApp'));
    setWaPhone(account?.phoneNumber || '');
  }, [sharedWhatsApp.workspace, sharedWhatsApp.loading]);

  // Fecha menu móvel ao mudar de rota
  useEffect(() => {
    setMenuOpen(false);
    setAccountMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      sharedWhatsApp.clear();
    } catch {}
    document.cookie = 'radar_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0;';
    window.location.href = '/login';
  };

  const getPageTitle = () => {
    if (pathname === '/') return 'Início';
    if (pathname.startsWith('/copiador')) return 'Copiador';
    if (pathname.startsWith('/criar-conteudo') || pathname.startsWith('/gerar-postagem') || pathname.startsWith('/mensagem-avulsa') || pathname.startsWith('/stories')) return 'Criar conteúdo';
    if (pathname.startsWith('/ofertas')) return 'Ofertas';
    if (pathname.startsWith('/envios') || pathname.startsWith('/agenda')) return 'Envios';
    if (pathname.startsWith('/estatisticas') || pathname.startsWith('/resultados') || pathname.startsWith('/analytics') || pathname.startsWith('/relatorios')) return 'Estatísticas';
    if (pathname.startsWith('/pagina-publica') || pathname.startsWith('/bio-link')) return 'Página pública';
    if (pathname.startsWith('/conexoes') || pathname.startsWith('/conexao-whatsapp') || pathname.startsWith('/conectar-lojas') || pathname.startsWith('/ajustes')) return 'Conexões';
    if (pathname.startsWith('/planos')) return 'Planos e Assinatura';
    return 'Início';
  };

  const pageTitle = getPageTitle();

  const isCurrent = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const userInitials = (userName || 'MC')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'MC';

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

        {/* Marca do Painel (Personalizável no Plus e Ultimate) */}
        <Link href="/" className="rdv3-brand">
          {canUsePanelBranding && customPanelLogoUrl ? (
            <img
              src={customPanelLogoUrl}
              alt={customPanelName}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                objectFit: 'cover',
                border: `1.5px solid ${customAccentColor}`,
              }}
            />
          ) : (
            <span
              className="rdv3-brand-mark"
              aria-hidden="true"
              style={canUsePanelBranding ? { color: customAccentColor, borderColor: customAccentColor } : undefined}
            >
              ◎
            </span>
          )}
          <span>
            <strong style={canUsePanelBranding ? { color: '#f8fbff' } : undefined}>
              {canUsePanelBranding && customPanelName
                ? customPanelName.split(' ')[0].toUpperCase()
                : 'RADAR'}
            </strong>
            <small>
              {canUsePanelBranding && customPanelName
                ? customPanelName.split(' ').slice(1).join(' ').toUpperCase() || 'PAINEL PRO'
                : 'DE OFERTAS'}
            </small>
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
            href="/estatisticas"
            className={isCurrent('/estatisticas') || isCurrent('/resultados') ? 'rdv3-active' : ''}
            aria-current={isCurrent('/estatisticas') ? 'page' : undefined}
          >
            <span className="nav-icon">
              <BarChart3 className="w-3.5 h-3.5" />
            </span>
            Estatísticas
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

          <Link
            href="/planos"
            className={isCurrent('/planos') ? 'rdv3-active' : ''}
            aria-current={isCurrent('/planos') ? 'page' : undefined}
          >
            <span className="nav-icon">
              <Sparkles className="w-3.5 h-3.5 text-[#818cf8]" />
            </span>
            Planos
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 999,
                background: 'rgba(99, 102, 241, 0.2)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                color: '#c7d2fe',
                fontWeight: 600,
              }}
            >
              {planDefinition.name}
            </span>
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
          {canUsePanelBranding && customPanelLogoUrl ? (
            <img
              src={customPanelLogoUrl}
              alt={customPanelName}
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                objectFit: 'cover',
                border: `1.5px solid ${customAccentColor}`,
              }}
            />
          ) : (
            <span className="rdv3-brand-mark" aria-hidden="true">
              ◎
            </span>
          )}
          <span>
            <strong>
              {canUsePanelBranding && customPanelName
                ? customPanelName.split(' ')[0].toUpperCase()
                : 'RADAR'}
            </strong>
            <small>
              {canUsePanelBranding && customPanelName
                ? customPanelName.split(' ').slice(1).join(' ').toUpperCase() || 'PAINEL'
                : 'DE OFERTAS'}
            </small>
          </span>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="rdv3-content">
        <div className="rdv3-top" style={{ flexWrap: 'wrap', gap: 10 }}>
          <span className="rdv3-crumb">
            Radar de Ofertas / <span className="rp-location">{pageTitle}</span>
          </span>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginLeft: 'auto' }}>
            {/* Contador diário de ofertas do plano */}
            <Link
              href="/planos"
              title="Limite diário de ofertas postadas no seu plano atual"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
                background: quota.limitReached
                  ? 'rgba(239, 68, 68, 0.16)'
                  : 'rgba(99, 102, 241, 0.14)',
                border: quota.limitReached
                  ? '1px solid rgba(239, 68, 68, 0.45)'
                  : '1px solid rgba(99, 102, 241, 0.32)',
                color: quota.limitReached ? '#fca5a5' : '#e0e7ff',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Plano {planDefinition.name}:</span>
              <strong>
                {quota.dailyLimit === null
                  ? `${quota.postedToday} hoje (Ilimitado)`
                  : `${quota.postedToday}/${quota.dailyLimit} ofertas hoje`}
              </strong>
              {quota.limitReached && (
                <span style={{ textDecoration: 'underline', marginLeft: 4 }}>Fazer upgrade</span>
              )}
            </Link>

            {/* Seletor "Plano de teste" — VISÍVEL E FUNCIONAL EXCLUSIVAMENTE EM DESENVOLVIMENTO (NODE_ENV !== 'production') */}
            {isDevMode && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: 'rgba(245, 158, 11, 0.14)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  fontSize: 11,
                  color: '#fde68a',
                }}
                title="Visível apenas em ambiente de desenvolvimento (NODE_ENV !== production)"
              >
                <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
                <span style={{ fontWeight: 600 }}>Plano de teste (DEV):</span>
                {(['impulse', 'plus', 'ultimate'] as PlanId[]).map((pid) => {
                  const active = subscription.plano === pid;
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={async () => {
                        const ok = await setTestPlan(pid, subscription.ciclo);
                        if (ok) {
                          setFeedback(`Plano de teste alterado para ${pid.toUpperCase()} (Modo Dev)`);
                          setTimeout(() => setFeedback(null), 3000);
                        }
                      }}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        border: active ? '1px solid #fbbf24' : '1px solid transparent',
                        background: active ? '#f59e0b' : 'rgba(0,0,0,0.25)',
                        color: active ? '#090d16' : '#fef3c7',
                        fontWeight: active ? 700 : 500,
                        fontSize: 11,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {pid}
                    </button>
                  );
                })}
              </div>
            )}

            <span
              className={waConnected ? 'rdv3-connected' : 'rdv3-connected rdv3-disconnected'}
              title={waConnected ? `Conectado via ${waPhone || 'WhatsApp'}` : 'WhatsApp desconectado'}
            >
              {waStatusLabel}
            </span>
          </div>
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
          style={{ position: 'fixed', inset: 0, margin: 'auto', zIndex: 9999 }}
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
            <a href="https://shopee.com.br" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <BrandLogo brand="shopee" size={24} containerSize={36} />
              <span style={{ fontWeight: 500 }}>Shopee</span>
              <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>↗</span>
            </a>
            <a href="https://www.netshoes.com.br" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <BrandLogo brand="netshoes" size={24} containerSize={36} />
              <span style={{ fontWeight: 500 }}>Netshoes</span>
              <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>↗</span>
            </a>
            <a href="https://www.amazon.com.br" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <BrandLogo brand="amazon" size={24} containerSize={36} />
              <span style={{ fontWeight: 500 }}>Amazon</span>
              <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>↗</span>
            </a>
            <a href="https://www.mercadolivre.com.br" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <BrandLogo brand="mercadolivre" size={24} containerSize={36} />
              <span style={{ fontWeight: 500 }}>Mercado Livre</span>
              <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>↗</span>
            </a>
            <a href="https://www.magazineluiza.com.br" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <BrandLogo brand="magalu" size={24} containerSize={36} />
              <span style={{ fontWeight: 500 }}>Magalu</span>
              <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>↗</span>
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
                value={userEmail || 'Não informado'}
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
              <strong>Planos SaaS (Impulse, Plus e Ultimate):</strong>
              <br />• <strong>Impulse:</strong> Até 30 ofertas/dia, copiador de grupos, marca d&apos;água padrão, envio seguro e métricas básicas do WhatsApp.
              <br />• <strong>Plus (7 dias grátis):</strong> Ofertas ilimitadas, marca d&apos;água personalizável, legendas com IA, cards Feed/Story, selo de promoção real, vitrine <code>/@slug</code>, Telegram e métricas da plataforma.
              <br />• <strong>Ultimate:</strong> Buscador comparador multiloja, relatório de vendas convertidas por loja (API Shopee + CSV), alerta de queda de preço, &quot;O que postar hoje&quot;, Radar de Oportunidades (fila de revisão), relatório semanal e equipe/múltiplos canais.
            </p>
            <p>
              <strong>1. Copiador & Criar Conteúdo:</strong> Capture ofertas, aplique sua marca d&apos;água, gere cards 9:16 e dispare com link <code>?src=</code> rastreado.
            </p>
            <p>
              <strong>2. Ofertas & Inteligência:</strong> Consulte o Buscador Comparador, acompanhe o Radar de Oportunidades (sempre com aprovação manual) e crie alertas de preço.
            </p>
            <p>
              <strong>3. Estatísticas & Conexões:</strong> Acompanhe cliques por origem, vendas convertidas, equipe e status do motor em segundo plano.
            </p>

            <div className="rp-row rp-section" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Link
                href="/ajuda"
                className="rp-btn rp-quiet"
                onClick={() => setShowHelpDialog(false)}
              >
                Abrir Central de Ajuda
              </Link>
              <Link
                href="/termos"
                className="rp-btn rp-quiet"
                onClick={() => setShowHelpDialog(false)}
              >
                Termos de Uso
              </Link>
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

