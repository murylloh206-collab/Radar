import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DOC, DOCUMENTOS, type Bloco } from '@/lib/legal/documentos';
import { EMPRESA, dadosPendentes } from '@/lib/legal/empresa';
import '@/app/radar-access.css';

function renderBloco(bloco: Bloco, key: number) {
  if (typeof bloco === 'string') return <p key={key}>{bloco}</p>;
  if ('lista' in bloco) return <ul key={key}>{bloco.lista.map((item, i) => <li key={i}>{item}</li>)}</ul>;
  if ('aviso' in bloco) return <p key={key} className="lg-aviso">{bloco.aviso}</p>;
  return (
    <div key={key} className="lg-tabela" role="region" aria-label="Tabela" tabIndex={0}>
      <table>
        <thead><tr>{bloco.tabela.cabecalho.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{bloco.tabela.linhas.map((linha, i) => <tr key={i}>{linha.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const voltarPara = (origem?: string, query?: string) => {
  if (origem === 'cadastro') return `/cadastro${query ? `?${query}` : ''}`;
  if (origem === 'login') return `/login${query ? `?${query}` : ''}`;
  return '/';
};

/** Página de um documento legal. O conteúdo vem de src/lib/legal/documentos.ts. */
export function LegalPage({ slug, origem, query }: { slug: string; origem?: string; query?: string }) {
  const doc = DOC(slug);
  if (!doc) notFound();

  return (
    <div id="radar-access" lang="pt-BR">
      <div className="shell legal">
        <div className="auth-header">
          <Link href="/" className="brand" aria-label="Página inicial do Radar de Ofertas">
            <span className="brand-mark" aria-hidden="true" />
            <span>{EMPRESA.marca}</span>
          </Link>
          <Link href={voltarPara(origem, query)} className="back-link">← Voltar</Link>
        </div>

        <div className="legal-head">
          <div>
            <span className="overline">Documentos legais</span>
            <h1>{doc.titulo}</h1>
            <p className="intro">{doc.resumo}</p>
          </div>
          <div className="legal-seal">
            <strong>Versão {EMPRESA.versaoDocumentos}</strong>
            Em vigor desde {EMPRESA.vigenciaDesde}. Base legal: {doc.base}
          </div>
        </div>

        {dadosPendentes() && (
          <p className="lg-aviso" role="note">
            A identificação completa do responsável (nome, documento e endereço) está sendo atualizada nesta página.
            Enquanto isso, fale conosco por {EMPRESA.emailSuporte}.
          </p>
        )}

        <div className="legal-layout">
          <nav className="legal-index" aria-label="Neste documento">
            <strong>Neste documento</strong>
            {doc.secoes.map(secao => <a key={secao.id} href={`#${secao.id}`}>{secao.titulo}</a>)}
            <strong style={{ marginTop: 18 }}>Outros documentos</strong>
            {DOCUMENTOS.filter(d => d.slug !== slug).map(d => (
              <Link key={d.slug} href={d.slug === 'termos' || d.slug === 'privacidade' ? `/${d.slug}` : `/legal/${d.slug}`}>{d.titulo}</Link>
            ))}
            <Link href="/legal">Central de Privacidade</Link>
          </nav>

          <div className="legal-topics">
            {doc.secoes.map(secao => (
              <section key={secao.id} id={secao.id} className="legal-topic lg-secao" aria-labelledby={`${secao.id}-t`}>
                <h2 id={`${secao.id}-t`}>{secao.titulo}</h2>
                {secao.blocos.map(renderBloco)}
              </section>
            ))}

            <div className="legal-help">
              <div>
                <strong>Dúvidas ou pedidos sobre seus dados?</strong>
                <p>Fale com o Encarregado pelo e-mail {EMPRESA.emailPrivacidade} ou abra um pedido na Central de Privacidade.</p>
              </div>
              <Link href="/legal" className="action">Central de Privacidade</Link>
            </div>
          </div>
        </div>

        <div className="auth-bottom">
          <span>{EMPRESA.marca} · versão {EMPRESA.versaoDocumentos}</span>
          <div className="auth-bottom-links">
            <Link href="/termos">Termos</Link>
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/legal/cookies">Cookies</Link>
            <Link href="/legal">Central de Privacidade</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
