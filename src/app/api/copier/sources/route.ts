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
      templateName,
      is24Hours = false,
      dispatchOrder = 'sequencial',
      customTemplates,
      imageMode = 'cenario_automatico',
      imageFailureFallback = 'usar_foto_oficial',
      brandWatermarkHandle = '@radar.ofertas.br1',
      brandWatermarkEnabled = true,
      startTime = '08:00',
      endTime = '22:00',
      convertAffiliateLinks = true,
      destinationJids,
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

    // CORREÇÃO P1: Transição de pausa sem payload completo
    // Quando a ação é apenas pausar (isActive === false e saveOnly !== true),
    // preserva 100% das configurações anteriores e não toca nos destinos existentes!
    const isPausingOnly = body.isActive === false && !!savedSource && body.saveOnly !== true;
    if (isPausingOnly) {
      const now = new Date().toISOString();
      const pausedSource: CopySource = {
        ...savedSource,
        isActive: false,
        updatedAt: now,
      };

      if (isSupabaseConfigured && supabase && !isTestIsolationActive()) {
        const { error: sbSourceErr } = await supabase.from('copy_sources').update({
          is_active: false,
          updated_at: now,
          configuration: { ...savedSource, isActive: false, updatedAt: now },
        }).eq('id', savedSource.id);

        if (sbSourceErr) {
          return NextResponse.json(
            { ok: false, error: `Falha ao pausar regra no Supabase: ${sbSourceErr.message}`, code: 'SUPABASE_SOURCE_ERROR' },
            { status: 500 }
          );
        }
      }

      const existingIdx = db.sources.findIndex(s => s.id === savedSource.id || (s.groupJid === savedSource.groupJid && s.userId === session.userId));
      if (existingIdx >= 0) {
        db.sources[existingIdx] = pausedSource;
      }
      writeDatabase(db);

      return NextResponse.json({
        ok: true,
        message: 'Regra de origem pausada com sucesso.',
        source: pausedSource,
      });
    }

    // RESTRIÇÃO OBRIGATÓRIA: O Copiador só pode ser editado quando pausado.
    // Enquanto estiver ativo, permite apenas requisições que estejam pausando a regra (isActive === false).
    if (savedSource && savedSource.isActive && body.isActive !== false) {
      const isConfigChange =
        (body.customDelaySeconds !== undefined && Number(body.customDelaySeconds) !== savedSource.customDelaySeconds) ||
        (body.startTime !== undefined && body.startTime !== savedSource.startTime) ||
        (body.endTime !== undefined && body.endTime !== savedSource.endTime) ||
        (body.is24Hours !== undefined && Boolean(body.is24Hours) !== Boolean(savedSource.is24Hours)) ||
        (body.dispatchOrder !== undefined && body.dispatchOrder !== (savedSource.dispatchOrder || 'sequencial')) ||
        (body.templateText !== undefined && body.templateText !== (savedSource.templateText || '')) ||
        (body.templateName !== undefined && body.templateName !== (savedSource.templateName || '')) ||
        (body.imageMode !== undefined && body.imageMode !== (savedSource.imageMode || 'cenario_automatico')) ||
        (body.imageFailureFallback !== undefined && body.imageFailureFallback !== (savedSource.imageFailureFallback || 'usar_foto_oficial')) ||
        (body.brandWatermarkHandle !== undefined && body.brandWatermarkHandle !== (savedSource.brandWatermarkHandle || '@radar.ofertas.br1')) ||
        (body.brandWatermarkEnabled !== undefined && Boolean(body.brandWatermarkEnabled) !== (savedSource.brandWatermarkEnabled !== false)) ||
        (body.operationMode !== undefined && body.operationMode !== savedSource.operationMode);

      if (isConfigChange) {
        return NextResponse.json({
          ok: false,
          error: 'O copiador só pode ser editado quando estiver pausado. Pause o copiador antes de alterar suas configurações.',
          code: 'COPIER_ACTIVE_READONLY',
        }, { status: 400 });
      }
    }

    // Validação do Template de Mensagem: deve conter {link}
    if (templateText && typeof templateText === 'string') {
      if (!templateText.includes('{link}')) {
        return NextResponse.json({
          ok: false,
          error: 'O template de mensagem deve incluir a variável {link} para que a oferta seja publicada com seu link de afiliado validado.',
          code: 'TEMPLATE_MISSING_LINK',
        }, { status: 400 });
      }
    }

    const effectiveIs24Hours = Boolean(is24Hours) || (startTime === '00:00' && (endTime === '00:00' || endTime === '23:59'));
    const effectiveStartTime = effectiveIs24Hours ? '00:00' : (startTime || '08:00');
    const effectiveEndTime = effectiveIs24Hours ? '00:00' : (endTime || '22:00');

    if (!/^\d{2}:\d{2}$/.test(effectiveStartTime) || !/^\d{2}:\d{2}$/.test(effectiveEndTime)) {
      return NextResponse.json({
        ok: false,
        error: 'Os horários de início e término devem estar no formato HH:mm.',
      }, { status: 400 });
    }
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

    // CORREÇÃO P1: Validação de destinos e preservação em edição parcial
    const hasExplicitDestinations = destinationJids !== undefined && Array.isArray(destinationJids);
    const existingDestinations = savedSource ? saved.destinations.filter(d => d.sourceId === savedSource.id) : [];

    if (ruleIsActive) {
      const activeDestCount = hasExplicitDestinations ? destinationJids.length : existingDestinations.length;
      if (activeDestCount === 0) {
        return NextResponse.json(
          { ok: false, error: 'Para ativar o copiador, selecione pelo menos um grupo de destino com permissão de envio.' },
          { status: 400 }
        );
      }
    }

    // Preservar configurações anteriores em edições parciais; aplicar padrões somente em novas regras
    const updatedSource: CopySource = {
      id: sourceId,
      userId: session.userId,
      connectionId: connection.id,
      groupJid,
      name: sourceName,
      operationMode: body.operationMode !== undefined ? body.operationMode : (savedSource?.operationMode || 'revisao_manual'),
      isActive: ruleIsActive,
      allowedStores: body.allowedStores !== undefined ? body.allowedStores : (savedSource?.allowedStores || allowedStores),
      stripThirdPartyLinks: body.stripThirdPartyLinks !== undefined ? Boolean(body.stripThirdPartyLinks) : (savedSource?.stripThirdPartyLinks ?? true),
      stripExternalTags: body.stripExternalTags !== undefined ? Boolean(body.stripExternalTags) : (savedSource?.stripExternalTags ?? true),
      customDelaySeconds: body.customDelaySeconds !== undefined ? Math.max(0, Number(body.customDelaySeconds) || 60) : (savedSource?.customDelaySeconds ?? 60),
      templateText: body.templateText !== undefined ? (body.templateText || undefined) : savedSource?.templateText,
      templateName: body.templateName !== undefined ? (body.templateName || undefined) : savedSource?.templateName,
      is24Hours: body.is24Hours !== undefined ? effectiveIs24Hours : (savedSource?.is24Hours ?? effectiveIs24Hours),
      dispatchOrder: body.dispatchOrder !== undefined ? (body.dispatchOrder === 'aleatoria' ? 'aleatoria' : 'sequencial') : (savedSource?.dispatchOrder || 'sequencial'),
      customTemplates: body.customTemplates !== undefined ? (Array.isArray(body.customTemplates) ? body.customTemplates : undefined) : savedSource?.customTemplates,
      imageMode: body.imageMode !== undefined ? body.imageMode : (savedSource?.imageMode || 'cenario_automatico'),
      imageFailureFallback: body.imageFailureFallback !== undefined ? body.imageFailureFallback : (savedSource?.imageFailureFallback || 'usar_foto_oficial'),
      brandWatermarkHandle: body.brandWatermarkHandle !== undefined ? body.brandWatermarkHandle : (savedSource?.brandWatermarkHandle || '@radar.ofertas.br1'),
      brandWatermarkEnabled: body.brandWatermarkEnabled !== undefined ? Boolean(body.brandWatermarkEnabled) : (savedSource?.brandWatermarkEnabled !== false),
      startTime: body.startTime !== undefined ? effectiveStartTime : (savedSource?.startTime || effectiveStartTime),
      endTime: body.endTime !== undefined ? effectiveEndTime : (savedSource?.endTime || effectiveEndTime),
      convertAffiliateLinks: body.convertAffiliateLinks !== undefined ? Boolean(body.convertAffiliateLinks) : (savedSource?.convertAffiliateLinks ?? true),
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

      // CORREÇÃO P1: Substituir destinos no Supabase SOMENTE quando destinationJids for enviado explicitamente
      if (hasExplicitDestinations) {
        await supabase.from('copy_destinations').delete().eq('source_id', sourceId);

        if (destinationJids.length > 0) {
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
    }

    // 2. SINCRONIZAÇÃO COM BANCO LOCAL
    if (existingIndex >= 0) {
      db.sources[existingIndex] = updatedSource;
    } else {
      db.sources.push(updatedSource);
    }

    // CORREÇÃO P1: Substituir destinos no banco local SOMENTE quando destinationJids for enviado explicitamente
    if (hasExplicitDestinations) {
      db.destinations = db.destinations.filter((d) => d.sourceId !== sourceId);

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
