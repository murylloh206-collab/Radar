import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { getMetaIntegration } from '@/lib/server/meta-graph-service';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401, headers });
  }

  try {
    const data = await getMetaIntegration(session.userId);
    return NextResponse.json({ ok: true, integration: data }, { headers });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Falha ao consultar integração da Meta.' },
      { status: 500, headers }
    );
  }
}
