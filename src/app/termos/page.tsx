import React from 'react';
import Link from 'next/link';
import { PLANS_ORDER, PLANS_CONFIG } from '@/lib/plans-config';

export default function TermosPage() {
  return (
    <section className="rp-page">
      <div className="rp-head">
        <div>
          <span className="rp-step">Jurídico & Transparência SaaS</span>
          <h1>Termos de Uso e Assinatura — Radar de Ofertas</h1>
          <p className="rp-sub">
            Regras de utilização da plataforma, limites operacionais dos planos Impulse, Plus e Ultimate, período de teste e política de cancelamento.
          </p>
        </div>
        <div className="rp-actions">
          <Link href="/planos" className="rp-btn rp-primary">
            Ver Planos e Preços
          </Link>
        </div>
      </div>

      <div className="rp-panel rp-section" style={{ lineHeight: 1.65, fontSize: 13, color: '#CBD5E1' }}>
        <h2 style={{ color: '#F8FBFF', fontSize: 17, marginTop: 0 }}>
          1. Planos de Assinatura (Impulse, Plus e Ultimate)
        </h2>
        <p>
          O Radar de Ofertas opera no modelo de Software como Serviço (SaaS) com três níveis de assinatura validados diretamente no servidor:
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 14,
            margin: '16px 0',
          }}
        >
          {PLANS_ORDER.map((pid) => {
            const p = PLANS_CONFIG[pid];
            return (
              <div
                key={pid}
                style={{
                  background: '#050E1C',
                  border: '1px solid #1C314B',
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <strong style={{ color: '#1CCAF2', fontSize: 15 }}>Plano {p.name}</strong>
                <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>{p.tagline}</div>
                <div style={{ fontSize: 12, color: '#F8FBFF', marginTop: 8 }}>
                  • Mensal: R$ {p.monthlyPrice.toFixed(2).replace('.', ',')}/mês
                  <br />
                  • Anual (12x): R$ {p.annualMonthlyEquivalent.toFixed(2).replace('.', ',')}/mês (Total R$ {p.annualTotalPrice.toFixed(2).replace('.', ',')})
                </div>
                <div style={{ fontSize: 11, color: '#20C997', marginTop: 8 }}>
                  Limite diário:{' '}
                  {p.dailyOfferLimit === null
                    ? 'Ofertas ilimitadas/dia'
                    : `Até ${p.dailyOfferLimit} ofertas/dia`}
                </div>
              </div>
            );
          })}
        </div>

        <h2 style={{ color: '#F8FBFF', fontSize: 17 }}>
          2. Período de Teste Grátis (7 Dias no Plano Plus)
        </h2>
        <p>
          Novas contas elegíveis podem ativar 7 dias de teste grátis no plano <strong>Plus</strong> para validar marca d&apos;água personalizada, vitrine pública <code>/@slug</code>, gerador de legendas IA, postagem no Telegram e selo de promoção real.
        </p>

        <h2 style={{ color: '#F8FBFF', fontSize: 17 }}>
          3. Cancelamento, Renovação e Reembolso
        </h2>
        <p>
          As assinaturas nos ciclos Mensal, Trimestral e Anual podem ser canceladas a qualquer momento, sem multa fidelidade. O acesso aos recursos do plano contratado permanece ativo até o término do ciclo já pago. Conforme o Código de Defesa do Consumidor (Art. 49), solicitações de arrependimento em até 7 dias corridos após a primeira contratação contam com reembolso integral.
        </p>

        <h2 style={{ color: '#F8FBFF', fontSize: 17 }}>
          4. Integridade de Dados, APIs Oficiais e Envio Seguro
        </h2>
        <p>
          O Radar de Ofertas não inventa métricas, cliques ou vendas convertidas. Todos os relatórios refletem exclusivamente cliques reais registrados pelo redirecionador <code>/r/[code]</code>, APIs oficiais de afiliados (como Shopee Affiliate GraphQL e Mercado Livre) ou relatórios CSV importados pelo próprio titular. O recurso de Envio Seguro aplica intervalos configuráveis e limite horário para proteger a conta de WhatsApp do usuário contra bloqueios por spam.
        </p>
      </div>
    </section>
  );
}
