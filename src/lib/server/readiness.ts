import { DatabaseSchema, readDatabase, getActiveEvolutionConfig } from './storage';
import { SystemReadiness, StoreName } from '../types';

/**
 * Diagnóstico de prontidão único e confiável do sistema.
 * Utilizado de forma consistente pelo Topo (Header), pela página de conexão e pelo Copiador.
 * NUNCA mostra "Online", "Ativo" ou "Recebendo" com base apenas em cache ou em testes simulados.
 */
export function getSystemReadiness(customDb?: DatabaseSchema): SystemReadiness {
  const db = customDb || readDatabase();
  const now = new Date();
  const config = getActiveEvolutionConfig(db.whatsapp);

  // -------------------------------------------------------------
  // 1. WHATSAPP: Verificado recentemente pelo gateway (< 3 min)
  // -------------------------------------------------------------
  const lastPingTime = db.whatsapp.lastPingAt ? new Date(db.whatsapp.lastPingAt).getTime() : 0;
  const isPingRecent = lastPingTime > 0 && now.getTime() - lastPingTime < 3 * 60 * 1000;
  const isVerificationTimeout =
    db.whatsapp.lastVerificationStatus === 'timeout' ||
    db.whatsapp.lastVerificationStatus === 'unreachable';

  let waState: SystemReadiness['whatsapp']['state'] = 'disconnected';
  let waLabel = 'WhatsApp Desconectado';
  let waErrorReason: string | undefined = undefined;

  if (db.whatsapp.status === 'connected' && db.whatsapp.lastVerificationStatus === 'verified' && isPingRecent) {
    waState = 'connected_now';
    waLabel = 'Conectado agora';
  } else if (db.whatsapp.status === 'connected' && db.whatsapp.lastPingAt) {
    waState = 'last_known';
    const pingFormatted = new Date(db.whatsapp.lastPingAt).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    waLabel = `Última conexão conhecida (${pingFormatted})`;
    waErrorReason = 'Verificação de conexão não foi realizada recentemente (< 3 min).';
  } else if (isVerificationTimeout) {
    waState = 'timeout';
    waLabel = 'Não foi possível verificar agora (timeout)';
    waErrorReason = db.whatsapp.lastVerificationError || 'O servidor da Evolution API não respondeu ao ping.';
  } else if (db.whatsapp.status === 'connecting') {
    waState = 'connecting';
    waLabel = 'Conectando ao WhatsApp...';
  } else {
    waState = 'disconnected';
    waLabel = 'WhatsApp Desconectado';
    waErrorReason = 'Nenhuma sessão conectada ou validada no gateway.';
  }

  // -------------------------------------------------------------
  // 2. WEBHOOK: URL pública HTTPS acessível pela nuvem
  // -------------------------------------------------------------
  const configuredPublicUrl = (
    process.env.PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ''
  ).trim();

  let isPublicHttps = false;
  let isLocalhostWarning = false;
  let webhookError: string | undefined = undefined;

  if (configuredPublicUrl) {
    try {
      const parsedUrl = new URL(configuredPublicUrl);
      if (parsedUrl.protocol === 'https:' && !parsedUrl.hostname.includes('localhost') && !parsedUrl.hostname.includes('127.0.0.1')) {
        isPublicHttps = true;
      } else {
        isLocalhostWarning = true;
        webhookError = `A URL configurada (${configuredPublicUrl}) é local ou HTTP. A Evolution API na nuvem requer uma URL pública HTTPS com certificado válido.`;
      }
    } catch {
      isLocalhostWarning = true;
      webhookError = `A URL pública configurada é inválida: "${configuredPublicUrl}".`;
    }
  } else {
    isLocalhostWarning = true;
    webhookError = 'Ambiente executando em localhost sem PUBLIC_APP_URL definida. A Evolution na nuvem não consegue entregar eventos para máquinas locais sem túnel HTTPS.';
  }

  // Checar última mensagem REAL da Evolution (excluindo simulações)
  const realMessages = (db.incomingMessages || []).filter((m) => !m.isSimulation);
  const latestRealMsg = realMessages.sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  )[0];

  const lastRealEventAt = latestRealMsg?.receivedAt || db.whatsapp.lastRealWebhookAt || undefined;
  const hasReceivedRealEvent = Boolean(lastRealEventAt);

  // -------------------------------------------------------------
  // 3. WORKER: Ciclo operacional e agendamento
  // -------------------------------------------------------------
  const lastWorkerCycleTime = db.whatsapp.lastWorkerCycleAt
    ? new Date(db.whatsapp.lastWorkerCycleAt).getTime()
    : 0;
  const isRecentWorkerCycle =
    lastWorkerCycleTime > 0 && now.getTime() - lastWorkerCycleTime < 5 * 60 * 1000;

  const scheduledCount = (db.jobs || []).filter((j) => j.status === 'agendado').length;

  let workerError: string | undefined = undefined;
  if (scheduledCount > 0 && !isRecentWorkerCycle) {
    workerError = `Há ${scheduledCount} trabalho(s) agendado(s), mas o worker ainda não ciclou nos últimos 5 minutos.`;
  }

  // -------------------------------------------------------------
  // 4. AFILIADOS: Lojas configuradas e validadas
  // -------------------------------------------------------------
  const storesSummary = (db.stores || []).map((s) => ({
    name: s.storeName as StoreName,
    configured: Boolean(
      (s.affiliateTag && s.affiliateTag.trim().length > 0) ||
      (s.appId && s.appId.trim().length > 0) ||
      (s.userToken && s.userToken.trim().length > 0)
    ),
    validated: Boolean(s.isValidated),
    tag: s.affiliateTag || s.appId || undefined,
  }));

  const activeStores = storesSummary.filter((s) => s.configured);
  const hasValidatedStores = activeStores.length > 0;
  let affiliateError: string | undefined = undefined;
  if (!hasValidatedStores) {
    affiliateError = 'Nenhuma loja de afiliados configurada com tag ou credencial da sua conta.';
  }

  // -------------------------------------------------------------
  // 5. FILA SEGURA: Quarentena de dados demo e links suspeitos
  // -------------------------------------------------------------
  const allJobs = db.jobs || [];
  const quarantinedJobs = allJobs.filter((j) => j.status === 'quarentena');
  const activeJobs = allJobs.filter(
    (j) => j.status === 'agendado' || j.status === 'aguardando_aprovacao'
  );

  const reasons: string[] = [];
  if (quarantinedJobs.length > 0) {
    reasons.push(`${quarantinedJobs.length} item(ns) isolado(s) em quarentena de segurança.`);
  }

  // Verificar se há itens ativos com problemas conhecidos
  const unsafeActiveJobs = activeJobs.filter((j) => {
    const isFictitiousTarget =
      j.targetJid.includes('55555555') ||
      j.targetJid.includes('88888888') ||
      j.targetJid.includes('demo');
    const isZeroPrice = j.messageText.includes('R$ 0,00') || j.messageText.includes('R$ 0.00');
    return isFictitiousTarget || isZeroPrice || j.isDemo;
  });

  if (unsafeActiveJobs.length > 0) {
    reasons.push(`${unsafeActiveJobs.length} item(ns) na fila ativa possuem destinos fictícios ou preço zerado.`);
  }

  const isQueueSafe = unsafeActiveJobs.length === 0;

  // -------------------------------------------------------------
  // CÁLCULO GERAL DO SCORE E PRONTIDÃO
  // -------------------------------------------------------------
  let points = 0;
  if (waState === 'connected_now') points += 25;
  else if (waState === 'last_known') points += 10;

  if (isPublicHttps) points += 25;
  else if (hasReceivedRealEvent) points += 10;

  if (isRecentWorkerCycle) points += 20;
  else points += 10;

  if (hasValidatedStores) points += 15;
  if (isQueueSafe) points += 15;

  const isFullyReady =
    waState === 'connected_now' &&
    isPublicHttps &&
    hasValidatedStores &&
    isQueueSafe;

  return {
    isFullyReady,
    score: Math.min(100, points),
    whatsapp: {
      state: waState,
      label: waLabel,
      isVerifiedRecent: isPingRecent,
      lastPingAt: db.whatsapp.lastPingAt || undefined,
      instanceName: config.instanceName || db.whatsapp.instanceName,
      phoneNumber: db.whatsapp.phoneNumber,
      errorReason: waErrorReason,
    },
    webhook: {
      isConfigured: Boolean(configuredPublicUrl),
      isPublicHttps,
      isLocalhostWarning,
      url: configuredPublicUrl || undefined,
      lastRealEventAt,
      lastRealMessageId: latestRealMsg?.messageId || undefined,
      hasReceivedRealEvent,
      errorReason: webhookError,
    },
    worker: {
      isOperational: true,
      lastCycleAt: db.whatsapp.lastWorkerCycleAt || undefined,
      isRecentCycle: isRecentWorkerCycle,
      scheduledCount,
      errorReason: workerError,
    },
    affiliates: {
      hasValidatedStores,
      activeCount: activeStores.length,
      stores: storesSummary,
      errorReason: affiliateError,
    },
    queue: {
      isSafe: isQueueSafe,
      totalCount: allJobs.length,
      quarantinedCount: quarantinedJobs.length,
      activeCount: activeJobs.length,
      reasons,
    },
  };
}
