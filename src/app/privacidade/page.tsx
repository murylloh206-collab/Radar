'use client';

import React, { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Database, Lock, UserCheck } from 'lucide-react';
import '../radar-access.css';

function PrivacidadeContent() {
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
            <span className="overline">Seus dados com contexto</span>
            <h1>Política de Privacidade</h1>
            <p className="intro">
              Como tratamos informações de cadastro, sessão, integrações e operação do painel, em
              conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
            </p>
          </div>
          <div className="legal-seal">
            <strong>Conformidade LGPD</strong>
            Dados restritos ao funcionamento da sua conta e das suas integrações.
          </div>
        </div>

        <div className="legal-highlights">
          <article className="legal-highlight">
            <span aria-hidden="true">
              <Database width={18} height={18} />
            </span>
            <h3>Dados necessários</h3>
            <p>
              Coletamos o essencial para criar sua conta, autenticar seu acesso e operar as funções
              contratadas.
            </p>
          </article>

          <article className="legal-highlight">
            <span aria-hidden="true">
              <Lock width={18} height={18} />
            </span>
            <h3>Isolamento por conta</h3>
            <p>
              Suas configurações, integrações, grupos e históricos permanecem isolados por usuário.
            </p>
          </article>

          <article className="legal-highlight">
            <span aria-hidden="true">
              <UserCheck width={18} height={18} />
            </span>
            <h3>Seus direitos</h3>
            <p>
              Você pode consultar, atualizar, exportar ou solicitar a exclusão dos seus dados pelo
              painel ou pelo suporte.
            </p>
          </article>
        </div>

        <div className="legal-layout">
          <nav className="legal-index" aria-label="Índice da política de privacidade">
            <strong>Assuntos</strong>
            <button type="button" onClick={() => jumpToTopic('priv-1')}>
              1. Dados utilizados
            </button>
            <button type="button" onClick={() => jumpToTopic('priv-2')}>
              2. Finalidade do uso
            </button>
            <button type="button" onClick={() => jumpToTopic('priv-3')}>
              3. Sessão e navegador
            </button>
            <button type="button" onClick={() => jumpToTopic('priv-4')}>
              4. Integrações e terceiros
            </button>
            <button type="button" onClick={() => jumpToTopic('priv-5')}>
              5. Retenção e segurança
            </button>
            <button type="button" onClick={() => jumpToTopic('priv-6')}>
              6. Direitos do titular
            </button>
          </nav>

          <div className="legal-topics">
            <details className="legal-topic" id="priv-1" open>
              <summary>1. Quais informações podem ser tratadas</summary>
              <p>
                Para operar sua conta no Radar de Ofertas, tratamos apenas as informações
                necessárias para a prestação do serviço:
              </p>
              <ul>
                <li>
                  <strong>Dados de conta:</strong> nome ou identificação da marca, endereço de
                  e-mail e credenciais de autenticação protegidas por hash criptográfico.
                </li>
                <li>
                  <strong>Dados operacionais:</strong> preferências de modelos de mensagem,
                  identidade visual, grupos de origem e destino selecionados e histórico de
                  publicações do painel.
                </li>
                <li>
                  <strong>Credenciais de integração:</strong> chaves e tokens informados por você
                  para conectar suas contas do Mercado Livre, Shopee, Telegram e sessão do WhatsApp,
                  armazenados com criptografia em repouso.
                </li>
              </ul>
            </details>

            <details className="legal-topic" id="priv-2">
              <summary>2. Para que os dados são usados</summary>
              <p>
                As informações são utilizadas exclusivamente para autenticar seu acesso, converter
                links com as suas credenciais de afiliado, aplicar sua identidade visual nas artes e
                mensagens, executar as filas de envio configuradas por você e apresentar as métricas
                disponíveis no seu plano.
              </p>
              <p>
                Não comercializamos seus dados pessoais nem compartilhamos suas listas de grupos ou
                configurações com outros afiliados.
              </p>
            </details>

            <details className="legal-topic" id="priv-3">
              <summary>3. Sessão, cookies e preferências no navegador</summary>
              <p>
                Utilizamos cookies HTTP-only assinados criptograficamente para manter sua sessão
                autenticada com segurança e armazenamento local no navegador apenas para lembrar
                preferências de navegação e facilitar seu retorno à tela de acesso, sem expor senhas
                ou credenciais sensíveis.
              </p>
            </details>

            <details className="legal-topic" id="priv-4">
              <summary>4. Serviços e integrações conectados</summary>
              <p>
                Quando você ativa integrações com Mercado Livre, Shopee, WhatsApp ou Telegram, a
                comunicação técnica ocorre diretamente para cumprir as ações configuradas na sua
                conta. Cada plataforma externa possui seus próprios termos e políticas de
                privacidade.
              </p>
              <p>
                Os registros de cliques em links da vitrine ou de ofertas divulgadas contabilizam o
                total de acessos, a data/hora e a origem técnica básica, sem identificar
                pessoalmente os visitantes finais.
              </p>
            </details>

            <details className="legal-topic" id="priv-5">
              <summary>5. Retenção, segurança e descarte</summary>
              <p>
                Seus dados são mantidos enquanto sua conta estiver ativa ou pelo período necessário
                para cumprimento de obrigações legais e auditoria de segurança. As credenciais de
                integração são protegidas com criptografia AES-256-GCM no servidor e podem ser
                revogadas ou removidas por você a qualquer momento nas configurações do painel.
              </p>
            </details>

            <details className="legal-topic" id="priv-6">
              <summary>6. Direitos do titular (LGPD)</summary>
              <p>
                Nos termos do Art. 18 da LGPD, você pode solicitar a confirmação do tratamento, o
                acesso, a correção de dados incompletos ou desatualizados, a exportação das suas
                informações ou a exclusão definitiva da sua conta diretamente nas configurações de
                privacidade do painel ou pelo nosso canal de suporte.
              </p>
            </details>

            <div className="legal-help">
              <div>
                <strong>Quer exercer seus direitos ou tirar dúvidas sobre privacidade?</strong>
                <p>Entre em contato com nosso atendimento para suporte rápido sobre seus dados.</p>
              </div>
              <a
                href="https://wa.me/5519993812187"
                target="_blank"
                rel="noopener noreferrer"
                className="action"
              >
                Falar com o suporte ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrivacidadePage() {
  return (
    <Suspense
      fallback={
        <div id="radar-access" lang="pt-BR">
          <div className="shell legal" />
        </div>
      }
    >
      <PrivacidadeContent />
    </Suspense>
  );
}
