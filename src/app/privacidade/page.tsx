import React from 'react';
import Link from 'next/link';

export default function PrivacidadePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#080D18', color: '#F4F6FA', padding: '40px 20px' }}>
      <section className="rp-page" style={{ maxWidth: 960, margin: '0 auto' }}>
        <div className="rp-head" style={{ flexWrap: 'wrap' }}>
          <div>
            <span className="rp-step" style={{ color: '#35D4ED' }}>Privacidade & Proteção de Dados (LGPD)</span>
            <h1 style={{ color: '#F4F6FA' }}>Política de Privacidade — Radar de Ofertas</h1>
            <p className="rp-sub" style={{ color: '#B6C2D2' }}>
              Como tratamos dados de cadastro, credenciais de integração e informações operacionais da sua conta.
            </p>
          </div>
          <div className="rp-actions">
            <Link href="/" className="rp-btn rp-quiet">
              Voltar ao início
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
            1. Dados Coletados e Finalidade
          </h2>
          <p>
            Coletamos o endereço de e-mail de acesso, configurações de marca do painel, regras operacionais de grupos e registros técnicos necessários para autenticar sua conta e executar os fluxos configurados por você.
          </p>

          <h2 style={{ color: '#F4F6FA', fontSize: 17 }}>
            2. Isolamento por Conta e Armazenamento de Credenciais
          </h2>
          <p>
            As chaves e tokens de integração informados pelo usuário são armazenados de forma criptografada no servidor e utilizados estritamente para converter links e consultar dados das integrações vinculadas à própria conta.
          </p>

          <h2 style={{ color: '#F4F6FA', fontSize: 17 }}>
            3. Métricas de Cliques e Relatórios
          </h2>
          <p>
            Os registros de cliques contabilizam acessos aos links encurtados da plataforma sem identificar pessoalmente os visitantes dos grupos. Dados de vendas dependem exclusivamente do que é disponibilizado pelas integrações conectadas pelo titular.
          </p>

          <h2 style={{ color: '#F4F6FA', fontSize: 17 }}>
            4. Direitos do Titular e Contato
          </h2>
          <p>
            O titular pode solicitar informações, atualização ou exclusão dos dados vinculados à sua conta pelos canais de suporte da plataforma.
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
            <Link href="/termos" style={{ color: '#35D4ED' }}>
              Termos de Uso →
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

