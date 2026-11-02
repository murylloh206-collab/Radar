import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import { publishStoryToInstagram } from '@/lib/server/meta-graph-service';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { jobId, imageUrl, caption, callToAction } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { ok: false, error: 'A URL da imagem 9:16 do Story é obrigatória.' },
        { status: 400 }
      );
    }

    // 1. Executar publicação via Meta Graph API
    const result = await publishStoryToInstagram(session.userId, {
      imageUrl,
      caption,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || 'Falha ao publicar Story no Instagram.' },
        { status: 400 }
      );
    }

    // 2. Se houver jobId e Supabase configurado, atualizar o job no histórico
    if (jobId && isSupabaseConfigured && supabase) {
      try {
        const { data: job } = await supabase
          .from('publication_jobs')
          .select('runtime_payload')
          .eq('id', jobId)
          .eq('user_id', session.userId)
          .maybeSingle();

        const currentPayload = job?.runtime_payload || {};
        const updatedPayload = {
          ...currentPayload,
          story: {
            imageUrl,
            publishedAt: result.publishedAt,
            creationId: result.creationId,
            mediaId: result.mediaId,
            platform: 'instagram',
            callToAction,
          },
        };

        await supabase
          .from('publication_jobs')
          .update({
            runtime_payload: updatedPayload,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId)
          .eq('user_id', session.userId);
      } catch (patchErr) {
        console.warn('[Meta Stories] Não foi possível atualizar o histórico do job:', patchErr);
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Story publicado no Instagram com sucesso!',
      mediaId: result.mediaId,
      publishedAt: result.publishedAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro interno ao publicar Story.' },
      { status: 500 }
    );
  }
}

