import { NextRequest, NextResponse } from 'next/server';
import { readDatabase, getActiveEvolutionConfig } from '@/lib/server/storage';
import { getSystemReadiness } from '@/lib/server/readiness';
import { WhatsAppGroup } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const db = readDatabase();
    const config = getActiveEvolutionConfig(db.whatsapp);
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Mapa de grupos por JID para resolver nomes oficiais
    const groupsMap = new Map<string, WhatsAppGroup>();
    (db.groups || []).forEach((g) => groupsMap.set(g.groupJid, g));

    // 1. ESTADO REAL DA CONEXÃO WHATSAPP
    // Exigência estrita: só mostrar "Conectado agora" após consulta recente (< 3 min) e bem-sucedida à Evolution
    let realConnectionState: 'connected_now' | 'last_known_connection' | 'unreachable' | 'disconnected' = 'disconnected';
    let realConnectionLabel = 'Desconectado';

    const lastPingTime = db.whatsapp.lastPingAt ? new Date(db.whatsapp.lastPingAt).getTime() : 0;
    const isPingRecent = lastPingTime > 0 && now.getTime() - lastPingTime < 3 * 60 * 1000;
    const hasConfirmedPing = Boolean(db.whatsapp.lastPingAt);
    const isVerificationTimeout =
      db.whatsapp.lastVerificationStatus === 'timeout' ||
      db.whatsapp.lastVerificationStatus === 'unreachable';

    if (db.whatsapp.status === 'connected' && db.whatsapp.lastVerificationStatus === 'verified' && isPingRecent) {
      realConnectionState = 'connected_now';
      realConnectionLabel = 'Conectado agora';
    } else if (db.whatsapp.status === 'connected' && hasConfirmedPing) {
      realConnectionState = 'last_known_connection';
      realConnectionLabel = `Última conexão conhecida (${new Date(db.whatsapp.lastPingAt!).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })})`;
    } else if (isVerificationTimeout) {
      realConnectionState = 'unreachable';
      realConnectionLabel = 'Não foi possível verificar agora';
    } else if (db.whatsapp.status === 'connecting') {
      realConnectionState = 'unreachable';
      realConnectionLabel = 'Conectando ao WhatsApp...';
    } else {
      realConnectionState = 'disconnected';
      realConnectionLabel = 'Desconectado';
    }

    // 2. ESTADO DO RECEBIMENTO DE MENSAGENS (SEPARANDO REAIS DE SIMULADAS)
    const allMessages = [...db.incomingMessages].sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );
    const realMessages = allMessages.filter((m) => !m.isSimulation);
    const simulatedMessages = allMessages.filter((m) => Boolean(m.isSimulation));

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

    // 3. ESTADO DO PROCESSAMENTO DA FILA E CICLO REAL DO WORKER
    // Um trabalho agendado NÃO significa que o worker está processando
    const scheduledJobs = db.jobs.filter((j) => j.status === 'agendado');
    const pendingReviewJobs = db.jobs.filter(
      (j) => j.status === 'aguardando_aprovacao' || j.status === 'rascunho'
    );
    const sendingJobs = db.jobs.filter((j) => j.status === 'enviando');
    const todaySentJobs = db.jobs.filter(
      (j) => j.status === 'enviado' && j.sentAt && j.sentAt.startsWith(todayStr)
    );
    const failedJobs = db.jobs.filter((j) => j.status === 'falha');

    // Último ciclo real do worker
    const lastWorkerCycleTime = db.whatsapp.lastWorkerCycleAt
      ? new Date(db.whatsapp.lastWorkerCycleAt).getTime()
      : 0;
    const isWorkerActiveRecently =
      lastWorkerCycleTime > 0 && now.getTime() - lastWorkerCycleTime < 3 * 60 * 1000;

    // Último processamento realizado (enviado, falha ou processado)
    const processedJobs = [...db.jobs]
      .filter((j) => j.status === 'enviado' || j.status === 'falha')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const latestProcessedJob = processedJobs[0] || null;

    let queueStatus: 'processando' | 'aguardando_aprovacao' | 'ociosa' | 'parada' = 'ociosa';
    if (sendingJobs.length > 0) {
      queueStatus = 'processando';
    } else if (scheduledJobs.length > 0) {
      // Se há jobs agendados, só está processando se o worker estiver ativo e em ciclo recente
      queueStatus = isWorkerActiveRecently ? 'processando' : 'parada';
    } else if (pendingReviewJobs.length > 0) {
      queueStatus = 'aguardando_aprovacao';
    } else {
      queueStatus = 'ociosa';
    }

    // 4. ESTADO DE CADA FLUXO (REGRA)
    // NUNCA chamar uma regra de ativa só porque existe no banco!
    // Estados possíveis: "Pausado", "Aguardando mensagens", "Processando", "Aguardando aprovação", "Erro"
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

      // Jobs vinculados a essa regra
      const rulePendingJobs = db.jobs.filter((j) => j.sourceId === source.id);
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
        // Regra ativa aguardando mensagens chegarem via webhook
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

    // 5. RESUMO PERMANENTE OPERACIONAL
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
      const latestSentJob = [...db.jobs]
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

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      summary: activeSummary,
      connection: {
        state: realConnectionState,
        label: realConnectionLabel,
        status: db.whatsapp.status,
        lastPingAt: db.whatsapp.lastPingAt || null,
        isPingRecent,
        lastVerificationStatus: db.whatsapp.lastVerificationStatus || 'unverified',
        concreteError: db.whatsapp.lastVerificationError || null,
        instanceName: config.instanceName || db.whatsapp.instanceName,
        phoneNumber: db.whatsapp.phoneNumber,
        profileName: db.whatsapp.profileName,
        batteryLevel: db.whatsapp.batteryLevel,
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
      // Compatibilidade retroativa com a página inicial do Dashboard
      waHealth: {
        status: db.whatsapp.status,
        instanceName: config.instanceName || db.whatsapp.instanceName || 'Radar de Ofertas',
        phoneNumber: db.whatsapp.phoneNumber || '',
        batteryLevel: db.whatsapp.batteryLevel ?? 94,
        profileName: db.whatsapp.profileName || 'Radar de Ofertas Oficial',
      },
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
