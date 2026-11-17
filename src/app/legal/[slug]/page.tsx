import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LegalPage } from '@/components/legal/LegalPage';
import { DOC, DOCUMENTOS } from '@/lib/legal/documentos';

export function generateStaticParams() {
  return DOCUMENTOS.filter(d => d.slug !== 'termos' && d.slug !== 'privacidade').map(d => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const doc = DOC((await params).slug);
  return { title: doc ? `${doc.titulo} · Radar de Ofertas` : 'Radar de Ofertas' };
}

export default async function LegalDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === 'termos' || slug === 'privacidade' || !DOC(slug)) notFound();
  return <LegalPage slug={slug} />;
}
