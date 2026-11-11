import React from 'react';
import Link from 'next/link';
import { PLANS_ORDER, PLANS_CONFIG, formatCurrencyBRL } from '@/lib/plans-config';

export default function TermosPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#080D18', color: '#F4F6FA', padding: '40px 20px' }}>
      <section className="rp-page" style={{ maxWidth: 960, margin: '0 auto' }}>
        <div className="rp-head" style={{ flexWrap: 'wrap' }}>
          <div>
            <span className="rp-step" style={{ color: '#35D4ED' }}>Jurídico & Transparência SaaS</span>
            <h1 style={{ color: '#F4F6FA' }}>Termos de Uso e Assinatura — Radar de Ofertas</h1>
            <p className="rp-sub" style={{ color: '#B6C2D2' }}>
              Regras de utilização da plataforma, recursos dos planos Impulse, Plus e Ultimate, condições de assinatura e uso responsável.
            </p>
          </div>
          <div className="rp-actions">
            <Link href="/" className="rp-btn rp-quiet">
              Voltar ao início
            </Link>
            <Link href="/#rh-planos" className="rp-btn rp-primary">
              Ver Planos e Preços
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
            1. Planos de Assinatura (Impulse, Plus e Ultimate)
          </h2>
          <p>
            O Radar de Ofertas opera no modelo de Software como Serviço (SaaS) com três planos de assinatura nas modalidades mensal ou anual (com compromisso de 12 meses). Não há período de teste gratuito.
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
                    background: '#080D18',
                    border: '1px solid #2B3A50',
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <strong style={{ color: '#35D4ED', fontSize: 15 }}>Plano {p.name}</strong>
                  <div style={{ fontSize: 12, color: '#B6C2D2', marginTop: 4 }}>{p.landingSummary}</div>
                  <div style={{ fontSize: 12, color: '#F4F6FA', marginTop: 8 }}>
                    • Mensal: R$ {formatCurrencyBRL(p.monthlyPrice)}/mês
                    <br />
                    • Anual: 12× R$ {formatCurrencyBRL(p.annualMonthlyEquivalent)}/parcela (Total anual R$ {formatCurrencyBRL(p.annualTotalPrice)})
                  </div>
                </div>
              );
            })}
          </div>

          <h2 style={{ color: '#F4F6FA', fontSize: 17 }}>
            2. Contas de Afiliado e Vínculo com Lojas
          </h2>
          <p>
            O Radar de Ofertas é uma plataforma independente, sem vínculo de aprovação ou parceria oficial com o Mercado Livre, Shopee, WhatsApp ou Telegram. Para gerar links de afiliado, o usuário deve possuir cadastro próprio aprovado na respectiva loja e configurar suas credenciais no painel.
          </p>

          <h2 style={{ color: '#F4F6FA', fontSize: 17 }}>
            3. Conexão com o WhatsApp e Uso Responsável
          </h2>
          <p>
            A conexão utilizada com o WhatsApp não é oficial da Meta/WhatsApp, existindo risco de restrição ou bloqueio do número conectado. Os controles de intervalo, horários e limites diários ajudam a organizar o ritmo de envios, mas não eliminam esse risco. O usuário compromete-se a publicar apenas em grupos e canais próprios ou autorizados, sem prática de spam.
          </p>

          <h2 style={{ color: '#F4F6FA', fontSize: 17 }}>
            4. Cancelamento, Renovação e Direito de Arrependimento
          </h2>
          <p>
            As assinaturas podem ser gerenciadas pelo titular a qualquer momento, mantendo-se o acesso até o fim do período contratado. Conforme o Art. 49 do Código de Defesa do Consumidor, o titular dispõe do prazo de 7 dias corridos após a contratação inicial para exercer o direito de arrependimento.
          </p>

          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: '1px solid #2B3A50',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              fontSize: 12,
            }}
          >
            <Link href="/privacidade" style={{ color: '#35D4ED' }}>
              Política de Privacidade →
            </Link>
            <Link href="/ajuda" style={{ color: '#35D4ED' }}>
              Central de Ajuda →
            </Link>
            <a
              href="https://wa.me/5519993812187"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#35D4ED' }}
            >
              Atendimento no WhatsApp ↗
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
