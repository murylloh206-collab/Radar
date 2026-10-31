import { NextRequest, NextResponse } from 'next/server';
import { readDatabase, listWhatsAppConnections, getActiveEvolutionConfig } from '@/lib/server/storage';
import { getSystemReadiness } from '@/lib/server/readiness';
import { WhatsAppConnection, WhatsAppGroup } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const db = readDatabase();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const { searchParams } = new URL(req.url);
    const requestedConnId = searchParams.get('connectionId')?.trim();

    // 1. Conexões disponíveis e conexão ativa
    const connections = listWhatsAppConnections();
    let activeConn: WhatsAppConnection | undefined;

    if (requestedConnId) {
      activeConn = connections.find((c) => c.id === requestedConnId);
    }
    if (!activeConn) {
      activeConn = connections.find((c) => c.isDefault) || connections[0];
    }

    // Se ainda não houver conexões na lista, usa fallback de db.whatsapp
    const connState = activeConn || {
      id: 'default',
      userId: 'default_user',
      instanceName: db.whatsapp.instanceName || 'radar_default',
      label: 'WhatsApp Principal',
      status: db.whatsapp.status,
      phoneNumber: db.whatsapp.phoneNumber,
      profileName: db.whatsapp.profileName,
      profilePicUrl: (db.whatsapp as any).profilePicUrl,
      ownerJid: db.whatsapp.ownerJid,
      lastPingAt: db.whatsapp.lastPingAt,
      lastVerificationStatus: db.whatsapp.lastVerificationStatus,
      lastVerificationError: db.whatsapp.lastVerificationError,
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const config = getActiveEvolutionConfig(connState as any);

    // Mapa de grupos por JID para resolver nomes oficiais
    const groupsMap = new Map<string, WhatsAppGroup>();
    (db.groups || []).forEach((g) => groupsMap.set(g.groupJid, g));

    // 2. Estado real da Conexão WhatsApp
    let realConnectionState: 'connected_now' | 'last_known_connection' | 'unreachable' | 'disconnected' = 'disconnected';
    let realConnectionLabel = 'Desconectado';

    const lastPingTime = connState.lastPingAt ? new Date(connState.lastPingAt).getTime() : 0;
    const isPingRecent = lastPingTime > 0 && now.getTime() - lastPingTime < 3 * 60 * 1000;
    const hasConfirmedPing = Boolean(connState.lastPingAt);
    const isVerificationTimeout =
      connState.lastVerificationStatus === 'timeout' ||
      connState.lastVerificationStatus === 'unreachable';

    if (connState.status === 'connected' && connState.lastVerificationStatus === 'verified' && isPingRecent) {
      realConnectionState = 'connected_now';
      realConnectionLabel = 'Conectado agora';
    } else if (connState.status === 'connected' && hasConfirmedPing) {
      realConnectionState = 'last_known_connection';
      realConnectionLabel = `Última conexão conhecida (${new Date(connState.lastPingAt!).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })})`;
    } else if (isVerificationTimeout) {
      realConnectionState = 'unreachable';
      realConnectionLabel = 'Não foi possível verificar agora';
    } else if (connState.status === 'connecting' || connState.status === 'qrcode') {
      realConnectionState = 'unreachable';
      realConnectionLabel = 'Aguardando pareamento...';
    } else {
      realConnectionState = 'disconnected';
      realConnectionLabel = 'Desconectado';
    }

    // 3. Estado do Recebimento de Mensagens
    const allMessages = [...db.incomingMessages].sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );
    // Filtrar mensagens pertencentes a esta conexão se houver connectionId
    const connMessages = activeConn?.id
      ? allMessages.filter((m) => !m.connectionId || m.connectionId === activeConn?.id)
      : allMessages;

    const realMessages = connMessages.filter((m) => !m.isSimulation);
    const simulatedMessages = connMessages.filter((m) => Boolean(m.isSimulation));

    const todayRealMessages = realMessages.filter((m) => m.receivedAt.startsWith(todayStr));
    const todaySimulatedMessages = simulatedMessages.filter((m) => m.receivedAt.startsWith(todayStr));
    const latestRealMessage = realMessages[0] || null;

    let receivingStatus: 'ativo' | 'aguardando' | 'inativo' = 'inativo';
    if (latestRealMessage) {
      const msSinceLast = now.getTime() - new Date(latestRealMessage.receivedAt).getTime();
      const hoursSinceLast = msSinceLast / (1000 * 60 * 60);
      if (hoursSinceLast <= 3) {
        receivingStatus = 'ativo';
      } else {
        receivingStatus = 'aguardando';
      }
    } else {
      receivingStatus = 'inativo';
    }

    // 4. Estado do Processamento da Fila e Envio
    const connJobs = activeConn?.id
      ? db.jobs.filter((j) => !j.connectionId || j.connectionId === activeConn?.id)
      : db.jobs;

    const scheduledJobs = connJobs.filter((j) => j.status === 'agendado');
    const pendingReviewJobs = connJobs.filter(
      (j) => j.status === 'aguardando_aprovacao' || j.status === 'rascunho'
    );
    const sendingJobs = connJobs.filter((j) => j.status === 'enviando');
    const todaySentJobs = connJobs.filter(
      (j) => j.status === 'enviado' && j.sentAt && j.sentAt.startsWith(todayStr)
    );
    const failedJobs = connJobs.filter((j) => j.status === 'falha');

    // Último ciclo do worker
    const lastWorkerCycleTime = db.whatsapp.lastWorkerCycleAt
      ? new Date(db.whatsapp.lastWorkerCycleAt).getTime()
      : 0;
    const isWorkerActiveRecently =
      lastWorkerCycleTime > 0 && now.getTime() - lastWorkerCycleTime < 5 * 60 * 1000;

    // Último processamento realizado (enviado, falha ou processado)
    const processedJobs = [...connJobs]
      .filter((j) => j.status === 'enviado' || j.status === 'falha')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const latestProcessedJob = processedJobs[0] || null;

    let queueStatus: 'processando' | 'aguardando_aprovacao' | 'ociosa' | 'parada' = 'ociosa';
    if (sendingJobs.length > 0) {
      queueStatus = 'processando';
    } else if (scheduledJobs.length > 0) {
      queueStatus = isWorkerActiveRecently ? 'processando' : 'parada';
    } else if (pendingReviewJobs.length > 0) {
      queueStatus = 'aguardando_aprovacao';
    } else {
      queueStatus = 'ociosa';
    }

    // 5. Estado dos Fluxos / Regras
    const flows = (db.sources || []).map((source) => {
      const originGroup = groupsMap.get(source.groupJid);
      const originName = originGroup?.name || source.name || 'Origem não identificada';

      const ruleDestinations = (db.destinations || [])
        .filter((d) => d.sourceId === source.id && d.isActive)
        .map((d) => {
          const destGroup = groupsMap.get(d.groupJid);
          return {
            groupJid: d.groupJid,
            name: destGroup?.name || d.name || d.groupJid,
            canPost: destGroup ? destGroup.canPost !== false : true,
          };
        });

      const destNamesStr =
        ruleDestinations.length > 0
          ? ruleDestinations.map((d) => d.name).join(', ')
          : 'Nenhum destino configurado';

      const flowLabel = `Copiar de ${originName} → Enviar para ${destNamesStr}`;

      const rulePendingJobs = connJobs.filter((j) => j.sourceId === source.id);
      const hasSending = rulePendingJobs.some((j) => j.status === 'enviando' || j.status === 'agendado');
      const hasAwaitingApproval = rulePendingJobs.some((j) => j.status === 'aguardando_aprovacao');

      let state: 'Pausado' | 'Aguardando mensagens' | 'Processando' | 'Aguardando aprovação' | 'Erro' = 'Aguardando mensagens';
      let errorReason: string | undefined = undefined;

      if (!source.isActive) {
        state = 'Pausado';
      } else if (ruleDestinations.length === 0) {
        state = 'Erro';
        errorReason = 'Nenhum grupo de destino configurado ou ativo.';
      } else if (hasSending) {
        state = 'Processando';
      } else if (hasAwaitingApproval) {
        state = 'Aguardando aprovação';
      } else {
        state = 'Aguardando mensagens';
      }

      const ruleTodayMessagesCount = todayRealMessages.filter(
        (m) => m.remoteJid === source.groupJid
      ).length;

      return {
        id: source.id,
        name: source.name,
        originGroupJid: source.groupJid,
        originGroupName: originName,
        destinations: ruleDestinations,
        flowLabel,
        operationMode: source.operationMode || 'revisao_manual',
        state,
        isActive: Boolean(source.isActive),
        errorReason,
        customDelaySeconds: source.customDelaySeconds || 60,
        todayMessagesCount: ruleTodayMessagesCount,
        updatedAt: source.updatedAt,
      };
    });

    // 6. Resumo Operacional Principal
    const primaryRule = (db.sources || []).find((s) => s.isActive) || (db.sources || [])[0] || null;
    let activeSummary: {
      hasRule: boolean;
      ruleId?: string;
      originJid?: string;
      originName: string;
      destinationNames: string[];
      destinationJids: string[];
      operationMode: 'revisao_manual' | 'automatico';
      state: 'ativo' | 'pausado' | 'aguardando_mensagens' | 'erro';
      stateLabel: string;
      isActive: boolean;
      latestOffer?: {
        receivedAt: string;
        textSnippet: string;
        store?: string;
        status: string;
      };
      latestPublication?: {
        sentAt: string;
        targetName: string;
        status: string;
      };
      blockReason?: string;
    } | null = null;

    if (primaryRule) {
      const origGroup = groupsMap.get(primaryRule.groupJid);
      const origName = origGroup?.name || primaryRule.name || 'Origem não definida';
      const destList = (db.destinations || []).filter((d) => d.sourceId === primaryRule.id && d.isActive);
      const destNames = destList.map((d) => groupsMap.get(d.groupJid)?.name || d.name);
      const destJids = destList.map((d) => d.groupJid);

      const latestOfferMsg = realMessages.find((m) => m.remoteJid === primaryRule.groupJid) || realMessages[0] || null;
      const latestSentJob = [...connJobs]
        .filter((j) => (j.status === 'enviado' || j.status === 'agendado') && (!primaryRule || j.sourceId === primaryRule.id))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] || null;

      let blockReason: string | undefined = undefined;
      let state: 'ativo' | 'pausado' | 'aguardando_mensagens' | 'erro' = 'aguardando_mensagens';
      let stateLabel = 'Aguardando mensagens';

      if (!primaryRule.isActive) {
        state = 'pausado';
        stateLabel = 'Pausado';
        blockReason = 'Copiador pausado pelo usuário.';
      } else if (destNames.length === 0) {
        state = 'erro';
        stateLabel = 'Com pendência';
        blockReason = 'Nenhum grupo de destino configurado ou com permissão de envio.';
      } else {
        const invalidDests = destList.filter((d) => {
          const grpObj = (db.groups || []).find((g) => g.groupJid === d.groupJid);
          return grpObj?.canPost === false || grpObj?.permissionStatus === 'restricted_readonly';
        });

        if (invalidDests.length > 0 && invalidDests.length === destNames.length) {
          state = 'erro';
          stateLabel = 'Envio bloqueado';
          blockReason = 'Grupo de destino restrito a administradores. A conta não tem permissão para enviar.';
        } else {
          state = receivingStatus === 'ativo' ? 'ativo' : 'aguardando_mensagens';
          stateLabel = state === 'ativo' ? 'Ativo (Monitorando)' : 'Aguardando mensagens';
        }
      }

      activeSummary = {
        hasRule: true,
        ruleId: primaryRule.id,
        originJid: primaryRule.groupJid,
        originName: origName,
        destinationNames: destNames,
        destinationJids: destJids,
        operationMode: primaryRule.operationMode || 'revisao_manual',
        state,
        stateLabel,
        isActive: Boolean(primaryRule.isActive),
        latestOffer: latestOfferMsg
          ? {
              receivedAt: latestOfferMsg.receivedAt,
              textSnippet: latestOfferMsg.cleanText || latestOfferMsg.rawText.substring(0, 80),
              store: latestOfferMsg.extractedStore,
              status: latestOfferMsg.status,
            }
          : undefined,
        latestPublication: latestSentJob
          ? {
              sentAt: latestSentJob.sentAt || latestSentJob.updatedAt,
              targetName: latestSentJob.targetName || 'Grupo Destino',
              status: latestSentJob.status,
            }
          : undefined,
        blockReason,
      };
    }

    // 7. Histórico de Atividade Detalhada (Últimos 50 eventos com motivo de descarte/bloqueio)
    const activityItems = [
      ...connMessages.slice(0, 40).map((m) => {
        const origGroup = groupsMap.get(m.remoteJid);
        return {
          id: `msg_${m.id}`,
          type: 'recebimento' as const,
          timestamp: m.receivedAt,
          title: origGroup?.name ? `Mensagem de ${origGroup.name}` : 'Oferta detectada',
          detail: m.cleanText || m.rawText.substring(0, 100),
          status: m.status, // recebido, processado, ignorado, bloqueado
          reason: m.discardReason || (m.extractedUrls?.length === 0 ? 'Sem link identificado na mensagem' : undefined),
          store: m.extractedStore,
          groupName: origGroup?.name || m.remoteJid,
        };
      }),
      ...connJobs.slice(0, 40).map((j) => {
        return {
          id: `job_${j.id}`,
          type: 'envio' as const,
          timestamp: j.sentAt || j.updatedAt || j.scheduledFor,
          title: `Publicação em ${j.targetName || 'Grupo Destino'}`,
          detail: (j.messageText || '').substring(0, 100),
          status: j.status, // rascunho, aguardando_aprovacao, agendado, enviando, enviado, falha, bloqueado
          reason: j.errorDetails || j.quarantineReason || (j.linkVerified ? undefined : 'Link de afiliado em validação'),
          store: undefined,
          groupName: j.targetName || 'Grupo de Envio',
        };
      }),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50);

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      summary: activeSummary,
      activeConnection: {
        id: connState.id,
        label: (connState as any).label || 'WhatsApp Principal',
        state: realConnectionState,
        statusLabel: realConnectionLabel,
        status: connState.status,
        lastPingAt: connState.lastPingAt || null,
        isPingRecent,
        lastVerificationStatus: connState.lastVerificationStatus || 'unverified',
        concreteError: connState.lastVerificationError || null,
        instanceName: config.instanceName || connState.instanceName,
        phoneNumber: connState.phoneNumber,
        profileName: connState.profileName,
        profilePicUrl: (connState as any).profilePicUrl,
        ownerJid: connState.ownerJid,
        isDefault: (connState as any).isDefault ?? true,
      },
      connections: connections.map((c) => ({
        id: c.id,
        label: c.label,
        phoneNumber: c.phoneNumber,
        profileName: c.profileName,
        profilePicUrl: c.profilePicUrl,
        status: c.status,
        isDefault: c.isDefault,
        lastPingAt: c.lastPingAt,
      })),
      connection: {
        state: realConnectionState,
        label: realConnectionLabel,
        status: connState.status,
        lastPingAt: connState.lastPingAt || null,
        isPingRecent,
        lastVerificationStatus: connState.lastVerificationStatus || 'unverified',
        concreteError: connState.lastVerificationError || null,
        instanceName: config.instanceName || connState.instanceName,
        phoneNumber: connState.phoneNumber,
        profileName: connState.profileName,
        batteryLevel: (connState as any).batteryLevel,
      },
      receiving: {
        status: receivingStatus,
        lastMessageReceivedAt: latestRealMessage ? latestRealMessage.receivedAt : null,
        lastRealWebhookAt: db.whatsapp.lastRealWebhookAt || null,
        lastWebhookReceivedAt: db.whatsapp.lastWebhookReceivedAt || null,
        todayCount: todayRealMessages.length,
        simulatedCount: todaySimulatedMessages.length,
        totalCount: realMessages.length,
        totalSimulatedCount: simulatedMessages.length,
      },
      queue: {
        status: queueStatus,
        isWorkerActive: isWorkerActiveRecently,
        lastWorkerCycleAt: db.whatsapp.lastWorkerCycleAt || null,
        lastProcessedAt: latestProcessedJob ? latestProcessedJob.updatedAt : null,
        scheduledCount: scheduledJobs.length,
        pendingReviewCount: pendingReviewJobs.length,
        sentTodayCount: todaySentJobs.length,
        failedCount: failedJobs.length,
        nextSendAt: scheduledJobs[0]?.scheduledFor || null,
      },
      flows,
      activity: activityItems,
      webhookDiagnosis: {
        endpoint: '/api/webhook/evolution',
        hasSecret: Boolean(process.env.EVOLUTION_WEBHOOK_SECRET || db.whatsapp.webhookSecret),
        lastRealWebhookAt: db.whatsapp.lastRealWebhookAt || null,
        lastEventAt: db.whatsapp.lastWebhookReceivedAt || null,
      },
      readiness: getSystemReadiness(db),
      workerConfigured: true,
      workerReason: undefined,
      settings: db.settings,
      stats: {
        offersToday: todayRealMessages.length,
        sentToday: todaySentJobs.length,
        pendingReview: pendingReviewJobs.length,
        scheduledJobs: scheduledJobs.length,
        failedJobs: failedJobs.length,
        successRatePct:
          todaySentJobs.length + failedJobs.length > 0
            ? Math.round((todaySentJobs.length / (todaySentJobs.length + failedJobs.length)) * 100)
            : 100,
      },
      nextJob: scheduledJobs[0]
        ? {
            id: scheduledJobs[0].id,
            targetName: scheduledJobs[0].targetName,
            scheduledFor: scheduledJobs[0].scheduledFor,
          }
        : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
