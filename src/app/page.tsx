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

export default function HomePage() {
  const [slide, setSlide] = useState<number>(0);

  // Navegação por teclado para o carrossel (setas esquerda/direita)
  useEffect(() => {
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
            <div className="rdv3-slide-brands">
              <span className="rdv3-stores-row" aria-hidden="true">
                <span className="rdv3-store-mark rdv3-shopee" style={{ width: 30, height: 30, fontSize: 13 }}>S</span>
                <span className="rdv3-store-mark rdv3-netshoes" style={{ width: 30, height: 30, fontSize: 11 }}>N</span>
                <span className="rdv3-store-mark rdv3-amazon" style={{ width: 30, height: 30, fontSize: 13 }}>a</span>
              </span>
              <span>Shopee · Netshoes · Amazon</span>
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
              <span className="rdv3-quick-icon">
                {/* Ícone oficial WhatsApp em vetor SVG */}
                <svg className="w-4 h-4 fill-current text-[#4ade80]" viewBox="0 0 24 24">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.007c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86.173.086.275.072.376-.044.101-.116.433-.506.549-.68.116-.173.231-.145.39-.086s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.099.824z" />
                </svg>
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
      <Link className="rdv3-stores-card" href="/conexoes?aba=lojas">
        <div>
          <h3>Suas lojas em um só lugar</h3>
          <p>Configure suas integrações de afiliados e gere seus links.</p>
          <p>Shopee · Netshoes · Amazon</p>
        </div>
        <div className="rdv3-stores-row" aria-label="Shopee, Netshoes e Amazon">
          <span className="rdv3-store-mark rdv3-shopee">S</span>
          <span className="rdv3-store-mark rdv3-netshoes">N</span>
          <span className="rdv3-store-mark rdv3-amazon">a</span>
        </div>
        <span className="rdv3-arrow" aria-hidden="true">
          ↗
        </span>
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
