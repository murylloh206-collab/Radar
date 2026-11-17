import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TODAS } from '../telas';

export const dynamic = 'force-dynamic';

/** Antes (foto da tela atual) ao lado do depois (a tela nova, ao vivo). Só na prévia local. */
export default async function PreviaCompararPage({ searchParams }: { searchParams: Promise<{ tela?: string; celular?: string }> }) {
  if (process.env.NEXT_PUBLIC_PREVIA !== '1' || process.env.NODE_ENV !== 'development') notFound();
  const params = await searchParams;
  const index = Math.max(0, TODAS.findIndex(t => t.slug === params.tela));
  const tela = TODAS[index];
  const celular = params.celular === '1';
  const sufixo = celular ? 'm' : 'd';
  const anterior = TODAS[(index - 1 + TODAS.length) % TODAS.length];
  const proxima = TODAS[(index + 1) % TODAS.length];
  const q = celular ? '&celular=1' : '';

  return (
    <main>
      <div className="rv4-previa" style={{ paddingBottom: 0 }}>
        <div className="rv4-previa-links" style={{ marginBottom: 14 }}>
          <Link href="/previa">Todas as telas</Link>
          <Link href={`/previa/comparar?tela=${anterior.slug}${q}`}>Anterior: {anterior.titulo}</Link>
          <Link href={`/previa/comparar?tela=${proxima.slug}${q}`}>Próxima: {proxima.titulo}</Link>
          <Link href={`/previa/comparar?tela=${tela.slug}${celular ? '' : '&celular=1'}`}>{celular ? 'Ver no computador' : 'Ver no celular'}</Link>
          <Link href={tela.rota} data-main>Abrir a tela nova inteira</Link>
        </div>
        <header>
          <h1>{tela.titulo}</h1>
          <p>{tela.nota}</p>
        </header>
      </div>
      <div className="rv4-compare" style={celular ? { gridTemplateColumns: '390px 390px', justifyContent: 'center' } : undefined}>
        <figure>
          <figcaption>Antes (foto da tela atual)</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/previa/foto?f=atual/${tela.foto}-${sufixo}.jpg`} alt={`Tela atual: ${tela.titulo}`} />
        </figure>
        <figure>
          <figcaption>Depois (tela nova, funcionando)</figcaption>
          <iframe
            src={tela.rota}
            title={`Tela nova: ${tela.titulo}`}
            style={{ width: '100%', height: celular ? 844 : '82vh', border: '1px solid var(--radar-border)', borderRadius: 12, background: '#0c0c0d' }}
          />
        </figure>
      </div>
    </main>
  );
}
