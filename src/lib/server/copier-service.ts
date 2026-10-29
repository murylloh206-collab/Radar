import {
  CopySource,
  IncomingMessage,
  ProductItem,
  PublicationJob,
  StoreCredential,
  StoreName,
} from '../types';
import { convertToAffiliateLink } from './affiliate-converter';
import { getStoreCredentialsMapWithSecrets } from './credentials-vault';
import { buildWhatsAppMessage, sanitizeCopiedText } from './message-builder';
import { evaluateOfferQuality } from './quality-engine';
import {
  readDatabase,
  writeDatabase,
  ensureValidUuid,
  savePublicationJob,
  saveProductToCatalog,
  saveOfferEvaluation,
  saveIncomingMessageRecord,
} from './storage';
import { fetchProductRealData } from './product-fetcher';
import { processRadarArt } from './radar-art-engine';

export interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
      id?: string;
      participant?: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: {
        text?: string;
      };
      imageMessage?: {
        caption?: string;
        url?: string;
      };
    };
  };
}

export interface CopierProcessResult {
  accepted: boolean;
  messageId: string;
  status: 'recebida' | 'processada' | 'descartada' | 'erro';
  reason: string;
  jobIds?: string[];
}

export function extractWhatsAppMessageText(messageData: Record<string, any> | undefined): string {
  if (!messageData) return '';
  // Desempacotar mensagens efêmeras, de visualização única ou com legendas
  const innerMsg =
    messageData.ephemeralMessage?.message ||
    messageData.viewOnceMessage?.message ||
    messageData.viewOnceMessageV2?.message ||
    messageData.documentWithCaptionMessage?.message ||
    messageData;

  const text =
    innerMsg?.conversation ||
    innerMsg?.extendedTextMessage?.text ||
    innerMsg?.imageMessage?.caption ||
    innerMsg?.videoMessage?.caption ||
    innerMsg?.documentMessage?.caption ||
    innerMsg?.buttonsResponseMessage?.selectedDisplayText ||
    innerMsg?.templateButtonReplyMessage?.selectedDisplayText ||
    innerMsg?.listResponseMessage?.title ||
    '';

  return String(text || '').trim();
}

export function extractUrlsFromText(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const matches = text.match(urlRegex) || [];
  return Array.from(new Set(matches));
}

export interface ProcessIncomingOptions {
  isSimulation?: boolean;
}

/**
 * Processa mensagens recebidas pelo Webhook da Evolution API
 */
