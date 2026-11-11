'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BadgePercent,
  BellRing,
  ChartNoAxesCombined,
  CopyCheck,
  Expand,
  Eye,
  Fingerprint,
  Headphones,
  Lamp,
  LayoutTemplate,
  Link as LinkIcon,
  Menu,
  MessageSquareText,
  MessagesSquare,
  Palette,
  PanelsTopLeft,
  Play,
  Repeat2,
  Search,
  Send,
  SlidersHorizontal,
  Store,
  TextCursorInput,
} from 'lucide-react';
import { BillingCycle, PLAN_ORDER, PLANS_CONFIG } from '@/lib/plans-config';
import './radar-home.css';

interface RadarPromo {
  angle: number;
  distance: number;
  discount: string;
  name: string;
}

const RADAR_PROMOS: RadarPromo[] = [
  { angle: 20, distance: 0.62, discount: '-42%', name: 'Fone Bluetooth' },
  { angle: 68, distance: 0.78, discount: '-31%', name: 'Air Fryer' },
  { angle: 112, distance: 0.5, discount: '-55%', name: 'Tênis de corrida' },
  { angle: 158, distance: 0.74, discount: '-28%', name: 'Smartwatch' },
  { angle: 205, distance: 0.6, discount: '-47%', name: 'Cadeira gamer' },
  { angle: 248, distance: 0.8, discount: '-36%', name: 'Kit skincare' },
  { angle: 292, distance: 0.52, discount: '-60%', name: 'Liquidificador' },
  { angle: 338, distance: 0.72, discount: '-33%', name: 'Mochila' },
];

type CopyOrigin = 'tecnologia' | 'casa';
type MessageTone = 'direto' | 'proximo' | 'essencial';
type ArtFormat = 'feed' | 'story';
type FeatureKey =
  | 'copiador'
  | 'mensagens'
  | 'identidade'
  | 'cards'
  | 'vitrine'
  | 'metricas'
  | 'busca'
  | 'alertas';

const MESSAGE_TONES: Record<MessageTone, string> = {
  direto:
    'Uma opção para acompanhar sua rotina.\n\nDe R$ 179,90\nPor R$ 129,90\n\nConfira a oferta: [seu link de afiliado]',
  proximo:
    'Procurando um fone para o dia a dia? Confira esta opção.\n\nDe R$ 179,90 por R$ 129,90\n\nVeja os detalhes: [seu link de afiliado]',
  essencial: 'Fone sem fio\n\nR$ 129,90\n\n[seu link de afiliado]',
};

const ART_COLORS = [
  { hex: '#35d4ed', label: 'Ciano' },
  { hex: '#b8a3ff', label: 'Lavanda' },
  { hex: '#70d8ae', label: 'Menta' },
  { hex: '#f0c36d', label: 'Dourado suave' },
] as const;

interface FeatureModalInfo {
  title: string;
  text: string;
  anchor: string;
}

const FEATURES_INFO: Record<FeatureKey, FeatureModalInfo> = {
  copiador: {
    title: 'Copiador de ofertas',
    text: 'Defina a origem, os destinos, os horários e os filtros. A oferta passa pela conversão do link da sua conta antes de entrar no fluxo de envio.',
    anchor: '#rh-copiador',
  },
  mensagens: {
    title: 'Mensagens próprias',
    text: 'Salve um modelo com seu tom de voz. As informações da oferta preenchem o texto, sem inventar preço anterior, desconto ou disponibilidade.',
    anchor: '#rh-mensagens',
  },
  identidade: {
    title: 'Identidade da sua marca',
    text: 'A partir do Plus, personalize as cores do painel e configure a marca d’água com sua logo e seu @. No Impulse, use as imagens originais do anúncio.',
    anchor: '#rh-criacao',
  },
  cards: {
    title: 'Cards para feed e story',
    text: 'Prepare a oferta em formato quadrado ou vertical, com identidade visual e leitura adequada. A geração da arte é diferente da publicação nas redes sociais.',
    anchor: '#rh-criacao',
  },
  vitrine: {
    title: 'Sua vitrine no link da bio',
    text: 'Reúna ofertas em uma página compartilhável com os links da sua integração. A vitrine faz parte do Plus e do Ultimate.',
    anchor: '#rh-planos',
  },
  metricas: {
    title: 'Métricas com contexto',
    text: 'Impulse: métricas básicas do WhatsApp. Plus: também métricas básicas de cliques. Ultimate: visão por loja e consolidada, com vendas quando informadas pela integração. Cliques não garantem vendas nem identificam todos os visitantes.',
    anchor: '#rh-planos',
  },
  busca: {
    title: 'Buscador e comparador',
    text: 'No Ultimate, pesquise produtos e compare as ofertas encontradas nas lojas conectadas. Preço, frete, disponibilidade e cupons precisam ser conferidos nas condições da loja.',
    anchor: '#rh-planos',
  },
  alertas: {
    title: 'Alertas de queda de preço',
    text: 'No Ultimate, acompanhe produtos e os preços registrados. O alerta depende de novas consultas e da disponibilidade da integração; não é uma promessa de preço em tempo real.',
    anchor: '#rh-planos',
  },
};

