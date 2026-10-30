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
  getActiveEvolutionConfig,
} from './storage';
import { isTestIsolationActive } from '../supabase';
import { fetchProductRealData } from './product-fetcher';
import { processRadarArt } from './radar-art-engine';
import { runWorkerCycle } from './worker-engine';

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
  return Array.from(new Set(matches.map((u) => u.replace(/[),.]+$/, ''))));
}

function orderCandidateProductUrls(rawText: string, urls: string[]): string[] {
  if (urls.length <= 1) return urls;
  const lines = rawText.split(/\r?\n/);

  const scored = urls.map((url, idx) => {
    let score = idx; // por padrão, o link do produto costuma vir por último após o link de cupom
    const lineIdx = lines.findIndex((l) => l.includes(url));
    const context =
      lineIdx >= 0
        ? `${lines[lineIdx - 1] || ''} ${lines[lineIdx] || ''}`.toLowerCase()
        : '';

    if (context.includes('cupom') || context.includes('resgate')) {
      score -= 10;
    }
    if (
      context.includes('link do produto') ||
      context.includes('compre') ||
      context.includes('🛒')
    ) {
      score += 10;
    }
    return { url, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.url);
}

function parseBRLNumber(rawNum: string): number {
  const cleaned = rawNum.trim().replace(/\s/g, '');
  if (!cleaned) return 0;
  // Formato 1.349,90 ou 1.349
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.')) || 0;
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, '')) || 0;
  }
  return parseFloat(cleaned) || 0;
}

