import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CATEGORIAS } from './telas';

export const dynamic = 'force-dynamic';

/** Índice da PRÉVIA LOCAL do redesenho. Não existe em produção. */
export default function PreviaIndexPage() {
  if (process.env.NEXT_PUBLIC_PREVIA !== '1' || process.env.NODE_ENV !== 'development') notFound();
  return (
    <main className="rv4-previa">
      <header>
        <h1>Prévia do novo visual</h1>
        <p>
          Todas as telas do Radar de Ofertas com o visual proposto. Abra cada uma para navegar de verdade, ou use
          &quot;Antes e depois&quot; para comparar com a tela atual.
        </p>
        <div className="rv4-previa-warn">
          Ambiente de demonstração neste computador: os grupos, produtos, envios e a assinatura são dados de exemplo.
          Nada aqui envia mensagens, cobra pagamentos ou altera a sua conta real.
        </div>
      </header>

      {CATEGORIAS.map(categoria => (
        <section key={categoria.nome}>
          <h2>{categoria.nome}</h2>
          <div className="rv4-previa-grid">
            {categoria.telas.map(tela => (
              <article className="rv4-previa-card" key={tela.slug}>
                <Link
                  href={tela.rota}
                  className="rv4-previa-thumb"
                  aria-label={`Abrir ${tela.titulo}`}
                  style={{ backgroundImage: `url(/previa/foto?f=novo/${tela.foto}-d.jpg), url(/previa/foto?f=atual/${tela.foto}-d.jpg)` }}
                />
                <div className="rv4-previa-body">
                  <strong>{tela.titulo}</strong>
                  <p>{tela.nota}</p>
                  <div className="rv4-previa-links">
                    <Link href={tela.rota} data-main>Abrir</Link>
                    <Link href={`/previa/comparar?tela=${tela.slug}`}>Antes e depois</Link>
                    <Link href={`/previa/comparar?tela=${tela.slug}&celular=1`}>No celular</Link>
                  </div>
                  {tela.estados && (
                    <div className="rv4-previa-links" aria-label="Estados desta tela">
                      {tela.estados.map(estado => (
                        <Link key={estado.rota} href={estado.rota}>{estado.rotulo}</Link>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
