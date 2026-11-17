import { NextRequest, NextResponse } from 'next/server';
import { getStrictSession } from '@/lib/server/auth';
import { disconnectGateway, GatewayError, getGatewayStatus } from '@/lib/server/wa-gateway/group-status';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Estado do conector de status de grupo do cliente logado. */
export async function GET(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Entre na sua conta.' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await getGatewayStatus(session.userId)) });
  } catch (error) {
    const status = error instanceof GatewayError ? error.status : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao consultar.' }, { status });
  }
}

/** Desconecta o aparelho do conector e apaga a sessão guardada. */
export async function DELETE(req: NextRequest) {
  const session = getStrictSession(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Entre na sua conta.' }, { status: 401 });
  try {
    await disconnectGateway(session.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao desconectar.' }, { status: 500 });
  }
}
