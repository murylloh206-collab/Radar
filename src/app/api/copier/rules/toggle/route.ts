import { NextRequest, NextResponse } from 'next/server';
import { readDatabase, writeDatabase, ensureValidUuid } from '@/lib/server/storage';
import { requireAdminAuth } from '@/lib/server/auth';
import { isSupabaseConfigured, isTestIsolationActive, supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await req.json();
    const { id, isActive } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'ID da regra é obrigatório.' }, { status: 400 });
    }

    const db = readDatabase();
    const sourceIndex = db.sources.findIndex((s) => s.id === id);

    if (sourceIndex === -1) {
      return NextResponse.json({ ok: false, error: 'Regra de cópia não encontrada.' }, { status: 404 });
    }

    const newActiveState = Boolean(isActive);
    const updatedAtIso = new Date().toISOString();
    const source = db.sources[sourceIndex];

    // Se o usuário está tentando INICIAR a cópia, validar pré-requisitos obrigatórios
    if (newActiveState) {
      // 1. Origem deve ser grupo real cadastrado
      const originGroup = (db.groups || []).find((g) => g.groupJid === source.groupJid);
      if (!originGroup) {
        return NextResponse.json(
          {
            ok: false,
            error: `Não é possível iniciar a regra: o grupo de origem "${source.name || source.groupJid}" não foi encontrado na lista de grupos conectados do WhatsApp.`,
          },
          { status: 400 }
        );
      }

      // 2. Destinos devem estar configurados e não ser fictícios
      const destinations = (db.destinations || []).filter((d) => d.sourceId === id && d.isActive);
      if (destinations.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Não é possível iniciar a regra: nenhum grupo de destino está configurado ou ativo para esta regra.',
          },
          { status: 400 }
        );
      }

      for (const dest of destinations) {
        if (dest.groupJid.includes('55555555') || dest.groupJid.includes('88888888')) {
          return NextResponse.json(
            {
              ok: false,
              error: `Não é possível iniciar a regra: o destino "${dest.name || dest.groupJid}" é um identificador fictício de teste.`,
            },
            { status: 400 }
          );
        }

        if (dest.groupJid === source.groupJid) {
          return NextResponse.json(
            {
              ok: false,
              error: 'Não é possível iniciar a regra: grupo de origem e destino não podem ser idênticos (risco de loop infinito).',
            },
            { status: 400 }
          );
        }

        const destGroup = (db.groups || []).find((g) => g.groupJid === dest.groupJid);
        if (!destGroup) {
          return NextResponse.json(
            {
              ok: false,
              error: `Não é possível iniciar a regra: o grupo de destino "${dest.name || dest.groupJid}" não foi encontrado no WhatsApp.`,
            },
            { status: 400 }
          );
        }

        if (destGroup.canPost === false || destGroup.permissionStatus === 'restricted_readonly') {
          return NextResponse.json(
            {
              ok: false,
              error: `Não é possível iniciar a regra: o grupo de destino "${destGroup.name}" está marcado como somente leitura ou restrito para postagem.`,
            },
            { status: 400 }
          );
        }
      }

      // 3. Pelo menos uma loja permitida deve estar configurada
      const allowedStores = source.allowedStores || [];
      const hasConfiguredStore = (db.stores || []).some((s) => {
        if (allowedStores.length > 0 && !allowedStores.includes(s.storeName)) return false;
        return Boolean((s.affiliateTag && s.affiliateTag.trim().length > 0) || (s.appId && s.appId.trim().length > 0));
      });

      if (!hasConfiguredStore) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Não é possível iniciar a regra: nenhuma das lojas permitidas na regra possui tag de afiliado configurada.',
          },
          { status: 400 }
        );
      }
    }

    // 1. PERSISTÊNCIA NO ARMAZENAMENTO COMPARTILHADO (SUPABASE)
    // Se o Supabase estiver configurado, a gravação é mandatória. Qualquer erro no Supabase DEVE falhar a requisição.
    if (isSupabaseConfigured && supabase && !isTestIsolationActive()) {
      const validSourceUuid = ensureValidUuid(id);
      const { error: sbError } = await supabase
        .from('copy_sources')
        .update({
          is_active: newActiveState,
          updated_at: updatedAtIso,
        })
        .eq('id', validSourceUuid);

      if (sbError) {
        console.error('[Copier] Falha crítica ao persistir regra no Supabase:', sbError);
        return NextResponse.json(
          {
            ok: false,
            error: `Falha ao persistir estado da regra no Supabase: ${sbError.message}`,
            code: 'SUPABASE_SYNC_ERROR',
          },
          { status: 500 }
        );
      }

      // Se pausada, cancelar jobs agendados também no Supabase
      if (!newActiveState) {
        await supabase
          .from('publication_jobs')
          .update({
            status: 'cancelado',
            error_details: 'Disparo cancelado: regra de cópia foi pausada pelo usuário.',
            updated_at: updatedAtIso,
          })
          .eq('source_id', validSourceUuid)
          .eq('status', 'agendado');
      }
    }

    // 2. PERSISTÊNCIA NO ARMAZENAMENTO LOCAL
    db.sources[sourceIndex].isActive = newActiveState;
    db.sources[sourceIndex].updatedAt = updatedAtIso;

    let suspendedJobsCount = 0;
    // Se a regra foi pausada, cancelar ou suspender jobs da fila que ainda não foram enviados
    if (!newActiveState) {
      db.jobs.forEach((j) => {
        if (j.sourceId === id && j.status === 'agendado') {
          j.status = 'cancelado';
          j.errorDetails = 'Disparo cancelado: regra de cópia foi pausada pelo usuário.';
          j.updatedAt = updatedAtIso;
          suspendedJobsCount++;
        }
      });
    }

    writeDatabase(db);

    return NextResponse.json({
      ok: true,
      source: db.sources[sourceIndex],
      isActive: newActiveState,
      suspendedJobsCount,
      message: newActiveState
        ? `Regra "${db.sources[sourceIndex].name}" iniciada com sucesso. Aguardando mensagens.`
        : `Regra "${db.sources[sourceIndex].name}" pausada com sucesso. Novos envios impedidos.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