const FAQ_ITEMS = [
  {
    id: 'rh-faq-1',
    question: 'Para quem é o Radar de Ofertas?',
    answer:
      'Para afiliados que divulgam produtos e querem organizar a preparação e a publicação de ofertas. Você conecta suas próprias contas e escolhe os canais de divulgação.',
  },
  {
    id: 'rh-faq-2',
    question: 'Preciso ser afiliado das lojas?',
    answer:
      'Sim. Para usar seus links, você precisa ter uma conta de afiliado aprovada na respectiva loja e configurar a integração. A assinatura do Radar não substitui esse cadastro nem garante aprovação.',
  },
  {
    id: 'rh-faq-3',
    question: 'Como funciona a assinatura?',
    answer:
      'Escolha Impulse, Plus ou Ultimate e a modalidade mensal ou anual. Confira o valor e as condições apresentados antes de concluir a contratação. Não há período de teste gratuito.',
  },
  {
    id: 'rh-faq-4',
    question: 'De quais grupos posso copiar ofertas?',
    answer:
      'Dos grupos aos quais o número conectado tem acesso e que você tem autorização para acompanhar. Você escolhe as origens e os destinos. O sistema não acessa grupos privados dos quais sua conta não participa.',
  },
  {
    id: 'rh-faq-5',
    question: 'Os links enviados serão os meus?',
    answer:
      'O fluxo usa a integração da sua conta para gerar o link de afiliado. Se a conversão ou a validação falhar, a oferta deve aguardar revisão, sem reutilizar o link de outro afiliado. A atribuição da venda segue as regras de cada loja.',
  },
  {
    id: 'rh-faq-6',
    question: 'Posso usar minha marca nas imagens e no painel?',
    answer:
      'Sim, a partir do Plus você pode personalizar cores e identidade do painel e configurar a marca d’água com sua logo e seu @. No Impulse, as imagens são as originais disponíveis no anúncio.',
  },
  {
    id: 'rh-risco',
    question: 'A conexão com o WhatsApp é oficial? Há risco de bloqueio?',
    answer:
      'A conexão utilizada não é oficial do WhatsApp. Existe risco de restrição ou bloqueio do número. O chamado “envio seguro” usa intervalos, horários e limites para reduzir envios excessivos; essas medidas não eliminam o risco nem garantem proteção. Respeite as regras do WhatsApp e envie apenas para públicos que aceitam receber suas mensagens.',
  },
  {
    id: 'rh-faq-8',
    question: 'As métricas mostram todas as vendas e quem clicou?',
    answer:
      'Não necessariamente. Cliques registrados não são a mesma coisa que pessoas identificadas, e as vendas dependem dos relatórios e das regras de atribuição de cada loja. O painel deve distinguir cliques, vendas informadas e comissões confirmadas, sem apresentar dados ausentes como resultados reais.',
  },
] as const;

