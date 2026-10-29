import { NextRequest, NextResponse } from 'next/server';
import { runWorkerCycle } from '@/lib/server/worker-engine';
import { getSessionFromRequest, requireAdminAuth } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  try {
    // Autenticação flexível e segura:
    // 1. Administrador autenticado no navegador (via sessão protegida)
    // 2. Chamada de automação externa via Header Authorization: Bearer <CRON_SECRET>
    const authHeader = req.headers.get('authorization') || '';
    const cronSecret = process.env.CRON_SECRET || 'radar_cron_secret_772819034';
    const isCronSecretValid = authHeader === `Bearer ${cronSecret}`;

    const adminAuth = requireAdminAuth(req);
    const isAdmin = adminAuth.authorized;

    if (!isAdmin && !isCronSecretValid) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Acesso não autorizado. Requer sessão de administrador ou token de cron válido.',
        },
        { status: 401 }
      );
    }

    // 3. EXECUÇÃO PROTEGIDA DO WORKER NO SERVIDOR (sem expor segredos ao navegador)
    const report = await runWorkerCycle();
    return NextResponse.json({
      ok: true,
      report,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
