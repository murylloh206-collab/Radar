import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { getAutopostSettings, saveAutopostSettings } from '@/lib/server/social-posts';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Faça login para continuar.' }, { status: 401 });
  return NextResponse.json({ ok: true, settings: await getAutopostSettings(session.userId) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Faça login para continuar.' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 }); }
  try {
    return NextResponse.json({ ok: true, settings: await saveAutopostSettings(session.userId, body) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Não foi possível salvar.' }, { status: 500 });
  }
}
