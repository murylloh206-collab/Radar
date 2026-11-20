import { after, NextRequest, NextResponse } from 'next/server';
import { acceptCopierEvent, runDurableCopierCycle, CopierRuntimeError } from '@/lib/server/copier-runtime';

export const runtime = 'nodejs';
// O assistente responde depois do 202 (after): 10 links com foto levam bem mais que 60 s.
export const maxDuration = 180;
export async function GET() { return NextResponse.json({ ok: true, service: 'Evolution webhook receiver' }); }
export async function POST(req: NextRequest) {
  if (['secret', 'apikey', 'token'].some(parameter => req.nextUrl.searchParams.has(parameter))) {
    return NextResponse.json({ ok: false, error: 'Autenticação somente por cabeçalho.' }, { status: 400 });
  }
  const started = performance.now();
  try {
    const text = await req.text();
    if (text.length > 2 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'Evento excede o tamanho permitido.' }, { status: 413 });
    let payload;
    try { payload = JSON.parse(text); }
    catch { return NextResponse.json({ ok: false, error: 'JSON inválido.' }, { status: 400 }); }
    if (!payload || typeof payload !== 'object') return NextResponse.json({ ok: false }, { status: 400 });
    const secret = req.headers.get('x-webhook-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const result = await acceptCopierEvent(payload, secret);

    // Auto-processamento imediato na nuvem: não depende de worker no PC do usuário!
    let cycleResult = null;
    if (result.inserted > 0) {
      try {
        cycleResult = await runDurableCopierCycle();
      } catch (cycleErr) {
        console.error('[Webhook] Falha no ciclo imediato pós-recebimento:', cycleErr);
      }
    }

    // Assistente: responde depois de devolver o 202 ao gateway (a resposta leva alguns segundos por link).
    if ((result as { assistantInserted?: number }).assistantInserted) {
      const task = async () => {
        try { const { runAssistantCycle } = await import('@/lib/server/assistant/runtime'); await runAssistantCycle({ budgetMs: 150_000 }); }
        catch (error) { console.error('[Assistente] ciclo falhou:', error instanceof Error ? error.message : error); }
      };
      try { after(task); } catch { void task(); }
    }

    return NextResponse.json({ ok: true, ...result, cycle: cycleResult }, { status: 202,
      headers: { 'Cache-Control': 'no-store', 'Server-Timing': `durable-inbox;dur=${(performance.now() - started).toFixed(1)}` } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof CopierRuntimeError ? error.message : 'Não foi possível persistir o evento. O gateway deve tentar novamente.' },
      { status: error instanceof CopierRuntimeError ? error.status : 503 });
  }
}