export function extractOfferDetailsFromWhatsAppText(
  rawText: string,
  storeName: string
): {
  title?: string;
  originalPrice?: number;
  currentPrice?: number;
  discountPct?: number;
} {
  let originalPrice: number | undefined;
  let currentPrice: number | undefined;

  // 1. Padrão "De: 1.349 | Por: R$747" ou "De R$ 89,90 por R$ 36,00"
  const dePorMatch = rawText.match(
    /de:?\s*(?:r\$\s*)?~?([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:,[0-9]{1,2})?)~?\s*(?:\||por:?|->|-|\n)+\s*(?:por(?:\s+apenas)?:?\s*)?(?:r\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:,[0-9]{1,2})?)/i
  );
  if (dePorMatch) {
    const p1 = parseBRLNumber(dePorMatch[1]);
    const p2 = parseBRLNumber(dePorMatch[2]);
    if (p1 > 0 && p2 > 0) {
      originalPrice = p1 > p2 ? p1 : undefined;
      currentPrice = p2;
    }
  }

  // 2. Fallback: "Por: R$ 747" ou "Por apenas R$ 99,90"
  if (!currentPrice) {
    const porMatch = rawText.match(
      /por(?:\s+apenas)?:?\s*\*?\s*(?:r\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+,[0-9]{1,2})/i
    );
    if (porMatch) {
      const p = parseBRLNumber(porMatch[1]);
      if (p > 0) currentPrice = p;
    }
  }

  // 3. Fallback: R$ explícito em linha que não seja cupom
  if (!currentPrice) {
    const lines = rawText.split(/\r?\n/);
    for (const line of lines) {
      if (/cupom|off|desconto|resgate|frete/i.test(line) && !/por:?/i.test(line)) {
        continue;
      }
      const rMatch = line.match(/r\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+)/i);
      if (rMatch) {
        const p = parseBRLNumber(rMatch[1]);
        if (p > 0) {
          currentPrice = p;
          break;
        }
      }
    }
  }

  // 4. Extrair título real da oferta a partir das linhas do texto
  const rawLines = rawText
    .replace(/https?:\/\/[^\s]+/gi, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\*+|\*+$/g, '').trim())
    .filter((l) => l.length >= 4);

  const candidateLines = rawLines.filter((line) => {
    const lower = line.toLowerCase();
    if (lower.startsWith('de:') || lower.startsWith('por:') || lower.startsWith('por apenas')) return false;
    if (/de:?\s*(?:r\$)?\s*\d+.*por:?/i.test(line)) return false;
    if (lower.includes('resgate aqui') || lower.includes('aplique o cupom') || lower.includes('resgate cupom')) return false;
    if (lower.includes('link do produto') || lower.includes('compre aqui') || lower === '🛒') return false;
    return true;
  });

  // Se houver mais de uma linha candidata e a primeira for um gancho curto em caixa alta (ex: "ESSE É ELITE 😍"),
  // preferir a segunda linha que contém o nome descritivo do produto
  let title: string | undefined;
  if (candidateLines.length >= 2) {
    const first = candidateLines[0];
    const lettersOnly = first.replace(/[^a-zA-ZÀ-ÿ]/g, '');
    const isAllCapsHook =
      lettersOnly.length > 0 &&
      lettersOnly === lettersOnly.toUpperCase() &&
      first.length < 40 &&
      !/\d/.test(first);
    title = isAllCapsHook ? candidateLines[1] : first;
  } else if (candidateLines.length === 1) {
    title = candidateLines[0];
  }

  let discountPct: number | undefined;
  if (originalPrice && currentPrice && originalPrice > currentPrice) {
    discountPct = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
  }

  return {
    title: title && title !== `Produto ${storeName.toUpperCase()}` ? title : undefined,
    originalPrice,
    currentPrice,
    discountPct,
  };
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

  // Priorizar link do produto quando houver link de cupom e link de produto na mesma mensagem
  const orderedUrls = orderCandidateProductUrls(rawText, extractedUrls);
  let primaryUrl = orderedUrls[0];

  // Organizar credenciais por loja (incluindo segredos descriptografados do cofre)
  const credentialsMap = await getStoreCredentialsMapWithSecrets(
    authorizedSource.userId,
    db.stores
  );

  // 3. Converter para link de afiliado oficial (tentando o próximo link se o primeiro for página genérica de cupom)
  let conversionResult = await convertToAffiliateLink(primaryUrl, credentialsMap);
  if (
    orderedUrls.length > 1 &&
    (!conversionResult.success ||
      /\/m\/cupom|\/m\/frete|\/cupons/i.test(conversionResult.cleanUrl || ''))
  ) {
    for (let i = 1; i < orderedUrls.length; i++) {
      const nextTry = await convertToAffiliateLink(orderedUrls[i], credentialsMap);
      if (
        nextTry.store &&
        (nextTry.success || !/\/m\/cupom|\/m\/frete|\/cupons/i.test(nextTry.cleanUrl || ''))
      ) {
        primaryUrl = orderedUrls[i];
        conversionResult = nextTry;
        break;
      }
    }
  }

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

  // 4. Coletar dados reais do produto (combinando scraping + extração do texto real da mensagem do WhatsApp)
  const productData = await fetchProductRealData(conversionResult.cleanUrl, conversionResult.store);
  const parsedFromWhatsApp = extractOfferDetailsFromWhatsAppText(rawText, conversionResult.store);

  if (parsedFromWhatsApp.title) {
    productData.title = parsedFromWhatsApp.title;
  }

  if ((!productData.currentPrice || productData.currentPrice <= 0) && parsedFromWhatsApp.currentPrice) {
    productData.currentPrice = parsedFromWhatsApp.currentPrice;
  }

  if ((!productData.originalPrice || productData.originalPrice <= 0) && parsedFromWhatsApp.originalPrice) {
    productData.originalPrice = parsedFromWhatsApp.originalPrice;
  }

  if ((!productData.discountPct || productData.discountPct <= 0) && parsedFromWhatsApp.discountPct) {
    productData.discountPct = parsedFromWhatsApp.discountPct;
  }

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
    requireSocialProof: false,
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

  const hasBlockedKeyword =
    Array.isArray(storeRule.blockedKeywords) &&
    storeRule.blockedKeywords.some(
      (kw) => kw && kw.trim().length > 0 && rawText.toLowerCase().includes(kw.toLowerCase())
    );
  const isQualityRejected = evaluation.decision === 'rejeitado';
  const shouldDiscardAuto = hasBlockedKeyword && authorizedSource.operationMode === 'automatico';

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

  // Se for modo automático e contiver palavra bloqueada, nunca gerar job automático
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

  // 7. Montar Arte Radar automática (se houver foto oficial disponível; caso contrário envia como mensagem de texto)
  const artResult = await processRadarArt({
    productTitle: productData.title,
    storeName: conversionResult.store,
    imageUrl: productData.imageUrl,
    currentPrice: productData.currentPrice,
    originalPrice: productData.originalPrice,
    discountPct: productData.discountPct,
    isPriceVerified: productData.currentPrice > 0,
    isDiscountVerified: Boolean(productData.discountPct && productData.discountPct > 0),
    fallbackRule: productData.imageUrl ? 'revisao_manual' : 'text_only',
  });

  // 8. Montar mensagem final para envio (usando o template configurado na origem)
  const formattedMessage = buildWhatsAppMessage({
    templateText: authorizedSource.templateText || undefined,
    title: productData.title,
    originalPrice: productData.originalPrice,
    currentPrice: productData.currentPrice,
    discountPct: productData.discountPct,
    affiliateUrl: conversionResult.affiliateUrl,
    watermarkText: db.settings.watermarkText,
  });

  const createdJobIds: string[] = [];

  // Regra de Envio Automático:
  // Só agenda automaticamente se o modo da origem for 'automatico', não houver palavras bloqueadas
  // e o link próprio de afiliado tiver sido gerado e confirmado com sucesso.
  const isAutomaticAllowed =
    authorizedSource.operationMode === 'automatico' &&
    !hasBlockedKeyword &&
    Boolean(conversionResult.success && conversionResult.affiliateUrl);

  const delaySeconds =
    typeof authorizedSource.customDelaySeconds === 'number' && authorizedSource.customDelaySeconds >= 0
      ? authorizedSource.customDelaySeconds
      : 5;

  const isImmediateDispatchMode = !isTestIsolationActive() && isAutomaticAllowed;
  const scheduledTime = isImmediateDispatchMode
    ? new Date().toISOString()
    : new Date(Date.now() + delaySeconds * 1000).toISOString();

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
          'Link montado localmente com parâmetros da conta.'
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
      mediaType: artResult.artUrl ? artResult.mediaType : 'none',
      mediaUrl: artResult.artUrl || undefined, // NUNCA reutiliza imagem do grupo de origem!
      affiliateUrl: conversionResult.affiliateUrl,
      originalUrl: primaryUrl,
      status: isAutomaticAllowed ? 'agendado' : 'aguardando_aprovacao',
      errorDetails: isAutomaticAllowed ? undefined : unverifiedReason,
      scheduledFor: scheduledTime,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await savePublicationJob(job);
    createdJobIds.push(job.id);
  }

  // Em produção (Render / Vercel / Local), executa o envio imediatamente na requisição para não depender de timers voláteis
  if (!isSimulation && isAutomaticAllowed && createdJobIds.length > 0) {
    if (isImmediateDispatchMode) {
      try {
        await runWorkerCycle();
      } catch (err) {
        console.error('[Copier Auto-Dispatch] Erro ao executar ciclo imediato do worker:', err);
      }
    } else {
      const triggerDelayMs = Math.max(500, delaySeconds * 1000 + 500);
      setTimeout(() => {
        runWorkerCycle().catch((err) => {
          console.error('[Copier Auto-Dispatch] Erro ao executar ciclo do worker:', err);
        });
      }, triggerDelayMs);
    }
  }

  const reviewReason = !conversionResult.isAutoDispatchAllowed
    ? 'Link de afiliado não verificado — bloqueado envio automático para conferência humana.'
    : 'Oferta encaminhada para fila de revisão manual conforme configuração da origem.';

  return {
    accepted: true,
    messageId,
    status: 'processada',
    reason: isAutomaticAllowed
      ? `Oferta aprovada e processada para envio automático.`
      : reviewReason,
    jobIds: createdJobIds,
  };
}

