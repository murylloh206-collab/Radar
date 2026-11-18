import { after, NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { executeSocialPost, getSocialPost, prepareSocialPost, SocialPublishError, type SocialChannel } from '@/lib/server/social-posts';
import { copierStatusGroups, MAX_STATUS_GROUPS } from '@/lib/server/wa-gateway/copier-groups';
import { getGatewayStatus } from '@/lib/server/wa-gateway/group-status';

export const dynamic = 'force-dynamic';
// O envio continua depois da resposta (after): arte, upload, publicação e, no status de grupo,
// a distribuição da chave do grupo para cada participante na 1ª vez.
export const maxDuration = 240;

/**
 * Publica uma oferta do próprio cliente no story, feed ou status nos grupos.
 * Responde assim que a publicação é reservada; o envio roda em segundo plano e a tela acompanha pelo GET.
 */
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Faça login para continuar.' }, { status: 401 });
  let body: { jobId?: unknown; channel?: unknown; connectionId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 }); }
  if (typeof body.jobId !== 'string' || typeof body.channel !== 'string') {
    return NextResponse.json({ ok: false, error: 'Informe a oferta e o canal.' }, { status: 400 });
  }
  try {
    // Status nos grupos: sempre os grupos de destino ativos do Copiador (decidido no servidor).
    let groupJids: string[] | undefined;
    let groupNames: Record<string, string> | undefined;
    if (body.channel === 'whatsapp_group_status') {
      const gateway = await getGatewayStatus(session.userId);
      if (gateway.status !== 'conectado') return NextResponse.json({ ok: false, error: 'Conecte o status nos grupos pelo QR code antes de publicar.' }, { status: 409 });
      const groups = (await copierStatusGroups(session, gateway.phone)).slice(0, MAX_STATUS_GROUPS);
      if (!groups.length) return NextResponse.json({ ok: false, error: 'Nenhum grupo de destino ativo no Copiador. Ative os grupos no Copiador e tente de novo.' }, { status: 400 });
      groupJids = groups.map(group => group.jid);
      groupNames = Object.fromEntries(groups.map(group => [group.jid, group.name]));
    }
    const request = {
      jobId: body.jobId, channel: body.channel as SocialChannel,
      connectionId: typeof body.connectionId === 'string' ? body.connectionId : undefined,
      groupJids, groupNames, origin: 'manual' as const,
    };
    const prepared = await prepareSocialPost(session.userId, request);
    const task = async () => {
      try { await executeSocialPost(session.userId, prepared, request); }
      catch (error) { console.error('[social] envio em segundo plano falhou:', error instanceof Error ? error.message : error); }
    };
    // Na Vercel o after() mantém a função viva depois da resposta; fora de uma requisição real (testes) roda solto.
    try { after(task); } catch { void task(); }
    return NextResponse.json({
      ok: true, queued: true, postId: prepared.postId, offerNumber: prepared.offer.offerNumber,
      groups: groupJids?.length || 0,
    }, { status: 202 });
  } catch (error) {
    if (error instanceof SocialPublishError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Não foi possível publicar.' }, { status: 500 });
  }
}

/** Andamento de uma publicação: pendente (enviando), publicado, incerto ou falha. */
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Faça login para continuar.' }, { status: 401 });
  const postId = req.nextUrl.searchParams.get('postId') || '';
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return NextResponse.json({ ok: false, error: 'Publicação inválida.' }, { status: 400 });
  const post = await getSocialPost(session.userId, postId);
  if (!post) return NextResponse.json({ ok: false, error: 'Publicação não encontrada.' }, { status: 404 });
  return NextResponse.json({ ok: true, post }, { headers: { 'Cache-Control': 'no-store' } });
}
