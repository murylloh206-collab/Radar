import type { Metadata, Viewport } from 'next';
import './grupo.css';
import GroupNumber from './GroupNumber';
import GroupTracker from './GroupTracker';
import { groupShowcase } from '@/lib/server/group-showcase';

export const metadata: Metadata = {
  title: 'Radar de Ofertas | Grupo no WhatsApp',
  description:
    'Receba promoções, cupons e achados direto no grupo do Radar de Ofertas no WhatsApp.',
};

/** Refaz a página a cada 10 min (ofertas novas; o título de Black Friday sai sozinho quando a data passa). */
export const revalidate = 600;

/** 1º/12 à meia-noite de Brasília. */
const BLACK_FRIDAY_END = Date.parse('2026-12-01T03:00:00Z');

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#020b1f',
};

export default async function GrupoRadarDeOfertasPage() {
  const offers = await groupShowcase();
  const blackFriday = Date.now() < BLACK_FRIDAY_END;
  return (
    <div id="inicio" className="radar-grupo-root">
      <GroupTracker />
      <svg className="icons" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <symbol id="i-tag" viewBox="0 0 24 24">
          <path d="M3 4h8l10 10-7 7L3 10z" />
          <circle cx="7.5" cy="8" r="1" />
        </symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24">
          <path d="M4 12h15m-6-6 6 6-6 6" />
        </symbol>
        <symbol id="i-check" viewBox="0 0 24 24">
          <path d="m5 12 4 4 10-10" />
        </symbol>
        <symbol id="i-search" viewBox="0 0 24 24">
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="m15 15 5 5" />
        </symbol>
        <symbol id="i-message" viewBox="0 0 24 24">
          <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.5-5A8.5 8.5 0 1 1 21 11.5Z" />
          <path d="M8 10h8m-8 4h5" />
        </symbol>
        <symbol id="i-whatsapp" viewBox="0 0 24 24">
          <path d="M12 2a9.9 9.9 0 0 0-8.6 14.8L2 22l5.4-1.4A9.9 9.9 0 1 0 12 2Zm0 18.1a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3a8.2 8.2 0 1 1 7 3.9Zm4.5-6.2c-.2-.1-1.5-.8-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.1-.3.2-.5.1a6.7 6.7 0 0 1-2-1.2 7.1 7.1 0 0 1-1.3-1.6c-.1-.2 0-.4.1-.5l.4-.5.2-.4c.1-.2 0-.3 0-.4l-.8-1.9c-.1-.4-.3-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.1.9 2.3c.1.2 1.7 2.6 4.2 3.7.6.3 1 .4 1.4.5.6.2 1.1.2 1.6.1.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.2Z" />
        </symbol>
      </svg>

      <header className="site-header">
        <div className="shell header-inner">
          <a className="brand" href="#inicio">
            <span className="brand-mark" aria-hidden="true">
              <img src="/assets/logo-radar-de-ofertas.png" alt="" />
            </span>
            <span className="brand-name">
              Radar de <strong>Ofertas</strong>
            </span>
          </a>
        </div>
      </header>

      <main className="shell">
        <section className="hero" aria-labelledby="titulo">
          <div>
            <p className="eyebrow">Grupo de ofertas<GroupNumber /></p>
            <h1 id="titulo">
              Ofertas e cupons {blackFriday ? 'de Black Friday ' : ''}no seu <span>WhatsApp.</span>
            </h1>
            <p className="intro">
              <strong>Só administradores postam:</strong> zero conversa paralela. Você recebe o link direto da oferta no Mercado Livre, Amazon, Shopee e Netshoes.
            </p>
            <a className="join" href="/grupo/entrar">
              <svg fill="currentColor" aria-hidden="true">
                <use href="#i-whatsapp" />
              </svg>
              Acessar ofertas no WhatsApp
              <svg
                className="arrow"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <use href="#i-arrow" />
              </svg>
            </a>
            <ul className="join-notes">
              {['Participação gratuita', 'Link direto da loja', 'Saia quando quiser'].map(note => (
                <li key={note}>
                  <svg
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <use href="#i-check" />
                  </svg>
                  {note}
                </li>
              ))}
            </ul>
          </div>

          {offers.length > 0 ? (
            <div className="showcase">
              <h2>Enviadas no grupo nas últimas 24 horas</h2>
              <ul>
                {offers.map(offer => (
                  <li key={offer.imageUrl}>
                    <span className="showcase-photo"><img src={offer.imageUrl} alt="" referrerPolicy="no-referrer" /></span>
                    <span className="showcase-store">{offer.store}</span>
                    <span className="showcase-title">{offer.title}</span>
                    <strong>{offer.price}</strong>
                  </li>
                ))}
              </ul>
              <p>Preço no momento do envio. Pode mudar ou esgotar na loja.</p>
              <a className="join" href="/grupo/entrar">Quero receber as próximas</a>
            </div>
          ) : (
          <div className="art" aria-hidden="true">
            <svg viewBox="0 0 560 450" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ticket" x2="1" y2="1" gradientUnits="objectBoundingBox">
                  <stop stopColor="#a9f1ff" />
                  <stop offset=".56" stopColor="#22d3f5" />
                  <stop offset="1" stopColor="#1496f0" />
                </linearGradient>
                <linearGradient id="tag" x2="1" y2="1" gradientUnits="objectBoundingBox">
                  <stop stopColor="#f8f8f8" />
                  <stop offset="1" stopColor="#7fe3fa" />
                </linearGradient>
                <pattern
                  id="lines"
                  width="8"
                  height="8"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(34)"
                >
                  <path d="M0 0v8" stroke="#3c3a37" strokeOpacity=".19" strokeWidth="2" />
                </pattern>
                <filter id="shadow" x="-.4" y="-.5" width="1.8" height="2">
                  <feDropShadow
                    dx="0"
                    dy="15"
                    stdDeviation="13"
                    floodColor="#0c0c0b"
                    floodOpacity=".6"
                  />
                </filter>
              </defs>
              <g fill="none" stroke="#4fd8f7" strokeOpacity=".29">
                <circle cx="281" cy="222" r="158" strokeDasharray="3 8" />
                <circle cx="281" cy="222" r="181" />
              </g>
              <g fill="#a9f1ff">
                <path
                  className="sparkle"
                  d="M441 74q2 16 18 18-16 2-18 18-2-16-18-18 16-2 18-18Z"
                />
                <path
                  className="sparkle sparkle-delayed"
                  d="M101 303q2 14 16 16-14 2-16 16-2-14-16-16 14-2 16-16Z"
                />
                <circle className="sparkle-dot" cx="486" cy="239" r="3" />
                <circle className="sparkle-dot" cx="156" cy="62" r="3" />
                <circle className="sparkle-dot" cx="246" cy="374" r="3" />
              </g>
              <g transform="translate(106 103) rotate(9 112 83)" filter="url(#shadow)">
                <rect
                  width="288"
                  height="174"
                  rx="18"
                  fill="#072048"
                  stroke="#1ccaf2"
                  strokeWidth="1.5"
                />
                <path
                  d="M227 14v146"
                  stroke="#1ccaf2"
                  strokeOpacity=".55"
                  strokeDasharray="4 6"
                />
              </g>
              <g transform="translate(106 138) rotate(-12 170 91)" filter="url(#shadow)">
                <path
                  d="M16 0h308a16 16 0 0 1 16 16v55a19 19 0 0 0 0 38v55a16 16 0 0 1-16 16H16a16 16 0 0 1-16-16v-55a19 19 0 0 0 0-38V16A16 16 0 0 1 16 0Z"
                  fill="url(#ticket)"
                />
                <path
                  d="M264 0h60a16 16 0 0 1 16 16v55a19 19 0 0 0 0 38v55a16 16 0 0 1-16 16h-60Z"
                  fill="url(#lines)"
                />
                <path
                  d="M264 13v154"
                  stroke="#3b3936"
                  strokeWidth="1.5"
                  strokeDasharray="4 6"
                  opacity=".62"
                />
                <text
                  x="32"
                  y="42"
                  fill="#34322f"
                  fontFamily="monospace"
                  fontSize="14"
                  fontWeight="700"
                  letterSpacing="2.7"
                >RADAR DE OFERTAS</text>
                <text
                  x="29"
                  y="102"
                  fill="#1d1c1b"
                  fontFamily="system-ui, sans-serif"
                  fontWeight="950"
                  fontSize="55"
                  letterSpacing="-4"
                >ACHADO!</text>
                <path d="M33 121h198" stroke="#3b3936" strokeOpacity=".4" />
                <text
                  x="33"
                  y="145"
                  fill="#34322f"
                  fontFamily="monospace"
                  fontSize="13"
                  fontWeight="700"
                  letterSpacing="2"
                >CUPONS E PROMOÇÕES</text>
                <g transform="translate(282 31)" fill="#2c2b28">
                  <path d="M0 0h3v118H0zm6 0h2v118H6zm5 0h5v118h-5zm8 0h2v118h-2zm5 0h4v118h-4zm8 0h2v118h-2z" />
                </g>
              </g>
              <g transform="translate(365 280) rotate(12 52 43)" filter="url(#shadow)">
                <path
                  d="M12 0h61l38 42-38 42H12A12 12 0 0 1 0 72V12A12 12 0 0 1 12 0Z"
                  fill="url(#tag)"
                />
                <circle cx="92" cy="42" r="5" fill="#34322f" />
                <path
                  d="M32 56l30-28"
                  fill="none"
                  stroke="#34322f"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
                <circle
                  cx="36"
                  cy="31"
                  r="6.5"
                  fill="none"
                  stroke="#34322f"
                  strokeWidth="4"
                />
                <circle
                  cx="58"
                  cy="53"
                  r="6.5"
                  fill="none"
                  stroke="#34322f"
                  strokeWidth="4"
                />
              </g>
              <g
                fill="#b5efff"
                opacity=".84"
                fontFamily="monospace"
                fontSize="10"
                fontWeight="700"
                letterSpacing="2"
              >
                <text x="23" y="34">RADAR DE OFERTAS</text>
                <text x="383" y="418">DIRETO NO CELULAR</text>
              </g>
              <path
                d="M25 397v21h22m467-384h22v21"
                fill="none"
                stroke="#1ccaf2"
                strokeOpacity=".6"
              />
            </svg>
          </div>
          )}
        </section>

        <section className="steps" id="como-funciona" aria-labelledby="como-titulo">
          <h2 id="como-titulo">Como funciona</h2>
          <ol className="cards">
            <li className="card">
              <span className="card-icon">
                <svg
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <use href="#i-message" />
                </svg>
              </span>
              <h3>1. Entre no grupo</h3>
              <p>Abra o convite e confirme sua entrada no WhatsApp.</p>
            </li>
            <li className="card">
              <span className="card-icon">
                <svg
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <use href="#i-search" />
                </svg>
              </span>
              <h3>2. Veja os achados</h3>
              <p>Acompanhe as promoções e os cupons compartilhados no grupo.</p>
            </li>
            <li className="card">
              <span className="card-icon">
                <svg
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <use href="#i-tag" />
                </svg>
              </span>
              <h3>3. Aproveite quando quiser</h3>
              <p>Abra a oferta que te interessa e confira as condições na loja.</p>
            </li>
          </ol>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell footer-inner">
          <span>Radar de Ofertas</span>
        </div>
      </footer>
    </div>
  );
}