function formatBrlNumber(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function AmbientRadar() {
  const ambientRef = useRef<HTMLDivElement | null>(null);
  const radarRef = useRef<HTMLDivElement | null>(null);
  const sweepRef = useRef<HTMLDivElement | null>(null);
  const blipRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tagRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const ambient = ambientRef.current;
    const radar = radarRef.current;
    const sweep = sweepRef.current;
    if (!ambient || !radar || !sweep) return;

    const fitRadarLabels = () => {
      const sceneRect = ambient.getBoundingClientRect();
      blipRefs.current.forEach((el, index) => {
        const tag = tagRefs.current[index];
        if (!el || !tag) return;
        const x = el.getBoundingClientRect().left - sceneRect.left;
        const w = tag.offsetWidth;
        let offset = el.classList.contains('lft') ? -w - 20 : 20;
        offset = Math.min(Math.max(offset, 12 - x), sceneRect.width - 12 - x - w);
        tag.style.left = `${offset}px`;
        tag.style.right = 'auto';
      });
    };

    const updateRadarDimensions = () => {
      const minSide = Math.min(ambient.clientWidth, ambient.clientHeight);
      radar.style.width = `${Math.min(1000, minSide * 1.12)}px`;
      fitRadarLabels();
    };

    updateRadarDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateRadarDimensions();
    });
    resizeObserver.observe(ambient);

    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts?.ready.then(() => {
        fitRadarLabels();
      });
    }

    const started = performance.now();
    let activeIndex = -1;
    let rafId = 0;

    const animateRadar = (now: number) => {
      const angle = (((now - started) / 18000) * 360) % 360;
      sweep.style.transform = `rotate(${angle}deg)`;

      let current = RADAR_PROMOS.length - 1;
      for (let i = 0; i < RADAR_PROMOS.length; i += 1) {
        if (RADAR_PROMOS[i].angle <= angle) {
          current = i;
        }
      }

      if (current !== activeIndex) {
        if (activeIndex >= 0 && blipRefs.current[activeIndex]) {
          blipRefs.current[activeIndex]?.classList.remove('on');
        }
        if (blipRefs.current[current]) {
          blipRefs.current[current]?.classList.add('on');
        }
        activeIndex = current;
      }

      rafId = window.requestAnimationFrame(animateRadar);
    };

    rafId = window.requestAnimationFrame(animateRadar);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="ambient-bg" aria-hidden="true" ref={ambientRef}>
      <div className="ambient-grid" />
      <div className="ambient-radar" ref={radarRef}>
        <div className="ambient-rings" />
        <div className="ambient-sweep" ref={sweepRef} />
        {RADAR_PROMOS.map((promo, index) => {
          const rad = (promo.angle * Math.PI) / 180;
          const isLeft = Math.sin(rad) < 0;
          const leftPct = 50 + promo.distance * 50 * Math.sin(rad);
          const topPct = 50 - promo.distance * 50 * Math.cos(rad);
          return (
            <div
              key={promo.name}
              ref={(el) => {
                blipRefs.current[index] = el;
              }}
              className={`ambient-blip${isLeft ? ' lft' : ''}`}
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            >
              <span
                ref={(el) => {
                  tagRefs.current[index] = el;
                }}
                className="ambient-tag"
              >
                <b>{promo.discount}</b>
                {promo.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DialogState {
  kicker: string;
  title: string;
  text: string;
  label: string;
  artUrl?: string;
  targetAnchor?: string;
}

export default function RadarPublicHomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [origin, setOrigin] = useState<CopyOrigin>('tecnologia');
  const [copyStatus, setCopyStatus] = useState(
    'Escolha uma origem e veja como a oferta será preparada.'
  );
  const [tone, setTone] = useState<MessageTone>('direto');
  const [format, setFormat] = useState<ArtFormat>('feed');
  const [color, setColor] = useState<string>('#35d4ed');
  const [brand, setBrand] = useState<string>('');
  const [photoStatus, setPhotoStatus] = useState<string>('');
  const [isGeneratingArt, setIsGeneratingArt] = useState(false);
  const [billing, setBilling] = useState<BillingCycle>('mensal');
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);
  const [dialogData, setDialogData] = useState<DialogState>({
    kicker: 'Conheça o recurso',
    title: '',
    text: '',
    label: 'Entendi',
  });

  const navRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const productPhotoRef = useRef<HTMLImageElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const activeArtBlobUrlRef = useRef<string | null>(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const scrollToAnchor = useCallback(
    (anchor: string) => {
      closeMenu();
      const cleanId = anchor.replace(/^#/, '');
      if (cleanId === 'rh-risco') {
        setOpenFaqId('rh-risco');
      }
      const target = document.getElementById(cleanId);
      if (target) {
        target.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    },
    [closeMenu]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuOpen) return;
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (activeArtBlobUrlRef.current) {
        URL.revokeObjectURL(activeArtBlobUrlRef.current);
      }
    };
  }, []);

  const openModal = useCallback((nextState: DialogState, triggerEl?: HTMLElement | null) => {
    lastTriggerRef.current =
      triggerEl || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setDialogData(nextState);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const handleDialogClose = useCallback(() => {
    if (activeArtBlobUrlRef.current) {
      URL.revokeObjectURL(activeArtBlobUrlRef.current);
      activeArtBlobUrlRef.current = null;
    }
    const trigger = lastTriggerRef.current;
    if (trigger && typeof trigger.focus === 'function') {
      trigger.focus();
    }
  }, []);

  const closeDialog = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const handleDialogAction = useCallback(() => {
    const targetAnchor = dialogData.targetAnchor;
    dialogRef.current?.close();
    if (targetAnchor) {
      scrollToAnchor(targetAnchor);
    }
  }, [dialogData.targetAnchor, scrollToAnchor]);

  const handleSelectOrigin = (nextOrigin: CopyOrigin) => {
    setOrigin(nextOrigin);
    setCopyStatus('Escolha uma origem e veja como a oferta será preparada.');
  };

  const handleSimulateCopy = () => {
    const label = origin === 'tecnologia' ? 'Achados de tecnologia' : 'Seleção para casa';
    setCopyStatus(
      `Prévia preparada: ${label} → Meu grupo de ofertas. Simulação concluída; nenhuma mensagem enviada.`
    );
  };

  const handleExpandArt = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const triggerButton = event.currentTarget;
    setIsGeneratingArt(true);
    setPhotoStatus('Preparando sua arte…');

    try {
      const photo = productPhotoRef.current;
      if (!photo) throw new Error('photo-missing');
      if (typeof photo.decode === 'function') {
        await photo.decode();
      }

      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = format === 'story' ? 1920 : 1080;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');

      const w = canvas.width;
      const h = canvas.height;

      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#122535');
      bg.addColorStop(1, '#0d1729');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, w - 4, h - 4);

      ctx.font = '600 30px Inter, Arial, sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(brand.trim() || 'SUA MARCA', 48, 75, 984);

      const box = { x: 48, y: 110, w: 984, h: h - 300 };
      ctx.fillStyle = '#080d18';
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, 24);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, 24);
      ctx.clip();

      const scale = Math.min(box.w / photo.naturalWidth, box.h / photo.naturalHeight);
      const pw = photo.naturalWidth * scale;
      const ph = photo.naturalHeight * scale;
      ctx.drawImage(photo, box.x + (box.w - pw) / 2, box.y + (box.h - ph) / 2, pw, ph);
      ctx.restore();

      ctx.fillStyle = '#f4f6fa';
      ctx.font = '500 36px Inter, Arial, sans-serif';
      ctx.fillText('Camiseta oversized', 48, h - 123);
      ctx.fillText('preta', 48, h - 76);

      ctx.fillStyle = color;
      ctx.font = '600 76px Georgia, serif';
      ctx.textAlign = 'right';
      ctx.fillText('R$ 59,90', 1032, h - 91);

      ctx.fillStyle = '#a7bdcf';
      ctx.font = '400 24px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Preço ilustrativo · foto fornecida', 540, h - 27);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('export');

      if (activeArtBlobUrlRef.current) {
        URL.revokeObjectURL(activeArtBlobUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      activeArtBlobUrlRef.current = url;

      openModal(
        {
          kicker: 'Sua personalização',
          title: format === 'story' ? 'Story · 9:16' : 'Feed · 1:1',
          text: 'Foto fornecida e preço ilustrativo.',
          label: 'Voltar à edição',
          artUrl: url,
        },
        triggerButton
      );

      setPhotoStatus(`Arte preparada no formato ${format === 'story' ? '9:16' : '1:1'}.`);
    } catch {
      setPhotoStatus('Não foi possível preparar a arte. Tente novamente.');
    } finally {
      setIsGeneratingArt(false);
    }
  };

  const handleOpenFeature = (
    key: FeatureKey,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const info = FEATURES_INFO[key];
    openModal(
      {
        kicker: 'Conheça o recurso',
        title: info.title,
        text: info.text,
        label: info.anchor === '#rh-planos' ? 'Ver planos' : 'Experimentar a demonstração',
        targetAnchor: info.anchor,
      },
      event.currentTarget
    );
  };

  const displayBrand = brand.trim() || 'SUA MARCA';

  return (
    <div id="radar-scene">
      <AmbientRadar />
      <div id="radar-home" lang="pt-BR">
        <header className="nav" ref={navRef}>
          <div className="shell nav-row">
            <a
              className="logo"
              href="#rh-inicio"
              aria-label="Radar de Ofertas, início"
              onClick={(e) => {
                e.preventDefault();
                scrollToAnchor('#rh-inicio');
              }}
            >
              <span className="radar" aria-hidden="true" />
              <span className="wordmark">
                RADAR
                <small>DE OFERTAS</small>
              </span>
            </a>

            <nav className="nav-links" aria-label="Navegação principal">
              <a
                href="#rh-recursos"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToAnchor('#rh-recursos');
                }}
              >
                Funcionalidades
              </a>
              <a
                href="#rh-como"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToAnchor('#rh-como');
                }}
              >
                Como funciona
              </a>
              <a
                href="#rh-planos"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToAnchor('#rh-planos');
                }}
              >
                Planos
              </a>
              <a
                href="#rh-faq"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToAnchor('#rh-faq');
                }}
              >
                FAQ
              </a>
            </nav>

            <div className="nav-actions">
              <Link href="/login">Entrar</Link>
              <Link href="/cadastro" className="action primary">
                Começar agora <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>

            <button
              ref={menuButtonRef}
              type="button"
              className="menu-button"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              aria-controls="rh-menu"
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              <Menu aria-hidden="true" />
            </button>
          </div>

          <nav
            id="rh-menu"
            className="mobile-menu"
            aria-label="Menu móvel"
            hidden={!menuOpen}
          >
            <a
              href="#rh-recursos"
              onClick={(e) => {
                e.preventDefault();
                scrollToAnchor('#rh-recursos');
              }}
            >
              Funcionalidades
            </a>
            <a
              href="#rh-como"
              onClick={(e) => {
                e.preventDefault();
                scrollToAnchor('#rh-como');
              }}
            >
              Como funciona
            </a>
            <a
              href="#rh-planos"
              onClick={(e) => {
                e.preventDefault();
                scrollToAnchor('#rh-planos');
              }}
            >
              Planos
            </a>
            <a
              href="#rh-faq"
              onClick={(e) => {
                e.preventDefault();
                scrollToAnchor('#rh-faq');
              }}
            >
              FAQ
            </a>
            <Link href="/login" onClick={closeMenu}>
              Entrar
            </Link>
            <Link href="/cadastro" className="action primary" onClick={closeMenu}>
              Começar agora
            </Link>
          </nav>
        </header>

        <main>
          <section id="rh-inicio" className="hero center">
            <div className="shell">
              <div className="eyebrow">Para quem divulga ofertas</div>
              <h1>
                Sua marca. Suas ofertas.
                <br />
                Mais <span className="highlight">controle.</span>
              </h1>
              <p className="lead">
                Organize ofertas do Mercado Livre e da Shopee, personalize suas mensagens e
                automatize a divulgação no WhatsApp e no Telegram em um só painel.
              </p>
              <div className="actions">
                <Link href="/cadastro" className="action primary">
                  Começar agora <ArrowRight aria-hidden="true" />
                </Link>
                <a
                  href="#rh-como"
                  className="action"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToAnchor('#rh-como');
                  }}
                >
                  Ver como funciona <Play aria-hidden="true" />
                </a>
              </div>
              <p className="trust">
                Sua divulgação, organizada. Escolha o plano que acompanha sua rotina.
              </p>

              <div className="browser">
                <div className="browser-bar">
                  <span className="dots" aria-hidden="true">
                    ●●●
                  </span>
                  Radar · visão da operação
                  <span className="demo-label">Demonstração — dados de exemplo</span>
                </div>
                <div className="flow">
                  <div className="flow-card">
                    <div className="eyebrow">01 · Origem</div>
                    <div className="row">
                      <span className="mini-icon">
                        <MessagesSquare aria-hidden="true" />
                      </span>
                      <strong>Grupo selecionado</strong>
                    </div>
                    <p>Você escolhe de onde vêm as ofertas.</p>
                  </div>
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                  <div className="flow-card accent">
                    <div className="eyebrow">02 · Sua identidade</div>
                    <div className="row">
                      <span className="mini-icon">
                        <Fingerprint aria-hidden="true" />
                      </span>
                      <strong>Oferta personalizada</strong>
                    </div>
                    <p>Seu texto. Seu link de afiliado.</p>
                    <span className="tag">✓ Revisão antes do envio</span>
                  </div>
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                  <div className="flow-card">
                    <div className="eyebrow">03 · Destino</div>
                    <div className="row">
                      <span className="mini-icon">
                        <Send aria-hidden="true" />
                      </span>
                      <strong>Seus canais</strong>
                    </div>
                    <p>Grupos e horários definidos por você.</p>
                  </div>
                </div>
                <div className="browser-bottom">
                  <span>Da descoberta à publicação, com suas escolhas.</span>
                  <a
                    className="text-link"
                    href="#rh-copiador"
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToAnchor('#rh-copiador');
                    }}
                  >
                    Explorar a demonstração →
                  </a>
                </div>
              </div>
            </div>
          </section>

          <div className="shell stores">
            <span className="small">Integrações para afiliados</span>
            <strong>Mercado Livre</strong>
            <span aria-hidden="true">·</span>
            <strong>Shopee</strong>
          </div>

          <section id="rh-como" className="section">
            <div className="shell">
              <div className="eyebrow">Como funciona</div>
              <h2>
                Uma rotina mais simples.
                <br />
                Do começo ao envio.
              </h2>
              <div className="three">
                <article className="step">
                  <span className="number">01</span>
                  <h3>Conecte suas contas</h3>
                  <p>
                    Vincule suas integrações de afiliado e os canais que você usa para divulgar.
                  </p>
                </article>
                <article className="step">
                  <span className="number">02</span>
                  <h3>Defina sua divulgação</h3>
                  <p>Escolha grupos, horários e um modelo de mensagem com a sua identidade.</p>
                </article>
                <article className="step">
                  <span className="number">03</span>
                  <h3>Acompanhe e ajuste</h3>
                  <p>
                    Confira o histórico, revise os envios e acompanhe as métricas disponíveis no seu
                    plano.
                  </p>
                </article>
              </div>
            </div>
          </section>

          <section id="rh-copiador" className="section alt">
            <div className="shell split">
              <div>
                <div className="eyebrow">Modo copiador</div>
                <h2>
                  A oferta vem da origem.
                  <br />A divulgação tem <span style={{ color: 'var(--cyan)' }}>a sua voz.</span>
                </h2>
                <p className="lead">
                  Escolha os grupos que você pode acompanhar e os destinos da publicação. O Radar
                  prepara a mensagem com seu link de afiliado antes de liberar o envio.
                </p>
                <div className="points">
                  <div className="row">
                    <LinkIcon aria-hidden="true" />
                    <div>
                      <strong>Links da sua integração</strong>
                      <p>
                        A conversão precisa ser validada. Sem isso, a oferta aguarda revisão.
                      </p>
                    </div>
                  </div>
                  <div className="row">
                    <SlidersHorizontal aria-hidden="true" />
                    <div>
                      <strong>Você define o ritmo</strong>
                      <p>
                        Escolha horários, intervalos e destinos. Pause quando precisar ajustar.
                      </p>
                    </div>
                  </div>
                  <div className="row">
                    <CopyCheck aria-hidden="true" />
                    <div>
                      <strong>Menos repetição</strong>
                      <p>Filtros e controle de duplicadas organizam o que será publicado.</p>
                    </div>
                  </div>
                </div>
                <div className="actions">
                  <a
                    href="#rh-planos"
                    className="text-link"
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToAnchor('#rh-planos');
                    }}
                  >
                    Encontrar meu plano →
                  </a>
                </div>
              </div>

              <div className="interactive">
                <div className="panel-head">
                  <strong>Experimente o fluxo</strong>
                  <span className="caption">Dados de exemplo</span>
                </div>
                <span className="field-label">De onde copiar?</span>
                <button
                  type="button"
                  className="choice"
                  data-origin="tecnologia"
                  aria-pressed={origin === 'tecnologia'}
                  onClick={() => handleSelectOrigin('tecnologia')}
                >
                  <span className="mini-icon">
                    <Headphones aria-hidden="true" />
                  </span>
                  <span>
                    Achados de tecnologia
                    <small>Grupo de origem · exemplo</small>
                  </span>
                  <span className="choice-mark" aria-hidden="true">
                    {origin === 'tecnologia' ? '✓' : '+'}
                  </span>
                </button>
                <button
                  type="button"
                  className="choice"
                  data-origin="casa"
                  aria-pressed={origin === 'casa'}
                  onClick={() => handleSelectOrigin('casa')}
                >
                  <span className="mini-icon">
                    <Lamp aria-hidden="true" />
                  </span>
                  <span>
                    Seleção para casa
                    <small>Grupo de origem · exemplo</small>
                  </span>
                  <span className="choice-mark" aria-hidden="true">
                    {origin === 'casa' ? '✓' : '+'}
                  </span>
                </button>
                <div className="message">
                  <span className="line-label">PUBLICAR EM · MEU GRUPO DE OFERTAS</span>
                  <strong id="rh-copy-title">
                    {origin === 'tecnologia'
                      ? 'Fone sem fio — exemplo'
                      : 'Luminária de mesa — exemplo'}
                  </strong>
                  <p id="rh-copy-body">
                    {origin === 'tecnologia' ? 'Por R$ 129,90' : 'Por R$ 89,90'}
                    {'\n'}Confira a oferta no seu link de afiliado.
                  </p>
                </div>
                <button
                  type="button"
                  id="rh-simulate"
                  className="action primary"
                  onClick={handleSimulateCopy}
                >
                  <Play aria-hidden="true" />
                  Simular preparação
                </button>
                <p id="rh-copy-status" className="status" aria-live="polite">
                  {copyStatus}
                </p>
              </div>
            </div>
          </section>

          <section className="section" id="rh-mensagens">
            <div className="shell split">
              <div className="interactive">
                <div className="panel-head">
                  <strong>Prévia da mensagem</strong>
                  <span className="caption">Exemplo interativo</span>
                </div>
                <span className="field-label">Escolha o tom</span>
                <div className="segment" aria-label="Tom da mensagem">
                  <button
                    type="button"
                    data-tone="direto"
                    aria-pressed={tone === 'direto'}
                    onClick={() => setTone('direto')}
                  >
                    Direto
                  </button>
                  <button
                    type="button"
                    data-tone="proximo"
                    aria-pressed={tone === 'proximo'}
                    onClick={() => setTone('proximo')}
                  >
                    Próximo
                  </button>
                  <button
                    type="button"
                    data-tone="essencial"
                    aria-pressed={tone === 'essencial'}
                    onClick={() => setTone('essencial')}
                  >
                    Essencial
                  </button>
                </div>
                <div className="message" style={{ minHeight: 235 }}>
                  <span className="line-label">SUA MENSAGEM</span>
                  <strong>Fone sem fio — exemplo</strong>
                  <p id="rh-message" aria-live="polite">
                    {MESSAGE_TONES[tone]}
                  </p>
                </div>
                <p className="caption">
                  Valores ilustrativos. O envio real usa os dados disponíveis da oferta.
                </p>
              </div>

              <div className="editor-copy">
                <div className="eyebrow">Mensagens com identidade</div>
                <h2>
                  Um texto que combina
                  <br />
                  com o seu grupo.
                </h2>
                <p className="lead">
                  Ajuste o tom, organize os preços e deixe o link fácil de encontrar. Salve seu
                  modelo e mantenha consistência nas próximas ofertas.
                </p>
                <div className="points">
                  <div className="row">
                    <TextCursorInput aria-hidden="true" />
                    <div>
                      <strong>Seu próprio modelo</strong>
                      <p>Personalize a abertura, o conteúdo e a assinatura.</p>
                    </div>
                  </div>
                  <div className="row">
                    <BadgePercent aria-hidden="true" />
                    <div>
                      <strong>Informação sem invenção</strong>
                      <p>Preço anterior e desconto aparecem quando há dados confiáveis.</p>
                    </div>
                  </div>
                  <div className="row">
                    <Eye aria-hidden="true" />
                    <div>
                      <strong>Prévia antes de publicar</strong>
                      <p>Confira o resultado e ajuste a leitura.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="section alt" id="rh-criacao">
            <div className="shell split">
              <div>
                <div className="eyebrow">Sua marca · a partir do Plus</div>
                <h2>
                  A mesma oferta.
                  <br />
                  Outras formas de aparecer.
                </h2>
                <p className="lead">
                  Prepare cards para feed e story, personalize a marca d’água e organize uma
                  vitrine para o seu link na bio.
                </p>
                <div className="points">
                  <div className="row">
                    <LayoutTemplate aria-hidden="true" />
                    <div>
                      <strong>Feed ou story</strong>
                      <p>Uma composição pensada para cada formato.</p>
                    </div>
                  </div>
                  <div className="row">
                    <Palette aria-hidden="true" />
                    <div>
                      <strong>Uma identidade que é sua</strong>
                      <p>Logo, nome e cores da sua marca.</p>
                    </div>
                  </div>
                  <div className="row">
                    <Store aria-hidden="true" />
                    <div>
                      <strong>Sua vitrine de ofertas</strong>
                      <p>Reúna os produtos em uma página para compartilhar.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="interactive">
                <div className="panel-head">
                  <strong>Explore os formatos</strong>
                  <span className="caption">Arte de exemplo</span>
                </div>
                <div className="segment" aria-label="Formato da arte">
                  <button
                    type="button"
                    data-format="feed"
                    aria-pressed={format === 'feed'}
                    onClick={() => {
                      setFormat('feed');
                      setPhotoStatus('');
                    }}
                  >
                    Feed · 1:1
                  </button>
                  <button
                    type="button"
                    data-format="story"
                    aria-pressed={format === 'story'}
                    onClick={() => {
                      setFormat('story');
                      setPhotoStatus('');
                    }}
                  >
                    Story · 9:16
                  </button>
                </div>

                <div className="art-stage">
                  <div
                    className="art"
                    id="rh-art"
                    data-format={format}
                    style={{ '--art-accent': color } as React.CSSProperties}
                  >
                    <span id="rh-art-brand" className="art-brand">
                      {displayBrand}
                    </span>
                    <div className="product-figure">
                      <img
                        ref={productPhotoRef}
                        id="rh-product-photo"
                        src="/assets/camiseta-oversized-preta.webp"
                        width={960}
                        height={1200}
                        alt="Foto fornecida de uma camiseta preta oversized, vestida por um modelo"
                        decoding="async"
                      />
                    </div>
                    <div className="art-footer">
                      <div className="art-title">Camiseta oversized preta</div>
                      <div className="art-price">R$ 59,90</div>
                    </div>
                    <div className="art-note">Preço ilustrativo · foto fornecida</div>
                  </div>
                </div>

                <div className="download-row">
                  <button
                    type="button"
                    className="action"
                    id="rh-download"
                    disabled={isGeneratingArt}
                    onClick={handleExpandArt}
                  >
                    <Expand aria-hidden="true" />
                    Ampliar arte
                  </button>
                </div>
                <p id="rh-photo-status" className="photo-status" aria-live="polite">
                  {photoStatus}
                </p>

                <div className="message photo-message">
                  <span className="line-label">PRÉVIA DA MENSAGEM · EXEMPLO</span>
                  <strong>Camiseta oversized preta</strong>
                  <p>
                    <span className="old-price">De R$ 89,90</span>
                    <br />
                    <span className="new-price">Por R$ 59,90</span>
                  </p>
                  <span className="example-link">Confira a oferta: [seu link de afiliado]</span>
                  <p className="caption">
                    Preços e link ilustrativos, sem oferta real vinculada.
                  </p>
                </div>

                <div className="colors">
                  <span className="caption">Sua cor</span>
                  {ART_COLORS.map((swatch) => (
                    <button
                      key={swatch.hex}
                      type="button"
                      className="swatch"
                      data-color={swatch.hex}
                      aria-label={swatch.label}
                      aria-pressed={color === swatch.hex}
                      onClick={() => {
                        setColor(swatch.hex);
                        setPhotoStatus('');
                      }}
                    >
                      <span style={{ background: swatch.hex }} />
                    </button>
                  ))}
                </div>

                <label className="field-label" htmlFor="rh-brand" style={{ marginTop: 18 }}>
                  Nome na arte
                </label>
                <input
                  className="input"
                  id="rh-brand"
                  maxLength={24}
                  placeholder="Sua marca"
                  autoComplete="off"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                />
              </div>
            </div>
          </section>

          <section id="rh-recursos" className="section">
            <div className="shell">
              <div className="eyebrow">Tudo se conecta</div>
              <h2>
                Uma plataforma.
                <br />
                Várias partes da sua rotina.
              </h2>
              <p className="lead">
                Explore cada recurso e veja onde ele entra na sua operação.
              </p>
              <div className="features">
                <button
                  type="button"
                  className="feature"
                  data-feature="copiador"
                  onClick={(e) => handleOpenFeature('copiador', e)}
                >
                  <Repeat2 aria-hidden="true" />
                  <h3>Copiador de ofertas</h3>
                  <p>Origens, destinos e intervalos sob seu controle.</p>
                  <small>Conhecer recurso ↗</small>
                </button>
                <button
                  type="button"
                  className="feature"
                  data-feature="mensagens"
                  onClick={(e) => handleOpenFeature('mensagens', e)}
                >
                  <MessageSquareText aria-hidden="true" />
                  <h3>Mensagens próprias</h3>
                  <p>Modelos de texto para o estilo do seu público.</p>
                  <small>Conhecer recurso ↗</small>
                </button>
                <button
                  type="button"
                  className="feature"
                  data-feature="identidade"
                  onClick={(e) => handleOpenFeature('identidade', e)}
                >
                  <Fingerprint aria-hidden="true" />
                  <h3>Sua identidade</h3>
                  <p>Marca d’água, logo e cores do seu painel.</p>
                  <small>A partir do Plus ↗</small>
                </button>
                <button
                  type="button"
                  className="feature"
                  data-feature="cards"
                  onClick={(e) => handleOpenFeature('cards', e)}
                >
                  <PanelsTopLeft aria-hidden="true" />
                  <h3>Feed e stories</h3>
                  <p>Formatos diferentes para apresentar a mesma oferta.</p>
                  <small>A partir do Plus ↗</small>
                </button>
                <button
                  type="button"
                  className="feature"
                  data-feature="vitrine"
                  onClick={(e) => handleOpenFeature('vitrine', e)}
                >
                  <Store aria-hidden="true" />
                  <h3>Vitrine no link da bio</h3>
                  <p>Uma página que reúne suas ofertas.</p>
                  <small>A partir do Plus ↗</small>
                </button>
                <button
                  type="button"
                  className="feature"
                  data-feature="metricas"
                  onClick={(e) => handleOpenFeature('metricas', e)}
                >
                  <ChartNoAxesCombined aria-hidden="true" />
                  <h3>Métricas claras</h3>
                  <p>Entenda os cliques e os dados de vendas disponíveis.</p>
                  <small>Conforme o plano ↗</small>
                </button>
                <button
                  type="button"
                  className="feature"
                  data-feature="busca"
                  onClick={(e) => handleOpenFeature('busca', e)}
                >
                  <Search aria-hidden="true" />
                  <h3>Busca e comparação</h3>
                  <p>Compare ofertas nas lojas conectadas.</p>
                  <small>Exclusivo Ultimate ↗</small>
                </button>
                <button
                  type="button"
                  className="feature"
                  data-feature="alertas"
                  onClick={(e) => handleOpenFeature('alertas', e)}
                >
                  <BellRing aria-hidden="true" />
                  <h3>Alertas de preço</h3>
                  <p>Acompanhe produtos e saiba quando o valor cair.</p>
                  <small>Exclusivo Ultimate ↗</small>
                </button>
              </div>
            </div>
          </section>

          <section id="rh-planos" className="section plans">
            <div className="shell center">
              <div className="eyebrow">Encontre seu ritmo</div>
              <h2>Um plano para cada etapa.</h2>
              <p className="lead">
                Comece com o que você precisa. Amplie as possibilidades conforme sua operação
                cresce.
              </p>
              <div className="billing">
                <div className="segment" aria-label="Período da assinatura">
                  <button
                    type="button"
                    data-billing="mensal"
                    aria-pressed={billing === 'mensal'}
                    onClick={() => setBilling('mensal')}
                  >
                    Mensal
                  </button>
                  <button
                    type="button"
                    data-billing="anual"
                    aria-pressed={billing === 'anual'}
                    onClick={() => setBilling('anual')}
                  >
                    Anual
                  </button>
                </div>
                <span className="save">Economize 20% no anual</span>
              </div>

              <div className="three" aria-live="polite">
                {PLAN_ORDER.map((planId, idx) => {
                  const plan = PLANS_CONFIG[planId];
                  const isAnnual = billing === 'anual';
                  const displayedPrice = isAnnual
                    ? formatBrlNumber(plan.annualMonthlyEquivalent)
                    : formatBrlNumber(plan.monthlyPrice);
                  const totalText = isAnnual
                    ? `Total anual: R$ ${formatBrlNumber(plan.annualTotalPrice)}. Compromisso de 12 meses.`
                    : 'Assinatura mensal.';

                  return (
                    <article
                      key={plan.id}
                      className={`plan${plan.popular ? ' popular' : ''}`}
                    >
                      <div className="plan-head">
                        <h3>{plan.name}</h3>
                        {plan.badge && <span className="popular-label">{plan.badge}</span>}
                      </div>
                      <p className="plan-summary">{plan.landingSummary}</p>
                      <div className="price-row">
                        <span className="currency" data-prefix>
                          {isAnnual ? '12× R$' : 'R$'}
                        </span>
                        <span className="price" data-price={idx}>
                          {displayedPrice}
                        </span>
                        <span className="period" data-period>
                          {isAnnual ? '/parcela' : '/mês'}
                        </span>
                      </div>
                      <p className="total" data-total={idx}>
                        {totalText}
                      </p>
                      <div className="benefits">
                        {plan.landingBenefits.map((benefit) => (
                          <div key={benefit} className="benefit">
                            {benefit}
                          </div>
                        ))}
                      </div>
                      <Link
                        href={`/cadastro?plano=${plan.id}&periodo=${billing}`}
                        className={`action${plan.popular ? ' primary' : ''}`}
                        data-plan={plan.name}
                      >
                        Escolher {plan.name} →
                      </Link>
                    </article>
                  );
                })}
              </div>

              <p className="small" style={{ marginTop: 22 }}>
                Dados de vendas dependem da disponibilidade e da atualização de cada integração.
              </p>
            </div>
          </section>

          <section id="rh-faq" className="section">
            <div className="shell faq-layout">
              <div>
                <div className="eyebrow">Antes de começar</div>
                <h2>Sem pontas soltas.</h2>
                <p className="lead">
                  Entenda o que o Radar faz e o que depende das suas contas conectadas.
                </p>
                <a
                  href="https://wa.me/5519993812187"
                  className="text-link"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginTop: 24 }}
                >
                  Conversar com o suporte ↗
                </a>
              </div>
              <div>
                {FAQ_ITEMS.map((item) => {
                  const isOpen = openFaqId === item.id;
                  return (
                    <details
                      key={item.id}
                      id={item.id === 'rh-risco' ? 'rh-risco' : undefined}
                      className="faq-item"
                      open={isOpen}
                      onToggle={(e) => {
                        const target = e.currentTarget;
                        if (target.open) {
                          setOpenFaqId(item.id);
                        } else if (openFaqId === item.id) {
                          setOpenFaqId(null);
                        }
                      }}
                    >
                      <summary
                        onClick={(e) => {
                          e.preventDefault();
                          setOpenFaqId((prev) => (prev === item.id ? null : item.id));
                        }}
                      >
                        {item.question}
                      </summary>
                      <p>{item.answer}</p>
                    </details>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="shell final center">
            <div className="eyebrow">Seu próximo passo</div>
            <h2>
              Dê mais espaço à sua marca.
              <br />E mais ordem à sua rotina.
            </h2>
            <p className="lead">Encontre o plano que faz sentido para a sua divulgação.</p>
            <div className="actions">
              <Link href="/cadastro" className="action primary">
                Começar agora →
              </Link>
              <a
                href="#rh-planos"
                className="action"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToAnchor('#rh-planos');
                }}
              >
                Comparar planos
              </a>
            </div>
          </section>
        </main>

        <footer className="footer">
          <div className="shell">
            <div className="footer-row">
              <a
                className="logo"
                href="#rh-inicio"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToAnchor('#rh-inicio');
                }}
              >
                <span className="radar" aria-hidden="true" />
                <span className="wordmark">
                  RADAR
                  <small>DE OFERTAS</small>
                </span>
              </a>
              <nav className="footer-links" aria-label="Informações e atendimento">
                <Link href="/termos">Termos</Link>
                <Link href="/privacidade">Privacidade</Link>
                <Link href="/ajuda">Ajuda</Link>
                <a
                  href="https://wa.me/5519993812187"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp ↗
                </a>
              </nav>
            </div>
            <p className="legal-note">
              Radar de Ofertas. Plataforma independente, sem vínculo de aprovação ou parceria
              oficial com as lojas e os canais mencionados.{' '}
              <a
                href="#rh-risco"
                style={{ textDecoration: 'underline' }}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToAnchor('#rh-risco');
                }}
              >
                Entenda a conexão com o WhatsApp.
              </a>
            </p>
          </div>
        </footer>

        <dialog
          ref={dialogRef}
          className="dialog"
          id="rh-dialog"
          aria-labelledby="rh-dialog-title"
          onClose={handleDialogClose}
          onClick={(e) => {
            const dialog = dialogRef.current;
            if (dialog && e.target === dialog) {
              const r = dialog.getBoundingClientRect();
              if (
                e.clientX < r.left ||
                e.clientX > r.right ||
                e.clientY < r.top ||
                e.clientY > r.bottom
              ) {
                dialog.close();
              }
            }
          }}
        >
          <button
            type="button"
            className="close"
            aria-label="Fechar modal"
            onClick={closeDialog}
          >
            ×
          </button>
          <div className="eyebrow" id="rh-dialog-kicker">
            {dialogData.kicker}
          </div>
          <h2 id="rh-dialog-title">{dialogData.title}</h2>
          <p id="rh-dialog-text">{dialogData.text}</p>
          <img
            id="rh-dialog-art"
            src={dialogData.artUrl || undefined}
            alt="Prévia ampliada da arte da camiseta com a personalização escolhida"
            hidden={!dialogData.artUrl}
          />
          <button
            type="button"
            className="action primary"
            id="rh-dialog-action"
            onClick={handleDialogAction}
          >
            {dialogData.label}
          </button>
        </dialog>
      </div>
    </div>
  );
}
