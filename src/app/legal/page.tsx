import type { Metadata } from 'next';
import Link from 'next/link';
import { DOCUMENTOS } from '@/lib/legal/documentos';
import { EMPRESA } from '@/lib/legal/empresa';
import { TitularForm } from '@/components/legal/TitularForm';
import { CookiePrefsLink } from '@/components/legal/CookieConsent';
import '../radar-access.css';

export const metadata: Metadata = { title: 'Central de Privacidade · Radar de Ofertas' };

const href = (slug: string) => (slug === 'termos' || slug === 'privacidade' ? `/${slug}` : `/legal/${slug}`);

export default function CentralPrivacidadePage() {
  return (
    <div id="radar-access" lang="pt-BR">
      <div className="shell legal">
        <div className="auth-header">
          <Link href="/" className="brand" aria-label="Página inicial do Radar de Ofertas">
            <span className="brand-mark" aria-hidden="true" />
            <span>{EMPRESA.marca}</span>
          </Link>
          <Link href="/" className="back-link">← Voltar</Link>
        </div>

        <div className="legal-head">
          <div>
            <span className="overline">Central de Privacidade</span>
            <h1>Seus dados, suas escolhas.</h1>
            <p className="intro">Todos os documentos legais do Radar num só lugar, o contato do Encarregado e um formulário para exercer seus direitos.</p>
          </div>
          <div className="legal-seal">
            <strong>Encarregado (DPO)</strong>
            {EMPRESA.encarregadoNome ? `${EMPRESA.encarregadoNome} · ` : ''}{EMPRESA.emailPrivacidade}
          </div>
        </div>

        <div className="lg-central">
          <section aria-labelledby="lg-docs">
            <h2 id="lg-docs">Documentos</h2>
            <ul className="lg-docs">
              {DOCUMENTOS.map(doc => (
                <li key={doc.slug}>
                  <Link href={href(doc.slug)}>
                    <strong>{doc.titulo}</strong>
                    <span>{doc.resumo}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="lg-mini">Versão {EMPRESA.versaoDocumentos}, em vigor desde {EMPRESA.vigenciaDesde}. <CookiePrefsLink className="rck-inline" /></p>
          </section>

          <section aria-labelledby="lg-pedido" className="auth-form">
            <span className="overline">Seus direitos (LGPD, art. 18)</span>
            <h2 id="lg-pedido">Fazer um pedido</h2>
            <p>Acesso, correção, cópia, exclusão, revogação de consentimento e mais. Você recebe um protocolo na hora.</p>
            <TitularForm />
          </section>
        </div>
      </div>
    </div>
  );
}
