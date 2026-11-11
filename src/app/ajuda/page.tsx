import React from 'react';
import Link from 'next/link';

export default function AjudaPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#080D18', color: '#F4F6FA', padding: '40px 20px' }}>
      <section className="rp-page" style={{ maxWidth: 960, margin: '0 auto' }}>
        <div className="rp-head" style={{ flexWrap: 'wrap' }}>
          <div>
            <span className="rp-step" style={{ color: '#35D4ED' }}>Suporte & Documentação</span>
            <h1 style={{ color: '#F4F6FA' }}>Central de Ajuda — Radar de Ofertas</h1>
            <p className="rp-sub" style={{ color: '#B6C2D2' }}>
              Guia rápido dos recursos por plano (Impulse, Plus e Ultimate), canais de divulgação, personalização e atendimento.
            </p>
          </div>
          <div className="rp-actions">
            <Link href="/" className="rp-btn rp-quiet">
              Voltar ao início
            </Link>
            <Link href="/#rh-planos" className="rp-btn rp-primary">
              Comparar Planos
            </Link>
            <Link href="/termos" className="rp-btn rp-quiet">
              Termos de Uso
            </Link>
          </div>
        </div>

        <div
          className="rp-panel rp-section"
          style={{
            lineHeight: 1.65,
            fontSize: 13,
            color: '#CBD5E1',
            background: '#111B2C',
            borderColor: '#2B3A50',
          }}
        >
          <h2 style={{ color: '#F4F6FA', fontSize: 17, marginTop: 0 }}>
            O que está incluído em cada plano?
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            <div style={{ background: '#080D18', border: '1px solid #2B3A50', borderRadius: 12, padding: 14 }}>
              <strong style={{ color: '#F4F6FA', fontSize: 15 }}>
                1. Plano Impulse
              </strong>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#B6C2D2' }}>
                Para organizar seus primeiros fluxos de divulgação: copiador e modelos de mensagem, imagens originais do anúncio, agendamento, histórico de envios e métricas básicas do WhatsApp.
              </p>
            </div>

            <div style={{ background: '#080D18', border: '1px solid #35D4ED', borderRadius: 12, padding: 14 }}>
              <strong style={{ color: '#35D4ED', fontSize: 15 }}>
                2. Plano Plus (Mais popular)
              </strong>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#B6C2D2' }}>
                Inclui tudo do Impulse, mais: marca d&apos;água com sua logo e seu @, cores e identidade do painel, cards para feed (1:1), story (9:16), vitrine pública no link da bio e métricas básicas de cliques.
              </p>
            </div>

            <div style={{ background: '#080D18', border: '1px solid #70D8AE', borderRadius: 12, padding: 14 }}>
              <strong style={{ color: '#70D8AE', fontSize: 15 }}>
                3. Plano Ultimate
              </strong>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#B6C2D2' }}>
                Inclui tudo do Plus, mais: buscador e comparador de ofertas, alertas de queda de preço, métricas por loja e visão consolidada, além de vendas informadas pelas integrações quando disponíveis.
              </p>
            </div>
          </div>

          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: '1px solid #2B3A50',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: 12,
            }}
          >
            <span>Precisa falar com o atendimento?</span>
            <a
              href="https://wa.me/5519993812187"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#35D4ED', fontWeight: 600 }}
            >
              Conversar com o suporte no WhatsApp ↗
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
