import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { previewSocialArt, SocialPublishError } from '@/lib/server/social-posts';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Prévia da arte (não publica e não consome a cota). */
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Faça login para continuar.' }, { status: 401 });
  let body: { jobId?: unknown; format?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 }); }
  if (typeof body.jobId !== 'string') return NextResponse.json({ ok: false, error: 'Informe a oferta.' }, { status: 400 });
  try {
    const art = await previewSocialArt(session.userId, { jobId: body.jobId, format: body.format === 'feed' ? 'feed' : 'story' });
    return NextResponse.json({ ok: true, image: `data:image/jpeg;base64,${art.toString('base64')}` }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof SocialPublishError ? error.status : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Não foi possível gerar a prévia.' }, { status });
  }
}
