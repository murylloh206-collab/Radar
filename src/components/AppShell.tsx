'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bot } from 'lucide-react';
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
  Camera,
} from 'lucide-react';
import { useWhatsAppWorkspace } from '@/components/WhatsAppWorkspaceProvider';
import { usePlan } from '@/components/PlanProvider';
import { PlanId } from '@/lib/plans-config';
import { BrandLogo } from '@/components/BrandLogo';
import { MotionLayer } from '@/components/MotionLayer';
import { AccountStudio } from '@/components/avatar/AccountStudio';
import { RadarAvatar, useSavedAvatar } from '@/components/avatar/RadarAvatar';

interface AppShellProps {
  children: React.ReactNode;
}

const STANDALONE_PAGES = ['/', '/login', '/cadastro', '/termos', '/privacidade', '/legal', '/ajuda', '/grupo'];

function isStandalonePage(pathname: string | null): boolean {
  if (!pathname) return false;
  if (STANDALONE_PAGES.includes(pathname) || pathname.startsWith('/grupo/') || pathname.startsWith('/legal/') || pathname === '/previa' || pathname.startsWith('/previa/')) return true;
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
  const [customAccentColor, setCustomAccentColor] = useState<string>('#f5c542');

  // Informações de autenticação e conexão reais
  const [userName, setUserName] = useState<string>('Minha Conta');
  const [userEmail, setUserEmail] = useState<string>('');
  const [waConnected, setWaConnected] = useState<boolean>(false);
  const [waStatusLabel, setWaStatusLabel] = useState('Consultando WhatsApp…');
  const [waPhone, setWaPhone] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const savedProfile = useSavedAvatar();

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
            setCustomAccentColor(data.settings.accentColor || '#f5c542');
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
    if (pathname === '/painel') return 'Início';
    if (pathname.startsWith('/copiador')) return 'Copiador';
    if (pathname.startsWith('/criar-conteudo') || pathname.startsWith('/gerar-postagem') || pathname.startsWith('/mensagem-avulsa') || pathname.startsWith('/stories')) return 'Criar conteúdo';
    if (pathname.startsWith('/assistente')) return 'Assistente';
    if (pathname.startsWith('/instagram-pro')) return 'Instagram Pro';
    if (pathname.startsWith('/ofertas')) return 'Ofertas';
    if (pathname.startsWith('/envios') || pathname.startsWith('/agenda')) return 'Envios';
    if (pathname.startsWith('/estatisticas') || pathname.startsWith('/resultados') || pathname.startsWith('/analytics') || pathname.startsWith('/relatorios')) return 'Estatísticas';
    if (pathname.startsWith('/pagina-publica') || pathname.startsWith('/bio-link')) return 'Página pública';
    if (pathname.startsWith('/conexoes') || pathname.startsWith('/conexao-whatsapp') || pathname.startsWith('/conectar-lojas') || pathname.startsWith('/ajustes')) return 'Conexões';
    if (pathname.startsWith('/planos')) return 'Planos e Assinatura';
    if (pathname.startsWith('/assinatura')) return 'Minha assinatura';
    return 'Início';
  };

  const pageTitle = getPageTitle();

  const isCurrent = (path: string) => {
    if (path === '/painel') return pathname === '/painel';
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
      <MotionLayer />
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
        <Link href="/painel" className="rdv3-brand">
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
            <strong style={canUsePanelBranding ? { color: '#f6f2e8' } : undefined}>
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
            href="/painel"
            className={isCurrent('/painel') ? 'rdv3-active' : ''}
            aria-current={isCurrent('/painel') ? 'page' : undefined}
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
            href="/assistente"
            className={isCurrent('/assistente') ? 'rdv3-active' : ''}
            aria-current={isCurrent('/assistente') ? 'page' : undefined}
          >
            <span className="nav-icon">
              <Bot className="w-3.5 h-3.5" />
            </span>
            Assistente
          </Link>

          <Link
            href="/instagram-pro"
            className={isCurrent('/instagram-pro') ? 'rdv3-active' : ''}
            aria-current={isCurrent('/instagram-pro') ? 'page' : undefined}
          >
            <span className="nav-icon">
              <Camera className="w-3.5 h-3.5" />
            </span>
            Instagram Pro
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
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            Planos
            <span className="rv4-plan-badge">
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
            {savedProfile.avatar ? <RadarAvatar config={savedProfile.avatar} size={38} /> : <span className="rdv3-avatar">{userInitials}</span>}
            <span>
              <small>Minha conta</small>
              <strong>{savedProfile.name || userName}</strong>
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
                <Sliders className="w-3.5 h-3.5 text-[#f5c542]" />
                Minha conta e preferências
              </button>

              <a
                href="/assinatura"
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:bg-white/5 rounded-lg"
                onClick={() => setAccountMenuOpen(false)}
              >
                <Sliders className="w-3.5 h-3.5 text-[#f5c542]" />
                Minha assinatura
              </a>

              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen(false);
                  setShowHelpDialog(true);
                }}
              >
                <HelpCircle className="w-3.5 h-3.5 text-[#a8a39a]" />
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
            Radar de Ofertas <span aria-hidden="true">/</span> <span className="rp-location">{pageTitle}</span>
          </span>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginLeft: 'auto' }}>
            {/* Contador diário de ofertas do plano */}
            <Link
              href="/planos"
              className="rv4-chip"
              data-tone={quota.limitReached ? 'bad' : undefined}
              title="Limite diário de ofertas postadas no seu plano atual"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Plano {planDefinition.name}</span>
              <strong>
                {quota.dailyLimit === null
                  ? `${quota.postedToday} hoje · ilimitado`
                  : `${quota.postedToday}/${quota.dailyLimit} ofertas hoje`}
              </strong>
              {quota.limitReached && (
                <span style={{ textDecoration: 'underline', marginLeft: 4 }}>Fazer upgrade</span>
              )}
            </Link>

            {/* Seletor "Plano de teste" — VISÍVEL E FUNCIONAL EXCLUSIVAMENTE EM DESENVOLVIMENTO (NODE_ENV !== 'production') */}
            {isDevMode && (
              <div
                className="rv4-chip"
                data-tone="dev"
                title="Visível apenas em ambiente de desenvolvimento (NODE_ENV !== production)"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Plano de teste</span>
                <span className="rv4-seg">
                  {(['impulse', 'plus', 'ultimate'] as PlanId[]).map((pid) => (
                    <button
                      key={pid}
                      type="button"
                      aria-pressed={subscription.plano === pid}
                      style={{ textTransform: 'capitalize' }}
                      onClick={async () => {
                        const ok = await setTestPlan(pid, subscription.ciclo);
                        if (ok) {
                          setFeedback(`Plano de teste alterado para ${pid.toUpperCase()} (Modo Dev)`);
                          setTimeout(() => setFeedback(null), 3000);
                        }
                      }}
                    >
                      {pid}
                    </button>
                  ))}
                </span>
              </div>
            )}

            <span
              className="rv4-chip"
              title={waConnected ? `Conectado via ${waPhone || 'WhatsApp'}` : 'WhatsApp desconectado'}
            >
              <span className="rv4-dot" data-on={waConnected ? 'true' : 'false'} />
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
              <span style={{ marginLeft: 'auto', color: '#a8a39a' }}>↗</span>
            </a>
            <a href="https://www.netshoes.com.br" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <BrandLogo brand="netshoes" size={24} containerSize={36} />
              <span style={{ fontWeight: 500 }}>Netshoes</span>
              <span style={{ marginLeft: 'auto', color: '#a8a39a' }}>↗</span>
            </a>
            <a href="https://www.amazon.com.br" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <BrandLogo brand="amazon" size={24} containerSize={36} />
              <span style={{ fontWeight: 500 }}>Amazon</span>
              <span style={{ marginLeft: 'auto', color: '#a8a39a' }}>↗</span>
            </a>
            <a href="https://www.mercadolivre.com.br" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <BrandLogo brand="mercadolivre" size={24} containerSize={36} />
              <span style={{ fontWeight: 500 }}>Mercado Livre</span>
              <span style={{ marginLeft: 'auto', color: '#a8a39a' }}>↗</span>
            </a>
            <a href="https://www.magazineluiza.com.br" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <BrandLogo brand="magalu" size={24} containerSize={36} />
              <span style={{ fontWeight: 500 }}>Magalu</span>
              <span style={{ marginLeft: 'auto', color: '#a8a39a' }}>↗</span>
            </a>
          </div>
        </dialog>
      )}

      {/* Minha conta: perfil e avatar (salvo neste aparelho) */}
      {showAccountDialog && (
        <AccountStudio
          userName={savedProfile.name || userName}
          userEmail={userEmail}
          waPhone={waPhone}
          onClose={() => setShowAccountDialog(false)}
          onSaved={() => {
            setShowAccountDialog(false);
            setFeedback('Perfil salvo neste aparelho.');
            setTimeout(() => setFeedback(null), 3500);
          }}
        />
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

          <div className="rp-stack rp-section" style={{ fontSize: 12, lineHeight: 1.6, color: '#cacaca' }}>
            <p>
              <strong>Planos SaaS (Impulse, Plus e Ultimate):</strong>
              <br />• <strong>Impulse:</strong> Copiador de grupos, modelos de mensagem, imagens originais do anúncio, agendamento, histórico de envios e métricas básicas do WhatsApp.
              <br />• <strong>Plus:</strong> Marca d&apos;água personalizável, identidade do painel, cards Feed/Story, vitrine <code>/@slug</code>, Telegram e métricas básicas de cliques.
              <br />• <strong>Ultimate:</strong> Buscador comparador multiloja, métricas por loja e visão consolidada, alerta de queda de preço, &quot;O que postar hoje&quot;, Radar de Oportunidades (fila de revisão) e equipe/múltiplos canais.
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

