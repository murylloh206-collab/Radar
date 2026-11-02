import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/server/auth';
import {
  publishFeedPostToInstagram,
  publishFeedPostToFacebook,
} from '@/lib/server/meta-graph-service';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { jobId, imageUrl, caption, publishToFacebook = true } = body;

    if (!imageUrl || !caption) {
      return NextResponse.json(
        { ok: false, error: 'A imagem e a legenda do Post são obrigatórias.' },
        { status: 400 }
      );
    }

    const errors: string[] = [];
    let igMediaId: string | undefined;
    let fbMediaId: string | undefined;

    // 1. Publicar no Instagram Feed
    const igResult = await publishFeedPostToInstagram(session.userId, {
      imageUrl,
      caption,
    });

    if (igResult.ok) {
      igMediaId = igResult.mediaId;
    } else {
      errors.push(`Instagram: ${igResult.error}`);
    }

    // 2. Publicar na Página do Facebook (se solicitado)
    if (publishToFacebook) {
      const fbResult = await publishFeedPostToFacebook(session.userId, {
        imageUrl,
        caption,
      });
      if (fbResult.ok) {
        fbMediaId = fbResult.mediaId;
      } else {
        errors.push(`Facebook: ${fbResult.error}`);
      }
    }

    if (!igMediaId && !fbMediaId) {
      return NextResponse.json(
        { ok: false, error: errors.join(' | ') || 'Falha ao publicar na Meta.' },
        { status: 400 }
      );
    }

    // 3. Atualizar registro do job se fornecido
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
          feedPost: {
            imageUrl,
            caption,
            igMediaId,
            fbMediaId,
            publishedAt: new Date().toISOString(),
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
        console.warn('[Meta Post] Falha ao atualizar histórico do job:', patchErr);
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Post publicado com sucesso nas redes!',
      igMediaId,
      fbMediaId,
      warnings: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro interno ao publicar Post.' },
      { status: 500 }
    );
  }
}

