import { NextRequest, NextResponse } from 'next/server';
import { runWorkerCycle } from '@/lib/server/worker-engine';
import { syncRecentOriginMessagesFromEvolution } from '@/lib/server/copier-service';

async function handlePoll(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;

    // 1. REJEIÇÃO OBRIGATÓRIA: Recusar chamadas quando o segredo do worker estiver ausente no servidor
    if (!cronSecret || cronSecret.trim().length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Worker poll não configurado: segredo CRON_SECRET ausente no servidor.',
        },
        { status: 503 }
      );
    }

    // 2. SEGURANÇA: Não aceitar segredos na URL
    if (req.nextUrl.searchParams.has('secret') || req.nextUrl.searchParams.has('token') || req.nextUrl.searchParams.has('cron_secret')) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Segurança: Segredos na URL não são permitidos. Envie via cabeçalho HTTP (Authorization: Bearer <CRON_SECRET> ou x-cron-secret).',
        },
        { status: 400 }
      );
    }

    // 3. Validação estrita do cabeçalho
    const authHeader = req.headers.get('authorization');
    const expectedBearer = `Bearer ${cronSecret.trim()}`;
    const headerSecret = req.headers.get('x-cron-secret');

    if (authHeader !== expectedBearer && headerSecret !== cronSecret.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Acesso não autorizado ao worker: token inválido ou ausente.' },
        { status: 401 }
      );
    }

    const syncedOriginMessages = await syncRecentOriginMessagesFromEvolution(true).catch(() => 0);
    const report = await runWorkerCycle();
    return NextResponse.json({
      ok: true,
      syncedOriginMessages,
      report,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handlePoll(req);
}

export async function POST(req: NextRequest) {
  return handlePoll(req);
}