export async function processIncomingMessage(
  payload: EvolutionWebhookPayload,
  options?: ProcessIncomingOptions
): Promise<CopierProcessResult> {
  const isSimulation = Boolean(options?.isSimulation);
  const db = readDatabase();
  const rawItem = Array.isArray((payload as any).data)
    ? (payload as any).data[0]
    : ((payload as any).data || payload);
  const data = (rawItem as Record<string, any>) || {};
  const instanceName =
    payload.instance ||
    (payload as any).instanceName ||
    data.instanceName ||
    db.whatsapp.instanceName ||
    'default';
  const key = (data.key || (payload as any).key) as
    | { remoteJid?: string; fromMe?: boolean; id?: string; participant?: string }
    | undefined;

  if (!key) {
    return {
      accepted: false,
      messageId: 'unknown',
      status: 'descartada',
      reason: 'Payload sem dados de chave da mensagem',
    };
  }

  const messageId = key.id || `msg_${Date.now()}`;
  const remoteJid = String(key.remoteJid || '').trim();
  const senderJid = key.participant;
  const senderName = data.pushName;
  const messageData = data.message || (payload as any).message;
  const rawText = extractWhatsAppMessageText(messageData);

  // Ignorar mensagens enviadas pela própria conta quando necessário para evitar ciclos:
  // a) se vier de um grupo configurado como destino ativo, ou
  // b) se o texto já contiver a assinatura/marca d'água do próprio Copiador.
  if (key.fromMe) {
    const isFromDestinationGroup = (db.destinations || []).some(
      (d) => d.isActive && d.groupJid.trim().toLowerCase() === remoteJid.toLowerCase()
    );
    const watermark = (db.settings?.watermarkText || '').trim();
    const hasOwnWatermark =
      (watermark.length > 0 && rawText.includes(watermark)) ||
      rawText.includes('Compre aqui com segurança:') ||
      rawText.includes('[ENVIO BLOQUEADO:');

    if (isFromDestinationGroup || hasOwnWatermark) {
      return {
        accepted: false,
        messageId,
        status: 'descartada',
        reason: 'Mensagem enviada pela própria conta em grupo de destino ou com assinatura do Copiador (anti-loop).',
      };
    }
  }

  // 1. Localizar se o grupo pertence a alguma regra cadastrada
  const matchingSource = db.sources.find(
    (src) => src.groupJid.trim().toLowerCase() === remoteJid.toLowerCase()
  );

  if (!matchingSource) {
    return {
      accepted: false,
      messageId,
      status: 'descartada',
      reason: `Grupo de origem não cadastrado no Copiador: ${remoteJid}`,
    };
  }

  // 1.1 Se a regra existir mas estiver PAUSADA pelo usuário
  if (!matchingSource.isActive) {
    const pausedRecord: IncomingMessage = {
      id: ensureValidUuid(),
      userId: matchingSource.userId,
      messageId,
      instanceName,
      remoteJid,
      senderJid,
      senderName,
      rawText: String(rawText || 'Mensagem recebida com regra pausada'),
      extractedUrls: extractUrlsFromText(String(rawText || '')),
      cleanText: sanitizeCopiedText(String(rawText || '')),
      status: 'descartada',
      discardReason: `Regra de cópia "${matchingSource.name}" pausada pelo usuário.`,
      isSimulation,
      receivedAt: new Date().toISOString(),
    };

    await saveIncomingMessageRecord(pausedRecord);

    return {
      accepted: false,
      messageId,
      status: 'descartada',
      reason: `Regra "${matchingSource.name}" está pausada pelo usuário. Processamento e envios suspensos.`,
    };
  }

  const authorizedSource = matchingSource;

  // 2. Idempotência: verificar se já processamos esta mensagem
  const alreadyProcessed = db.incomingMessages.some(
    (m) => m.instanceName === instanceName && m.messageId === messageId
  );

  if (alreadyProcessed) {
    return {
      accepted: false,
      messageId,
      status: 'descartada',
      reason: 'Mensagem duplicada já recebida e processada anteriormente.',
    };
  }

  if (!rawText.trim()) {
    return {
      accepted: false,
      messageId,
      status: 'descartada',
      reason: 'Mensagem sem conteúdo textual legível.',
    };
  }

  const extractedUrls = extractUrlsFromText(rawText);
  if (extractedUrls.length === 0) {
    const incomingRecord: IncomingMessage = {
      id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: authorizedSource.userId,
      messageId,
      instanceName,
      remoteJid,
      senderJid,
      senderName,
      rawText,
      extractedUrls: [],
      cleanText: sanitizeCopiedText(rawText),
      status: 'descartada',
      discardReason: 'Mensagem não contém links de produtos ou ofertas.',
      isSimulation,
      receivedAt: new Date().toISOString(),
    };

    await saveIncomingMessageRecord(incomingRecord);

    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: 'Mensagem não continha links de produtos.',
    };
  }

  // Usar o primeiro link encontrado
  const primaryUrl = extractedUrls[0];

  // Organizar credenciais por loja (incluindo segredos descriptografados do cofre)
  const credentialsMap = await getStoreCredentialsMapWithSecrets(
    authorizedSource.userId,
    db.stores
  );

  // 3. Converter para link de afiliado oficial
  const conversionResult = await convertToAffiliateLink(primaryUrl, credentialsMap);

  if (!conversionResult.store) {
    const discardReason = `Falha na conversão de link próprio: ${conversionResult.error || 'Loja não suportada ou domínio não reconhecido.'}`;

    const incomingRecord: IncomingMessage = {
      id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: authorizedSource.userId,
      messageId,
      instanceName,
      remoteJid,
      senderJid,
      senderName,
      rawText,
      extractedUrls,
      cleanText: sanitizeCopiedText(rawText),
      status: 'descartada',
      discardReason,
      isSimulation,
      receivedAt: new Date().toISOString(),
    };

    await saveIncomingMessageRecord(incomingRecord);

    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: discardReason,
      jobIds: [],
    };
  }

  // 3.1 Verificar se a loja é permitida nesta origem
  if (!authorizedSource.allowedStores.includes(conversionResult.store)) {
    const discardReason = `Loja ${conversionResult.store.toUpperCase()} não está na lista de permitidas desta origem.`;
    const incomingRecord: IncomingMessage = {
      id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: authorizedSource.userId,
      messageId,
      instanceName,
      remoteJid,
      senderJid,
      senderName,
      rawText,
      extractedUrls,
      cleanText: sanitizeCopiedText(rawText),
      extractedStore: conversionResult.store,
      resolvedDestinationUrl: conversionResult.cleanUrl,
      affiliateUrl: conversionResult.affiliateUrl || undefined,
      status: 'descartada',
      discardReason,
      isSimulation,
      receivedAt: new Date().toISOString(),
    };
    await saveIncomingMessageRecord(incomingRecord);
    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: discardReason,
      jobIds: [],
    };
  }

  // 3.2 Se a conversão do link próprio falhou (credenciais ausentes, de exemplo ou rejeitadas pela API):
  // NUNCA reutilizar o link original do grupo de origem e NUNCA publicar.
  // Em modo de revisão manual, registrar na fila de revisão com estado bloqueado e motivo visível.
  if (!conversionResult.success || !conversionResult.affiliateUrl) {
    const discardReason = `Oferta bloqueada — não foi possível confirmar link próprio de afiliado (${conversionResult.store.toUpperCase()}): ${conversionResult.error || 'Credenciais de afiliado ausentes ou inválidas.'}`;

    const incomingRecord: IncomingMessage = {
      id: ensureValidUuid(),
      userId: authorizedSource.userId,
      messageId,
      instanceName,
      remoteJid,
      senderJid,
      senderName,
      rawText,
      extractedUrls,
      cleanText: sanitizeCopiedText(rawText),
      extractedStore: conversionResult.store,
      resolvedDestinationUrl: conversionResult.cleanUrl,
      status: 'descartada',
      discardReason,
      isSimulation,
      receivedAt: new Date().toISOString(),
    };

    await saveIncomingMessageRecord(incomingRecord);

    const blockedJobIds: string[] = [];
    if (!isSimulation && authorizedSource.operationMode === 'revisao_manual') {
      const sourceDestinations = db.destinations.filter(
        (d) => d.sourceId === authorizedSource.id && d.isActive
      );
      const validDestinations = sourceDestinations.filter((dest) => {
        const group = (db.groups || []).find((g) => g.groupJid === dest.groupJid);
        if (!group) return true;
        return group.canPost !== false && group.permissionStatus !== 'restricted_readonly';
      });

      const cleanTitle = sanitizeCopiedText(rawText).split('\n')[0]?.trim() || `Oferta capturada (${conversionResult.store.toUpperCase()})`;
      for (const dest of validDestinations) {
        const blockedJob: PublicationJob = {
          id: ensureValidUuid(),
          userId: authorizedSource.userId,
          originType: 'copiador',
          sourceId: authorizedSource.id,
          incomingMessageId: incomingRecord.id,
          targetJid: dest.groupJid,
          targetName: dest.name,
          messageText: `*{titulo}*\n\n⚠️ [ENVIO BLOQUEADO: Link próprio de afiliado não confirmado para ${conversionResult.store.toUpperCase()}]`.replace('{titulo}', cleanTitle),
          mediaType: 'none',
          affiliateUrl: '', // NUNCA reutiliza o link do grupo de origem
          originalUrl: primaryUrl,
          status: 'aguardando_aprovacao',
          errorDetails: discardReason,
          scheduledFor: new Date().toISOString(),
          attempts: 0,
          maxAttempts: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await savePublicationJob(blockedJob);
        blockedJobIds.push(blockedJob.id);
      }
    }

    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: discardReason,
      jobIds: blockedJobIds,
    };
  }

  // 4. Coletar dados reais do produto (sem dados fictícios)
  const productData = await fetchProductRealData(conversionResult.cleanUrl, conversionResult.store);

  // Registrar no catálogo real
  const catalogProduct: ProductItem = {
    id: ensureValidUuid(),
    userId: authorizedSource.userId,
    storeName: conversionResult.store,
    externalId: productData.externalId,
    title: productData.title,
    originalPrice: productData.originalPrice,
    currentPrice: productData.currentPrice,
    discountPct: productData.discountPct,
    rating: productData.rating,
    reviewsCount: productData.reviewsCount,
    salesCount: productData.salesCount,
    imageUrl: productData.imageUrl,
    productUrl: conversionResult.cleanUrl,
    affiliateUrl: conversionResult.affiliateUrl,
    inStock: productData.inStock,
    lastCheckedAt: productData.fetchedAt,
  };
  await saveProductToCatalog(catalogProduct);

  // 5. Avaliar qualidade da oferta com dados reais
  const storeRule = db.rules.find((r) => r.storeName === conversionResult.store) || {
    id: ensureValidUuid(),
    userId: authorizedSource.userId,
    storeName: conversionResult.store,
    minRating: 4.5,
    minReviewsCount: 10,
    minSalesCount: 5,
    minDiscountPct: 10,
    minCommissionRate: 1.0,
    requireSocialProof: true,
    requireInStock: true,
    blockedKeywords: [],
    updatedAt: new Date().toISOString(),
  };

  const evaluation = evaluateOfferQuality({
    product: {
      userId: authorizedSource.userId,
      storeName: conversionResult.store,
      title: productData.title,
      currentPrice: productData.currentPrice,
      originalPrice: productData.originalPrice,
      discountPct: productData.discountPct,
      rating: productData.rating,
      reviewsCount: productData.reviewsCount,
      salesCount: productData.salesCount,
      inStock: productData.inStock,
    },
    rule: storeRule,
    rawText,
  });

  const cleanSnippet = sanitizeCopiedText(rawText);

  const isQualityRejected = evaluation.decision === 'rejeitado';
  const shouldDiscardAuto = isQualityRejected && authorizedSource.operationMode === 'automatico';

  const incomingRecord: IncomingMessage = {
    id: ensureValidUuid(),
    userId: authorizedSource.userId,
    messageId,
    instanceName,
    remoteJid,
    senderJid,
    senderName,
    rawText,
    extractedUrls,
    cleanText: cleanSnippet,
    extractedStore: conversionResult.store,
    resolvedDestinationUrl: conversionResult.cleanUrl,
    affiliateUrl: conversionResult.affiliateUrl,
    status: shouldDiscardAuto ? 'descartada' : 'processada',
    discardReason: shouldDiscardAuto ? evaluation.reason : undefined,
    isSimulation,
    receivedAt: new Date().toISOString(),
  };

  await saveIncomingMessageRecord(incomingRecord);
  await saveOfferEvaluation(evaluation);

  // SE FOR SIMULAÇÃO (VERIFICAÇÃO ISOLADA SEM PUBLICAR):
  // NUNCA criar publication_jobs, NUNCA alterar a fila real nem disparar worker!
  if (isSimulation) {
    return {
      accepted: true,
      messageId,
      status: shouldDiscardAuto ? 'descartada' : 'processada',
      reason: `[Verificação Isolada] Oferta ${
        isQualityRejected ? 'com observações de qualidade' : 'aprovada'
      } (Score ${evaluation.score}/100) — Loja: ${conversionResult.store?.toUpperCase()}. Link convertido e avaliado. Fila de disparos inalterada (0 trabalhos criados).`,
      jobIds: [],
    };
  }

  // Se for modo automático e foi reprovado pela qualidade, nunca gerar job automático
  if (shouldDiscardAuto) {
    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: `Oferta reprovada pelas regras de qualidade para envio automático: ${evaluation.reason}`,
      jobIds: [],
    };
  }

  // 6. Destinos associados à origem (NUNCA usar destino fictício como fallback!)
  const sourceDestinations = db.destinations.filter(
    (d) => d.sourceId === authorizedSource.id && d.isActive
  );

  if (sourceDestinations.length === 0) {
    incomingRecord.status = 'descartada';
    incomingRecord.discardReason = 'Nenhum grupo de destino configurado ou ativo para esta origem.';
    await saveIncomingMessageRecord(incomingRecord);
    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: 'Nenhum grupo de destino configurado ou ativo para esta origem.',
      jobIds: [],
    };
  }

  // Filtrar apenas destinos com permissão comprovada de postagem (regras reais do grupo)
  const validDestinations = sourceDestinations.filter((dest) => {
    const group = (db.groups || []).find((g) => g.groupJid === dest.groupJid);
    if (!group) return true; // Se não estiver em cache, mantém a verificação
    return group.canPost !== false && group.permissionStatus !== 'restricted_readonly';
  });

  if (validDestinations.length === 0) {
    incomingRecord.status = 'descartada';
    incomingRecord.discardReason = 'Todos os grupos de destino configurados estão restritos ou sem permissão de postagem.';
    await saveIncomingMessageRecord(incomingRecord);
    return {
      accepted: true,
      messageId,
      status: 'descartada',
      reason: 'Grupos de destino restritos a administradores ou sem permissão de postagem. Envio bloqueado por segurança.',
      jobIds: [],
    };
  }

  // 7. Montar Arte Radar automática (100% da foto oficial da loja; NUNCA reutilizar imagem de grupo de origem)
  const artResult = await processRadarArt({
    productTitle: productData.title,
    storeName: conversionResult.store,
    imageUrl: productData.imageUrl,
    currentPrice: productData.currentPrice,
    originalPrice: productData.originalPrice,
    discountPct: productData.discountPct,
    isPriceVerified: productData.dataSource === 'api_oficial' && productData.currentPrice > 0,
    isDiscountVerified: Boolean(productData.discountPct && productData.discountPct > 0),
    fallbackRule: 'revisao_manual',
  });

  // 8. Montar mensagem final para envio
  const formattedMessage = buildWhatsAppMessage({
    title: productData.title,
    originalPrice: productData.originalPrice,
    currentPrice: productData.currentPrice,
    discountPct: productData.discountPct,
    affiliateUrl: conversionResult.affiliateUrl,
    watermarkText: db.settings.watermarkText,
  });

  const createdJobIds: string[] = [];

  // Regra Estrita de Envio Automático:
  // Só pode ser 'agendado' (automático) se:
  // a) O modo da origem for 'automatico'
  // b) A avaliação de qualidade foi aprovada
  // c) O link de afiliado teve rastreamento/conversão CONFIRMADOS (isAutoDispatchAllowed === true)
  // d) A arte não exigiu revisão manual
  const isAutomaticAllowed =
    authorizedSource.operationMode === 'automatico' &&
    evaluation.decision === 'aprovado' &&
    conversionResult.isAutoDispatchAllowed &&
    !artResult.requiresManualReview;

  const scheduledTime = new Date(
    Date.now() + (authorizedSource.customDelaySeconds || 60) * 1000
  ).toISOString();

  for (const dest of validDestinations) {
    // Deduplicação básica: checar se este mesmo link de afiliado ou produto foi enviado para o mesmo grupo nas últimas 12 horas
    const alreadySentRecently = db.jobs.some(
      (j) =>
        j.targetJid === dest.groupJid &&
        j.affiliateUrl === conversionResult.affiliateUrl &&
        (j.status === 'enviado' || j.status === 'agendado') &&
        new Date(j.createdAt).getTime() > Date.now() - 12 * 60 * 60 * 1000
    );

    if (alreadySentRecently) {
      continue; // Evitar repetição e spam para o mesmo grupo de destino
    }

    const unverifiedReason =
      conversionResult.verificationStatus !== 'verificado'
        ? conversionResult.meta?.verificationReason ||
          'Link montado localmente sem confirmação por API oficial em tempo real. Envio automático bloqueado; confira o rastreamento antes de aprovar.'
        : undefined;

    const job: PublicationJob = {
      id: ensureValidUuid(),
      userId: authorizedSource.userId,
      originType: 'copiador',
      sourceId: authorizedSource.id,
      incomingMessageId: incomingRecord.id,
      productId: catalogProduct.id,
      evaluationId: evaluation.id,
      targetJid: dest.groupJid,
      targetName: dest.name,
      messageText: formattedMessage,
      mediaType: artResult.mediaType,
      mediaUrl: artResult.artUrl, // NUNCA reutiliza imagem do grupo de origem!
      affiliateUrl: conversionResult.affiliateUrl,
      originalUrl: primaryUrl,
      status: isAutomaticAllowed ? 'agendado' : 'aguardando_aprovacao',
      errorDetails: unverifiedReason,
      scheduledFor: scheduledTime,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await savePublicationJob(job);
    createdJobIds.push(job.id);
  }

  const reviewReason = !conversionResult.isAutoDispatchAllowed
    ? 'Link de afiliado não verificado — bloqueado envio automático para conferência humana.'
    : artResult.requiresManualReview
    ? 'Arte do produto pendente de foto de alta resolução — encaminhado para revisão.'
    : 'Oferta encaminhada para fila de revisão manual conforme configuração da origem.';

  return {
    accepted: true,
    messageId,
    status: 'processada',
    reason: isAutomaticAllowed
      ? `Oferta aprovada (Score ${evaluation.score}/100) e agendada para envio automático com Arte Radar.`
      : reviewReason,
    jobIds: createdJobIds,
  };
}