let isSyncingOriginMessages = false;
let lastOriginSyncAtMs = 0;

/**
 * Busca ativamente na Evolution API as últimas mensagens dos grupos de origem ativos
 * para recuperar ofertas caso o webhook tenha sofrido oscilação ou cold start.
 */
export async function syncRecentOriginMessagesFromEvolution(force = false): Promise<number> {
  if (isTestIsolationActive()) return 0;
  if (isSyncingOriginMessages) return 0;
  if (!force && Date.now() - lastOriginSyncAtMs < 25000) return 0;

  isSyncingOriginMessages = true;
  lastOriginSyncAtMs = Date.now();
  let newlyProcessed = 0;

  try {
    const db = readDatabase();
    const activeSources = (db.sources || []).filter((s) => s.isActive && s.groupJid);
    if (activeSources.length === 0) return 0;

    const evoConfig = getActiveEvolutionConfig(db.whatsapp);
    if (!evoConfig.baseUrl || !evoConfig.apiKey || !evoConfig.instanceName) return 0;

    const cleanBaseUrl = evoConfig.baseUrl.replace(/\/+$/, '');
    const maxAgeSec = 8 * 3600; // Últimas 8 horas
    const nowSec = Math.floor(Date.now() / 1000);

    for (const source of activeSources) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(
          `${cleanBaseUrl}/chat/findMessages/${encodeURIComponent(evoConfig.instanceName)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: evoConfig.apiKey,
            },
            body: JSON.stringify({
              where: { key: { remoteJid: source.groupJid } },
              limit: 3,
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);
        if (!res.ok) continue;

        const data = await res.json().catch(() => null);
        const records: any[] =
          data?.messages?.records || data?.records || (Array.isArray(data) ? data : []);

        // Processa da mais antiga para a mais recente entre as últimas 3
        const recentRecords = records
          .filter((m) => {
            const msgId = m?.key?.id;
            if (!msgId) return false;
            const ts = Number(m?.messageTimestamp || 0);
            if (ts > 0 && nowSec - ts > maxAgeSec) return false;
            const currentDb = readDatabase();
            return !currentDb.incomingMessages.some((inc) => inc.messageId === msgId);
          })
          .reverse();

        for (const msg of recentRecords) {
          const resProc = await processIncomingMessage({
            event: 'messages.upsert',
            instance: evoConfig.instanceName,
            data: {
              key: msg.key,
              pushName: msg.pushName || 'Grupo',
              message: msg.message,
              messageTimestamp: msg.messageTimestamp,
            },
          });
          if (resProc.accepted && resProc.status === 'processada') {
            newlyProcessed++;
          }
        }
      } catch {
        clearTimeout(timeout);
      }
    }
  } finally {
    isSyncingOriginMessages = false;
  }

  return newlyProcessed;
}
