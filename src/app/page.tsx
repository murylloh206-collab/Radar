'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  PenTool,
  Send,
  Tag,
  Check,
} from 'lucide-react';
import { BrandLogo, OverlappingStoreLogos } from '@/components/BrandLogo';

export default function HomePage() {
  const [slide, setSlide] = useState<number>(0);

  // Navegação por teclado para o carrossel (setas esquerda/direita) e query params
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('slide');
      if (s === '1') setSlide(1);
      if (s === '0') setSlide(0);
      if (params.get('modal') === 'lojas') {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('open-stores-dialog'));
        }, 150);
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setSlide((prev) => (prev + 1) % 2);
      } else if (e.key === 'ArrowLeft') {
        setSlide((prev) => (prev - 1 + 2) % 2);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openStoresDialog = () => {
    window.dispatchEvent(new CustomEvent('open-stores-dialog'));
  };

  return (
    <div className="rp-page">
      {/* Carrossel aprovado com dois slides */}
      <section className="rdv3-carousel" aria-roledescription="carrossel" aria-label="Destaques do Radar">
        {/* Slide 1: Copiador (sem ícones de lojas) */}
        <article
          className="rdv3-slide"
          data-slide="0"
          aria-label="1 de 2: Copiador"
          hidden={slide !== 0}
        >
          <img
            className="rdv3-slide-photo"
            src="/assets/radar-hero-editorial.jpg"
            alt="Ambiente acolhedor e conectado"
          />
          <div className="rdv3-slide-copy">
            <span className="rdv3-kicker">Seu radar em ação</span>
            <h1>Boas ofertas. Prontas para compartilhar.</h1>
            <p>Escolha os grupos e publique ofertas com seus links de afiliado.</p>
            <Link className="rdv3-carousel-link" href="/copiador">
              Abrir Copiador <span aria-hidden="true">→</span>
            </Link>
          </div>
        </article>

        {/* Slide 2: Lojas (Shopee, Netshoes, Amazon agrupadas da esquerda para a direita) */}
        <article
          className="rdv3-slide"
          data-slide="1"
          aria-label="2 de 2: Lojas parceiras"
          hidden={slide !== 1}
        >
          <img
            className="rdv3-slide-photo"
            src="/assets/radar-lojas-editorial.jpg"
            alt="Produtos e compras online"
          />
          <div className="rdv3-slide-copy">
            <span className="rdv3-kicker">Explore suas lojas</span>
            <h1>A próxima descoberta começa por aqui.</h1>
            <p>Acesse as lojas, encontre produtos e traga novas oportunidades para seus grupos.</p>
            <div className="rdv3-slide-brands" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
              <OverlappingStoreLogos containerSizeDesktop={46} overlap={5} />
              <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>Shopee · Netshoes · Amazon</span>
            </div>
            <button
              className="rdv3-carousel-link"
              type="button"
              onClick={openStoresDialog}
            >
              Acessar lojas <span aria-hidden="true">↗</span>
            </button>
          </div>
        </article>

        {/* Controles do Carrossel */}
        <div className="rdv3-carousel-controls">
          <div className="rdv3-slide-dots" aria-label="Escolher destaque">
            <button
              type="button"
              onClick={() => setSlide(0)}
              aria-label="Ver destaque do Copiador"
              aria-pressed={slide === 0}
            />
            <button
              type="button"
              onClick={() => setSlide(1)}
              aria-label="Ver destaque das lojas"
              aria-pressed={slide === 1}
            />
          </div>
          <span className="rdv3-slide-number" aria-live="polite">
            {slide + 1} / 2
          </span>
          <button
            className="rdv3-slide-arrow"
            type="button"
            onClick={() => setSlide((prev) => (prev - 1 + 2) % 2)}
            aria-label="Destaque anterior"
          >
            ‹
          </button>
          <button
            className="rdv3-slide-arrow"
            type="button"
            onClick={() => setSlide((prev) => (prev + 1) % 2)}
            aria-label="Próximo destaque"
          >
            ›
          </button>
        </div>
      </section>

      {/* Acesso rápido às ferramentas principais */}
      <section aria-labelledby="quick-title">
        <div className="rdv3-section-head">
          <div>
            <small>Ferramentas</small>
            <h2 id="quick-title">Acesso rápido</h2>
          </div>
          <span>Escolha por onde começar</span>
        </div>

        <div className="rdv3-quick-grid">
          {/* Copiador */}
          <Link className="rdv3-quick-card" id="card-copiador" href="/copiador">
            <div className="rdv3-quick-top">
              <span className="rdv3-quick-icon" style={{ background: 'transparent', padding: 0 }}>
                <BrandLogo brand="whatsapp" variant="whatsapp-destaque" size={32} containerSize={40} />
              </span>
              <span className="rdv3-arrow">↗</span>
            </div>
            <h3>Copiador</h3>
            <p>Escolha de qual grupo copiar e para onde enviar.</p>
          </Link>

          {/* Criar conteúdo */}
          <Link className="rdv3-quick-card" id="card-criar-conteudo" href="/criar-conteudo">
            <div className="rdv3-quick-top">
              <span className="rdv3-quick-icon">
                <PenTool className="w-4 h-4 text-[#39bee6]" />
              </span>
              <span className="rdv3-arrow">↗</span>
            </div>
            <h3>Criar conteúdo</h3>
            <p>Monte uma oferta, mensagem livre ou story.</p>
          </Link>

          {/* Envios */}
          <Link className="rdv3-quick-card" id="card-envios" href="/envios">
            <div className="rdv3-quick-top">
              <span className="rdv3-quick-icon">
                <Send className="w-4 h-4 text-[#aab2b7]" />
              </span>
              <span className="rdv3-arrow">↗</span>
            </div>
            <h3>Envios</h3>
            <p>Revise ofertas, agende e acompanhe publicações.</p>
          </Link>

          {/* Ofertas */}
          <Link className="rdv3-quick-card" id="card-ofertas" href="/ofertas">
            <div className="rdv3-quick-top">
              <span className="rdv3-quick-icon">
                <Tag className="w-4 h-4 text-[#aab2b7]" />
              </span>
              <span className="rdv3-arrow">↗</span>
            </div>
            <h3>Ofertas</h3>
            <p>Explore o catálogo e configure a busca automática.</p>
          </Link>
        </div>
      </section>

      {/* Cartão de Lojas */}
      <Link className="rdv3-stores-card" href="/conexoes?aba=lojas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ flex: '1 1 260px' }}>
          <h3>Suas lojas em um só lugar</h3>
          <p>Configure suas integrações de afiliados e gere seus links.</p>
          <p style={{ marginTop: 4, color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>Shopee · Netshoes · Amazon</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <OverlappingStoreLogos containerSizeDesktop={46} overlap={5} />
          <span className="rdv3-arrow" aria-hidden="true">
            ↗
          </span>
        </div>
      </Link>

      {/* Seção Recursos para Explorar */}
      <section aria-labelledby="explore-title">
        <div className="rdv3-section-head">
          <div>
            <small>Recursos</small>
            <h2 id="explore-title">Para explorar</h2>
          </div>
        </div>

        <div className="rdv3-explore">
          {/* Card Histórico */}
          <Link className="rdv3-photo-card" id="historico-envios" href="/envios?aba=historico">
            <img
              src="/assets/radar-explore-editorial.jpg"
              alt="Mesa de trabalho com caderno e fone"
            />
            <div className="rdv3-photo-overlay">
              <strong>Histórico de envios</strong>
              <p>Acompanhe ofertas recebidas, aprovadas e publicadas.</p>
            </div>
          </Link>

          {/* Card Explore Lojas */}
          <div className="rdv3-photo-card" style={{ cursor: 'pointer' }} onClick={openStoresDialog}>
            <img
              src="/assets/radar-lojas-editorial.jpg"
              alt="Notebook navegando em lojas online"
            />
            <div className="rdv3-photo-overlay">
              <strong>Explore as lojas</strong>
              <p>Shopee, Netshoes e Amazon em um só lugar.</p>
              <span style={{ color: '#39bee6', fontSize: 11, fontWeight: 700, marginTop: 8 }}>
                Acessar lojas ↗
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
