import { NextRequest, NextResponse } from 'next/server';
import { CopyDestination, CopySource } from '@/lib/types';
import { readDatabase, writeDatabase, ensureValidUuid } from '@/lib/server/storage';
import { copierGroupCatalog } from '@/lib/server/copier-group-catalog';
import { scopedCopierRules } from '@/lib/server/copier-scoped-rules';
import { WhatsAppPhotoError } from '@/lib/server/whatsapp-photo-context';
import { getSessionFromRequest, requireAdminAuth } from '@/lib/server/auth';
import { isSupabaseConfigured, isTestIsolationActive, supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ ok: false, error: 'Sessão necessária.' }, { status: 401 });
  try {
    const rules = await scopedCopierRules(session, req.nextUrl.searchParams.get('connectionId') || undefined);
    return NextResponse.json({ ok: true, sources: rules.sources, destinations: rules.destinations }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof WhatsAppPhotoError ? error.message : 'Não foi possível consultar as regras.' }, { status: error instanceof WhatsAppPhotoError ? error.status : 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const body = await req.json();
    const db = readDatabase();

    const {
      id,
      groupJid,
      name,
      operationMode = 'revisao_manual',
      allowedStores = ['shopee', 'mercadolivre', 'netshoes', 'amazon', 'magalu'],
      stripThirdPartyLinks = true,
      stripExternalTags = true,
      customDelaySeconds = 60,
      templateText,
      imageMode = 'radar_art',
      startTime = '08:00',
      endTime = '22:00',
      convertAffiliateLinks = true,
      destinationJids = [],
    } = body;

    if (!groupJid) {
      return NextResponse.json(
        { ok: false, error: 'O grupo de origem é obrigatório.' },
        { status: 400 }
      );
    }

    const session = auth.session!;
    const saved = await scopedCopierRules(session, body.connectionId);
    const connection = saved.connection;
    const savedSource = saved.sources.find(source => id ? source.id === id : source.groupJid === groupJid);
    if (id && !savedSource) return NextResponse.json({ ok: false, error: 'Regra não autorizada nesta conexão.' }, { status: 403 });
    const pausing = body.isActive === false && !!savedSource && body.saveOnly !== true;
    const live = pausing ? null : await copierGroupCatalog(session, { connectionId: connection.id, refresh: true, permissions: true });
    if (live) db.groups = [...db.groups.filter(group => group.connectionId !== connection.id), ...live.groups];
    db.sources = [...db.sources.filter(source => !saved.sources.some(stored => stored.id === source.id)), ...saved.sources];
    const trustedGroups = live?.groups || db.groups.filter(group => group.userId === session.userId && group.connectionId === connection.id);
    if (body.isActive && (!Array.isArray(destinationJids) || destinationJids.some((jid: string) => {
      const group = trustedGroups.find(candidate => candidate.groupJid === jid);
      return jid === groupJid || !group || group.canPost !== true;
    }))) return NextResponse.json({ ok: false, error: 'Confirme os destinos: cada grupo deve pertencer a esta conexão e ter permissão de envio verificada.' }, { status: 400 });

    // Buscar nome oficial do grupo se não fornecido
    const originGroup = trustedGroups.find(group => group.groupJid === groupJid) || (pausing && savedSource?.groupJid === groupJid ? { name: savedSource.name } : undefined);
    if (!originGroup) {
      return NextResponse.json(
        { ok: false, error: 'O grupo de origem selecionado não pertence aos grupos conectados da sua conta.' },
        { status: 400 }
      );
    }
    const sourceName = name || originGroup?.name || 'Grupo de Origem';

    const sourceId = ensureValidUuid(savedSource?.id || id);
    const existingIndex = db.sources.findIndex(source => source.userId === session.userId && (source.connectionId === connection.id || (!source.connectionId && connection.isDefault)) && (source.id === sourceId || source.groupJid === groupJid));

    let ruleIsActive = false;
    if (typeof body.isActive === 'boolean') {
      ruleIsActive = body.isActive;
    } else if (existingIndex >= 0) {
      ruleIsActive = Boolean(db.sources[existingIndex].isActive);
    }

    // Se estiver ativando, validar se há destinos válidos informados
    if (ruleIsActive && Array.isArray(destinationJids) && destinationJids.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Para ativar o copiador, selecione pelo menos um grupo de destino com permissão de envio.' },
        { status: 400 }
      );
    }

    const updatedSource: CopySource = {
      id: sourceId,
      userId: session.userId,
      connectionId: connection.id,
      groupJid,
      name: sourceName,
      operationMode,
      isActive: ruleIsActive,
      allowedStores,
      stripThirdPartyLinks,
      stripExternalTags,
      customDelaySeconds: Number(customDelaySeconds) || 60,
      templateText: templateText || undefined,
      imageMode: imageMode || 'radar_art',
      startTime: startTime || '08:00',
      endTime: endTime || '22:00',
      convertAffiliateLinks: Boolean(convertAffiliateLinks),
      updatedAt: new Date().toISOString(),
    };

    // 1. SINCRONIZAÇÃO MANDATÓRIA COM O SUPABASE
    if (isSupabaseConfigured && supabase && !isTestIsolationActive()) {
      const { error: sbSourceErr } = await supabase.from('copy_sources').upsert(
        {
          id: sourceId,
          user_id: ensureValidUuid(updatedSource.userId),
          ...(connection.persistence === 'multi' ? { connection_id: connection.id } : {}),
          source_jid: updatedSource.groupJid,
          source_name: updatedSource.name,
          is_active: updatedSource.isActive,
          configuration: { ...updatedSource, ownerJid: live?.connection.ownerJid || connection.ownerJid },
          auto_approve: updatedSource.operationMode === 'automatico',
          updated_at: updatedSource.updatedAt,
        },
        { onConflict: 'id' }
      );

      if (sbSourceErr) {
        return NextResponse.json(
          {
            ok: false,
            error: `Falha ao gravar regra de origem no Supabase: ${sbSourceErr.message}`,
            code: 'SUPABASE_SOURCE_ERROR',
          },
          { status: 500 }
        );
      }

      // Remover destinos antigos e gravar novos no Supabase
      await supabase.from('copy_destinations').delete().eq('source_id', sourceId);

      if (Array.isArray(destinationJids) && destinationJids.length > 0) {
        const validDests = destinationJids
          .filter((destJid: string) => destJid !== groupJid)
          .map((destJid: string) => ({
            id: ensureValidUuid(),
            source_id: sourceId,
            target_jid: destJid,
          }));

        if (validDests.length > 0) {
          const { error: sbDestErr } = await supabase.from('copy_destinations').insert(validDests);
          if (sbDestErr) {
            return NextResponse.json(
              {
                ok: false,
                error: `Falha ao gravar destinos no Supabase: ${sbDestErr.message}`,
                code: 'SUPABASE_DEST_ERROR',
              },
              { status: 500 }
            );
          }
        }
      }
    }

    // 2. SINCRONIZAÇÃO COM BANCO LOCAL
    if (existingIndex >= 0) {
      db.sources[existingIndex] = updatedSource;
    } else {
      db.sources.push(updatedSource);
    }

    // Atualizar destinos vinculados no banco local
    db.destinations = db.destinations.filter((d) => d.sourceId !== sourceId);

    if (Array.isArray(destinationJids)) {
      destinationJids.forEach((destJid: string) => {
        // Prevenção de loop: a origem nunca pode ser destino de si mesma
        if (destJid === groupJid) return;

        const matchingGroup = trustedGroups.find(group => group.groupJid === destJid);
        // Validar permissão de postagem no destino
        if (matchingGroup && matchingGroup.canPost === false) {
          return; // ignora grupo somente leitura para prevenir falhas
        }

        const newDest: CopyDestination = {
          id: ensureValidUuid(),
          sourceId,
          groupJid: destJid,
          name: matchingGroup ? matchingGroup.name : destJid,
          canPost: matchingGroup ? matchingGroup.canPost !== false : true,
          isActive: true,
        };
        db.destinations.push(newDest);
      });
    }

    writeDatabase(db);

    const dests = db.destinations.filter((d) => d.sourceId === sourceId);
    const destNames = dests.map((d) => d.name);

    return NextResponse.json({
      ok: true,
      source: updatedSource,
      destinations: dests,
      flowConfirmation: {
        originName: sourceName,
        destinationNames: destNames,
        flowLabel: `Copiar de ${sourceName} → Enviar para ${destNames.length > 0 ? destNames.join(', ') : 'Nenhum destino'}`,
        mode: updatedSource.operationMode,
        isActive: updatedSource.isActive,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: err instanceof WhatsAppPhotoError ? err.message : 'Não foi possível salvar a regra do Copiador.' }, { status: err instanceof WhatsAppPhotoError ? err.status : 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = requireAdminAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ ok: false, error: 'ID é obrigatório' }, { status: 400 });
    }

    const validId = ensureValidUuid(id);

    // 1. EXCLUSÃO MANDATÓRIA NO SUPABASE
    if (isSupabaseConfigured && supabase && !isTestIsolationActive()) {
      await supabase.from('copy_destinations').delete().eq('source_id', validId);
      const { error: sbErr } = await supabase.from('copy_sources').delete().eq('id', validId);
      if (sbErr) {
        return NextResponse.json(
          {
            ok: false,
            error: `Falha ao excluir regra no Supabase: ${sbErr.message}`,
            code: 'SUPABASE_DELETE_ERROR',
          },
          { status: 500 }
        );
      }
    }

    // 2. EXCLUSÃO LOCAL
    const db = readDatabase();
    db.sources = db.sources.filter((s) => s.id !== id);
    db.destinations = db.destinations.filter((d) => d.sourceId !== id);
    writeDatabase(db);

    return NextResponse.json({ ok: true, deletedId: id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
