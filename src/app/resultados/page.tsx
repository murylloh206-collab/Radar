'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ResultadosRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/estatisticas');
  }, [router]);

  return (
    <div className="rp-page" style={{ padding: 40, textAlign: 'center' }}>
      <p className="rp-sub">Redirecionando para Estatísticas...</p>
    </div>
  );
}
