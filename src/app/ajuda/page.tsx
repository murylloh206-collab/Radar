import React from 'react';
import Link from 'next/link';

export default function AjudaPage() {
  return (
    <section className="rp-page">
      <div className="rp-head">
        <div>
          <span className="rp-step">Suporte & Documentação</span>
          <h1>Central de Ajuda — Radar de Ofertas</h1>
          <p className="rp-sub">
            Guia rápido dos recursos por plano (Impulse, Plus e Ultimate), canais de disparo, marca d&apos;água e métricas.
          </p>
        </div>
        <div className="rp-actions">
          <Link href="/planos" className="rp-btn rp-primary">
            Comparar Planos
          </Link>
          <Link href="/termos" className="rp-btn rp-quiet">
            Termos de Uso
          </Link>
        </div>
      </div>

      <div className="rp-panel rp-section" style={{ lineHeight: 1.65, fontSize: 13, color: '#CBD5E1' }}>
        <h2 style={{ color: '#F8FBFF', fontSize: 17, marginTop: 0 }}>
          O que está incluído em cada plano?
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
          <div style={{ background: '#050E1C', border: '1px solid #18283D', borderRadius: 12, padding: 14 }}>
            <strong style={{ color: '#F8FBFF', fontSize: 15 }}>
              1. Plano Impulse (Entrada — até 30 ofertas/dia)
            </strong>
            <p style={{ margin: '6px 0 0', fontSize: 12 }}>
              Ideal para iniciar sua operação: Copiador de grupos WhatsApp, conversão de links de afiliado (Mercado Livre, Shopee, Amazon, Magalu e Netshoes), marca d&apos;água padrão oficial do Radar de Ofertas, Envio Seguro no WhatsApp e métricas básicas do WhatsApp.
            </p>
          </div>

          <div style={{ background: '#050E1C', border: '1px solid #1C314B', borderRadius: 12, padding: 14 }}>
            <strong style={{ color: '#1CCAF2', fontSize: 15 }}>
              2. Plano Plus (Mais Popular — ofertas ilimitadas + 7 dias grátis)
            </strong>
            <p style={{ margin: '6px 0 0', fontSize: 12 }}>
              Inclui tudo do Impulse sem limite diário de ofertas, mais: <strong>Marca d&apos;água personalizável</strong> (logo própria, @ do Instagram, posição livre, opacidade e tamanho), <strong>Gerador de Legendas com IA</strong> (Curta, Urgência e Storytelling), <strong>Cards de Imagem Automáticos</strong> (Feed 1:1 e Story 9:16), <strong>Selo de Promoção Real</strong> (baseado em 30 dias de histórico), <strong>Vitrine Pública <code>/@slug</code></strong>, <strong>Postagem no Telegram</strong> via Bot API oficial e métricas de cliques da plataforma por origem (<code>?src=whatsapp</code>, <code>telegram</code>, <code>vitrine</code>, <code>card</code>).
            </p>
          </div>

          <div style={{ background: '#050E1C', border: '1px solid #20C997', borderRadius: 12, padding: 14 }}>
            <strong style={{ color: '#20C997', fontSize: 15 }}>
              3. Plano Ultimate (Operação Completa, Comparador, Inteligência e Equipe)
            </strong>
            <p style={{ margin: '6px 0 0', fontSize: 12 }}>
              Inclui tudo do Plus, mais: <strong>Buscador Comparador Multiloja</strong> tolerante a erros de digitação (<code>pg_trgm</code> + <code>unaccent</code>), <strong>Relatório de Vendas Convertidas por Loja</strong> (API Oficial Shopee + Importação CSV com média diária, semanal e mensal), <strong>Alerta de Queda de Preço</strong> (WhatsApp/Telegram), <strong>&quot;O que Postar Hoje&quot;</strong>, <strong>Radar de Oportunidades com Fila de Revisão</strong> (nunca posta sozinho), <strong>Relatório Semanal Automático</strong> (WhatsApp + E-mail) e <strong>Gestão de Equipe (Dono e Colaborador) + Múltiplos Canais</strong>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

