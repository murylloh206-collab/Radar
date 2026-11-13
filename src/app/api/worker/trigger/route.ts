import { NextRequest, NextResponse } from 'next/server';
import { runWorkerCycle } from '@/lib/server/worker-engine';
import { requireAdminAuth } from '@/lib/server/auth';
import { checkCronSecret } from '@/lib/server/cron-auth';

export async function POST(req: NextRequest) {
  try {
    // Autorizado: administrador com sessão no navegador OU chamada automática com CRON_SECRET no cabeçalho.
    const isAdmin = requireAdminAuth(req).authorized;
    const hasCronHeader = Boolean(req.headers.get('authorization') || req.headers.get('x-cron-secret'));
    if (!isAdmin) {
      const denied = hasCronHeader ? checkCronSecret(req) : null;
      if (!hasCronHeader || denied) {
        return denied && denied.status === 503 ? denied : NextResponse.json(
          { ok: false, error: 'Acesso não autorizado. Requer sessão de administrador ou token de cron válido.' },
          { status: 401 }
        );
      }
    }

    // EXECUÇÃO PROTEGIDA DO WORKER NO SERVIDOR (sem expor segredos ao navegador)
    const report = await runWorkerCycle();
    return NextResponse.json({ ok: true, report });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
