import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { publishSocialPost, SocialPublishError, type SocialChannel } from '@/lib/server/social-posts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Publica uma oferta do próprio cliente no story, feed ou status do WhatsApp. */
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Faça login para continuar.' }, { status: 401 });
  let body: { jobId?: unknown; channel?: unknown; connectionId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 }); }
  if (typeof body.jobId !== 'string' || typeof body.channel !== 'string') {
    return NextResponse.json({ ok: false, error: 'Informe a oferta e o canal.' }, { status: 400 });
  }
  try {
    const result = await publishSocialPost(session.userId, {
      jobId: body.jobId, channel: body.channel as SocialChannel,
      connectionId: typeof body.connectionId === 'string' ? body.connectionId : undefined, origin: 'manual',
    });
    const status = result.post.status === 'falha' ? 502 : 200;
    return NextResponse.json({ ok: status === 200, ...result, error: result.post.error || undefined }, { status });
  } catch (error) {
    if (error instanceof SocialPublishError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Não foi possível publicar.' }, { status: 500 });
  }
}
