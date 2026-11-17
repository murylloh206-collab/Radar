import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Política de Privacidade · Radar de Ofertas' };

export default async function PrivacidadePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { origem, ...resto } = await searchParams;
  const query = new URLSearchParams(Object.entries(resto).filter((e): e is [string, string] => typeof e[1] === 'string')).toString();
  return <LegalPage slug="privacidade" origem={origem} query={query} />;
}
