'use client';

import React, { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Layers, MessageSquareWarning, ShieldCheck } from 'lucide-react';
import { PLANS_CONFIG } from '@/lib/plans-config';
import '../radar-access.css';

function formatBrl(val: number): string {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TermosContent() {
  const searchParams = useSearchParams();
  const origem = searchParams.get('origem');

  const backHref = useMemo(() => {
    const params = new URLSearchParams();
    const recurso = searchParams.get('recurso');
    const redirect = searchParams.get('redirect');
    const plano = searchParams.get('plano');
    const periodo = searchParams.get('periodo');
    if (recurso) params.set('recurso', recurso);
    if (redirect) params.set('redirect', redirect);
    if (plano) params.set('plano', plano);
    if (periodo) params.set('periodo', periodo);
    const qs = params.toString();
    const suffix = qs ? `?${qs}` : '';

    if (origem === 'cadastro') return `/cadastro${suffix}`;
    if (origem === 'login') return `/login${suffix}`;
    return '/';
  }, [origem, searchParams]);

  const jumpToTopic = (id: string) => {
    const target = document.getElementById(id) as HTMLDetailsElement | null;
    if (!target) return;
    target.open = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div id="radar-access" lang="pt-BR">
      <div className="shell legal">
        <div className="auth-header">
          <Link href="/" className="brand" aria-label="Voltar para a página inicial do Radar de Ofertas">
            <span className="brand-mark" aria-hidden="true" />
            <span>Radar de Ofertas</span>
          </Link>
          <Link href={backHref} className="back-link">
            ← Voltar
          </Link>
        </div>

        <div className="legal-head">
          <div>
            <span className="overline">Leitura clara</span>
            <h1>Termos de uso</h1>
            <p className="intro">
              Condições de uso do Radar de Ofertas, responsabilidades da conta, funcionamento dos
              planos e regras sobre integrações e canais conectados.
            </p>
          </div>
          <div className="legal-seal">
            <strong>Transparência contratual</strong>
            Vigência contínua · Condições aplicáveis às contas e assinaturas da plataforma.
          </div>
        </div>

        <div className="legal-highlights">
          <article className="legal-highlight">
            <span aria-hidden="true">
              <ShieldCheck width={18} height={18} />
            </span>
            <h3>Uso com responsabilidade</h3>
            <p>
              Você controla as contas conectadas, os grupos escolhidos e o conteúdo que decide
              publicar.
            </p>
          </article>

          <article className="legal-highlight">
            <span aria-hidden="true">
              <Layers width={18} height={18} />
            </span>
            <h3>Planos sem surpresa</h3>
            <p>
              As funcionalidades seguem o plano contratado (Impulse, Plus ou Ultimate), sem período
              de teste gratuito.
            </p>
          </article>

          <article className="legal-highlight">
            <span aria-hidden="true">
              <MessageSquareWarning width={18} height={18} />
            </span>
            <h3>Transparência técnica</h3>
            <p>
              As integrações e a conexão com o WhatsApp têm limites e riscos operacionais que
              precisam ser conhecidos.
            </p>
          </article>
        </div>

        <div className="legal-layout">
          <nav className="legal-index" aria-label="Índice dos termos">
            <strong>Assuntos</strong>
            <button type="button" onClick={() => jumpToTopic('term-1')}>
              1. O que é o Radar
            </button>
            <button type="button" onClick={() => jumpToTopic('term-2')}>
              2. Sua conta e integrações
            </button>
            <button type="button" onClick={() => jumpToTopic('term-3')}>
              3. Planos e contratação
            </button>
            <button type="button" onClick={() => jumpToTopic('term-4')}>
              4. WhatsApp e risco de bloqueio
            </button>
            <button type="button" onClick={() => jumpToTopic('term-5')}>
              5. Links, preços e métricas
            </button>
            <button type="button" onClick={() => jumpToTopic('term-6')}>
              6. Cancelamento e suporte
            </button>
          </nav>

          <div className="legal-topics">
            <details className="legal-topic" id="term-1" open>
              <summary>1. O que é o Radar de Ofertas</summary>
              <p>
                O Radar de Ofertas é uma plataforma independente de software como serviço (SaaS)
                para afiliados organizarem ofertas, personalizarem mensagens e divulgarem produtos
                em seus próprios canais no WhatsApp, Telegram e vitrine pública.
              </p>
              <p>
                A plataforma não possui vínculo societário, parceria oficial ou aprovação comercial
                com o Mercado Livre, a Shopee, o WhatsApp ou o Telegram.
              </p>
            </details>

            <details className="legal-topic" id="term-2">
              <summary>2. Sua conta e suas integrações</summary>
              <p>
                Para utilizar links de afiliado, você precisa manter cadastro próprio e aprovado
                nos respectivos programas de afiliados (Mercado Livre e Shopee) e configurar suas
                credenciais no painel.
              </p>
              <ul>
                <li>
                  Você é responsável por acompanhar apenas grupos e fontes aos quais tenha acesso
                  legítimo e autorização.
                </li>
                <li>
                  Você responde pelo conteúdo divulgado e pelo respeito às regras dos programas de
                  afiliados e dos canais utilizados.
                </li>
              </ul>
            </details>

            <details className="legal-topic" id="term-3">
              <summary>3. Planos, valores e contratação</summary>
              <p>
                Os recursos liberados no painel seguem o plano ativo na conta, sem período de teste
                gratuito:
              </p>
              <ul>
                <li>
                  <strong>Impulse:</strong> R$ {formatBrl(PLANS_CONFIG.impulse.monthlyPrice)}/mês no
                  mensal ou 12× de R$ {formatBrl(PLANS_CONFIG.impulse.annualMonthlyEquivalent)} no
                  anual (total anual de R$ {formatBrl(PLANS_CONFIG.impulse.annualTotalPrice)}). Até
                  30 ofertas publicadas por dia, copiador e mensagens personalizadas.
                </li>
                <li>
                  <strong>Plus:</strong> R$ {formatBrl(PLANS_CONFIG.plus.monthlyPrice)}/mês no
                  mensal ou 12× de R$ {formatBrl(PLANS_CONFIG.plus.annualMonthlyEquivalent)} no
                  anual (total anual de R$ {formatBrl(PLANS_CONFIG.plus.annualTotalPrice)}). Até
                  100 ofertas publicadas por dia, identidade visual, marca d’água, formatos para
                  feed e story, vitrine pública e métricas de cliques.
                </li>
                <li>
                  <strong>Ultimate:</strong> R$ {formatBrl(PLANS_CONFIG.ultimate.monthlyPrice)}/mês
                  no mensal ou 12× de R$ {formatBrl(PLANS_CONFIG.ultimate.annualMonthlyEquivalent)}{' '}
                  no anual (total anual de R$ {formatBrl(PLANS_CONFIG.ultimate.annualTotalPrice)}).
                  Publicações ilimitadas por dia, buscador e comparador de ofertas, alertas de queda
                  de preço e visão consolidada das integrações.
                </li>
              </ul>
            </details>

            <details className="legal-topic" id="term-4">
              <summary>4. Conexão com o WhatsApp e risco operacional</summary>
              <p>
                A conexão utilizada para automação de grupos no WhatsApp não é uma API oficial da
                Meta/WhatsApp. Por esse motivo, existe risco técnico de desconexão, restrição
                temporária ou bloqueio do número conectado.
              </p>
              <p>
                Os controles de horário, intervalos entre postagens e limites diários ajudam a
                manter uma cadência moderada e evitar disparos excessivos, mas não eliminam esse
                risco nem garantem imunidade contra bloqueios aplicados pelo WhatsApp.
              </p>
            </details>

            <details className="legal-topic" id="term-5">
              <summary>5. Conversão de links, preços e métricas</summary>
              <p>
                Antes do envio, o fluxo busca converter o link da oferta para o seu link de
                afiliado configurado. Quando a conversão ou a validação falha, a publicação não deve
                reutilizar link de terceiros e permanece retida para revisão.
              </p>
              <p>
                Preços, cupons, estoque e condições mudam diretamente nas lojas. As métricas de
                cliques mostram interações registradas nos links do painel, sem identificar
                pessoalmente cada visitante e sem garantir vendas ou comissões.
              </p>
            </details>

            <details className="legal-topic" id="term-6">
              <summary>6. Cancelamento, arrependimento e suporte</summary>
              <p>
                Você pode gerenciar ou solicitar o cancelamento da sua assinatura a qualquer
                momento. Conforme o Art. 49 do Código de Defesa do Consumidor (Lei nº 8.078/1990),
                nas contratações realizadas fora do estabelecimento comercial é assegurado o prazo
                de 7 (sete) dias corridos a contar da contratação para exercer o direito de
                arrependimento com reembolso integral.
              </p>
            </details>

            <div className="legal-help">
              <div>
                <strong>Dúvidas sobre os termos ou sobre sua assinatura?</strong>
                <p>Nosso atendimento responde diretamente pelo WhatsApp e pela página de ajuda.</p>
              </div>
              <a
                href="https://wa.me/5519993812187"
                target="_blank"
                rel="noopener noreferrer"
                className="action"
              >
                Conversar com o suporte ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TermosPage() {
  return (
    <Suspense
      fallback={
        <div id="radar-access" lang="pt-BR">
          <div className="shell legal" />
        </div>
      }
    >
      <TermosContent />
    </Suspense>
  );
}
