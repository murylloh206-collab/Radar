import { CuratorPlan, ListCampaign, PublicationJob, QueueCampaign } from '../types';
import { convertToAffiliateLink } from './affiliate-converter';
import { buildWhatsAppMessage } from './message-builder';
import { processRadarArt } from './radar-art-engine';
import {
  ensureValidUuid,
  getDatabase,
  readDatabase,
  savePublicationJob,
  writeDatabase,
} from './storage';

export interface AutomationExecutionReport {
  timestamp: string;
  campaignsEvaluated: number;
  newJobsCreated: number;
  createdJobIds: string[];
  details: string[];
}

function timeStringToMinutes(timeStr: string): number {
  try {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
  } catch {
    return 0;
  }
}

function isWithinTimeWindow(windowStart: string, windowEnd: string): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = timeStringToMinutes(windowStart);
  const endMinutes = timeStringToMinutes(windowEnd);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Janela que cruza meia-noite (ex: 22:00 às 06:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

/**
 * Executa o processamento real de todas as campanhas de automação (Fila, Lista, Curador)
 * Garante seleção real de produtos, avaliação, deduplicação e agendamento de jobs válidos.
 */
export async function processAutomationCampaigns(): Promise<AutomationExecutionReport> {
  const db = readDatabase();
  const now = new Date();
  const nowMs = now.getTime();
  const createdJobIds: string[] = [];
  const details: string[] = [];

  let campaignsEvaluated = 0;

  // ---------------------------------------------------------------------------
  // 1. FILA (Garimpo contínuo por regras)
  // ---------------------------------------------------------------------------
  for (const campaign of db.queueCampaigns || []) {
    campaignsEvaluated++;

    if (!campaign.isActive) {
      details.push(`Fila "${campaign.name}": inativa.`);
      continue;
    }

    if (campaign.targetJids.length === 0) {
      details.push(`Fila "${campaign.name}": nenhum grupo de destino configurado.`);
      continue;
    }

    // Verificar janela de horário permitida
    if (campaign.windowStart && campaign.windowEnd) {
      if (!isWithinTimeWindow(campaign.windowStart, campaign.windowEnd)) {
        details.push(`Fila "${campaign.name}": fora da janela de horário (${campaign.windowStart} - ${campaign.windowEnd}).`);
        continue;
      }
    }

    // Verificar intervalo mínimo entre envios da campanha
    if (campaign.lastRunAt) {
      const lastRunMs = new Date(campaign.lastRunAt).getTime();
      const intervalMs = (campaign.sendIntervalMinutes || 45) * 60 * 1000;
      if (nowMs - lastRunMs < intervalMs) {
        details.push(`Fila "${campaign.name}": intervalo de ${campaign.sendIntervalMinutes}m ainda não transcorrido.`);
        continue;
      }
    }

    // Selecionar produtos elegíveis no catálogo da loja
    const repeatThresholdMs = (campaign.repeatAfterDays || 15) * 24 * 60 * 60 * 1000;

    const candidates = db.products.filter((p) => {
      if (p.storeName !== campaign.storeName) return false;
      if (!p.inStock) return false;
      if (
        (p.affiliateUrl && /teste|exemplo|MLB12345678/i.test(p.affiliateUrl)) ||
        (p.productUrl && /teste|exemplo|MLB12345678/i.test(p.productUrl))
      ) {
        return false;
      }
      if (campaign.minRating && (p.rating || 0) < campaign.minRating) return false;
      if (campaign.minReviews && (p.reviewsCount || 0) < campaign.minReviews) return false;
      if (campaign.minSales && (p.salesCount || 0) < campaign.minSales) return false;
      if (campaign.minPrice && p.currentPrice < campaign.minPrice) return false;
      if (campaign.maxPrice && p.currentPrice > campaign.maxPrice) return false;

      // Deduplicação: o produto não pode ter sido enviado aos mesmos grupos dentro do período de repetição
      const sentRecently = db.jobs.some(
        (j) =>
          j.productId === p.id &&
          campaign.targetJids.includes(j.targetJid) &&
          (j.status === 'enviado' || j.status === 'agendado') &&
          nowMs - new Date(j.createdAt).getTime() < repeatThresholdMs
      );

      return !sentRecently;
    });

    if (candidates.length === 0) {
      details.push(`Fila "${campaign.name}": nenhum produto elegível no catálogo no momento.`);
      continue;
    }

    // Escolher o melhor candidato (maior score / desconto)
    const selectedProduct = candidates.sort((a, b) => (b.discountPct || 0) - (a.discountPct || 0))[0];

    // Gerar Arte Radar automática
    const artResult = await processRadarArt({
      productTitle: selectedProduct.title,
      storeName: selectedProduct.storeName,
      imageUrl: selectedProduct.imageUrl,
      currentPrice: selectedProduct.currentPrice,
      originalPrice: selectedProduct.originalPrice,
      discountPct: selectedProduct.discountPct,
      isPriceVerified: Boolean(selectedProduct.currentPrice > 0),
      isDiscountVerified: Boolean(selectedProduct.discountPct && selectedProduct.discountPct > 0),
      fallbackRule: 'text_only',
    });

    // Validar link de afiliado do catálogo: se ausente ou igual à URL crua de terceiro, converte com credenciais
    let finalAffiliateUrl = selectedProduct.affiliateUrl;
    let queueJobStatus: 'agendado' | 'aguardando_aprovacao' = 'agendado';

    if (!finalAffiliateUrl || finalAffiliateUrl === selectedProduct.productUrl) {
      const credsMapQueue: Record<any, any> = {
        shopee: db.stores.find((s) => s.storeName === 'shopee') || null,
        mercadolivre: db.stores.find((s) => s.storeName === 'mercadolivre') || null,
        netshoes: db.stores.find((s) => s.storeName === 'netshoes') || null,
        amazon: db.stores.find((s) => s.storeName === 'amazon') || null,
        magalu: db.stores.find((s) => s.storeName === 'magalu') || null,
      };

      const convQueue = await convertToAffiliateLink(selectedProduct.productUrl, credsMapQueue);
      if (!convQueue.success || !convQueue.affiliateUrl) {
        details.push(
          `Fila "${campaign.name}": produto "${selectedProduct.title}" sem link de afiliado e conversão falhou (${convQueue.error || 'Credenciais ausentes'}). Agendamento ignorado.`
        );
        continue;
      }

      finalAffiliateUrl = convQueue.affiliateUrl;
      queueJobStatus =
        convQueue.isAutoDispatchAllowed && convQueue.linkState === 'apto_para_envio'
          ? 'agendado'
          : 'aguardando_aprovacao';
    }

    const msg = buildWhatsAppMessage({
      title: selectedProduct.title,
      originalPrice: selectedProduct.originalPrice,
      currentPrice: selectedProduct.currentPrice,
      discountPct: selectedProduct.discountPct,
      affiliateUrl: finalAffiliateUrl,
      watermarkText: db.settings.watermarkText,
    });

    for (const targetJid of campaign.targetJids) {
      const job: PublicationJob = {
        id: ensureValidUuid(),
        userId: campaign.userId,
        originType: 'fila',
        productId: selectedProduct.id,
        targetJid,
        messageText: msg,
        mediaType: artResult.mediaType,
        mediaUrl: artResult.artUrl,
        affiliateUrl: finalAffiliateUrl,
        status: queueJobStatus,
        scheduledFor: now.toISOString(),
        attempts: 0,
        maxAttempts: 3,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      await savePublicationJob(job);
      createdJobIds.push(job.id);
    }

    const latestDb = readDatabase();
    const qIdx = latestDb.queueCampaigns.findIndex((q) => q.id === campaign.id);
    if (qIdx >= 0) {
      latestDb.queueCampaigns[qIdx].lastRunAt = now.toISOString();
      latestDb.queueCampaigns[qIdx].updatedAt = now.toISOString();
      writeDatabase(latestDb);
    }

    details.push(`Fila "${campaign.name}": gerou ${campaign.targetJids.length} trabalho(s) para o produto "${selectedProduct.title}".`);
  }

  // ---------------------------------------------------------------------------
  // 2. LISTA (Campanhas manuais sequenciais em lote)
  // ---------------------------------------------------------------------------
  for (const campaign of db.listCampaigns || []) {
    campaignsEvaluated++;

    if (campaign.status !== 'ativa') {
      details.push(`Lista "${campaign.name}": status ${campaign.status}.`);
      continue;
    }

    if (campaign.targetJids.length === 0) {
      details.push(`Lista "${campaign.name}": sem grupos de destino.`);
      continue;
    }

    // Localizar próximo item pendente
    const pendingItemIdx = (campaign.items || []).findIndex((it) => it.status === 'pendente');
    if (pendingItemIdx < 0) {
      campaign.status = 'concluida';
      campaign.updatedAt = now.toISOString();
      details.push(`Lista "${campaign.name}": todos os itens foram enviados. Concluída.`);
      continue;
    }

    const currentItem = campaign.items[pendingItemIdx];

    // Converter link de afiliado oficial
    const credsMap: Record<any, any> = {
      shopee: db.stores.find((s) => s.storeName === 'shopee') || null,
      mercadolivre: db.stores.find((s) => s.storeName === 'mercadolivre') || null,
      netshoes: db.stores.find((s) => s.storeName === 'netshoes') || null,
      amazon: db.stores.find((s) => s.storeName === 'amazon') || null,
      magalu: db.stores.find((s) => s.storeName === 'magalu') || null,
    };

    const conv = await convertToAffiliateLink(currentItem.url || '', credsMap);

    // REGRA ESTRITA: Removido fallback conv.affiliateUrl : currentItem.url.
    // Se a conversão falhar ou não for confirmada para envio automático (linkState !== 'apto_para_envio'),
    // registra o motivo detalhado e IMPEDE o agendamento de qualquer trabalho.
    if (!conv.success || !conv.affiliateUrl || conv.verificationStatus !== 'verificado' || !conv.isAutoDispatchAllowed || conv.linkState !== 'apto_para_envio') {
      const blockReason =
        conv.meta?.verificationReason ||
        conv.error ||
        'Link de afiliado não confirmado pela API oficial da loja para a conta do usuário.';

      details.push(
        `Lista "${campaign.name}": agendamento bloqueado para o item "${currentItem.title || currentItem.url}". Motivo: ${blockReason}`
      );

      // Marca o item com status 'falha' na campanha e salva no banco sem criar nenhum job
      const latestDb = readDatabase();
      const lIdx = latestDb.listCampaigns.findIndex((l) => l.id === campaign.id);
      if (lIdx >= 0) {
        const itIdx = latestDb.listCampaigns[lIdx].items.findIndex((it) => it.id === currentItem.id);
        if (itIdx >= 0) {
          latestDb.listCampaigns[lIdx].items[itIdx].status = 'erro';
        }
        latestDb.listCampaigns[lIdx].updatedAt = now.toISOString();
        writeDatabase(latestDb);
      }
      continue;
    }

    const finalUrl = conv.affiliateUrl;
    const itemPrice = typeof currentItem.price === 'number' ? currentItem.price : undefined;

    const artResult = await processRadarArt({
      productTitle: currentItem.title || 'Oferta Selecionada em Lista',
      storeName: conv.store || 'mercadolivre',
      currentPrice: itemPrice,
      isPriceVerified: Boolean(itemPrice && itemPrice > 0),
      isDiscountVerified: false,
      fallbackRule: 'text_only',
    });

    const msg = buildWhatsAppMessage({
      title: currentItem.title || 'Oferta Selecionada',
      currentPrice: itemPrice || 0,
      affiliateUrl: finalUrl,
      watermarkText: db.settings.watermarkText,
    });

    for (const targetJid of campaign.targetJids) {
      const job: PublicationJob = {
        id: ensureValidUuid(),
        userId: campaign.userId,
        originType: 'lista',
        targetJid,
        messageText: msg,
        mediaType: artResult.mediaType,
        mediaUrl: artResult.artUrl,
        affiliateUrl: finalUrl,
        status: 'agendado',
        scheduledFor: now.toISOString(),
        attempts: 0,
        maxAttempts: 3,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      await savePublicationJob(job);
      createdJobIds.push(job.id);
    }

    const latestDb = readDatabase();
    const lIdx = latestDb.listCampaigns.findIndex((l) => l.id === campaign.id);
    if (lIdx >= 0) {
      latestDb.listCampaigns[lIdx].sentItems = (latestDb.listCampaigns[lIdx].sentItems || 0) + 1;
      const itIdx = latestDb.listCampaigns[lIdx].items.findIndex((it) => it.id === currentItem.id);
      if (itIdx >= 0) latestDb.listCampaigns[lIdx].items[itIdx].status = 'enviado';
      if (latestDb.listCampaigns[lIdx].sentItems >= (latestDb.listCampaigns[lIdx].totalItems || latestDb.listCampaigns[lIdx].items.length)) {
        latestDb.listCampaigns[lIdx].status = 'concluida';
      }
      latestDb.listCampaigns[lIdx].updatedAt = now.toISOString();
      writeDatabase(latestDb);
    }

    details.push(`Lista "${campaign.name}": item ${(campaign.sentItems || 0) + 1}/${campaign.totalItems} disparado.`);
  }

  // ---------------------------------------------------------------------------
  // 3. CURADOR INTELIGENTE (Distribuição equilibrada por horários)
  // ---------------------------------------------------------------------------
  for (const curator of db.curatorPlans || []) {
    campaignsEvaluated++;

    if (!curator.isActive) {
      details.push(`Curador "${curator.name}": inativo.`);
      continue;
    }

    // Verificar se já atingiu o limite diário de ofertas
    const todayStr = now.toISOString().split('T')[0];
    const todayCuratorJobs = db.jobs.filter(
      (j) => j.originType === 'curador' && j.createdAt.startsWith(todayStr)
    ).length;

    if (todayCuratorJobs >= (curator.dailyOffersLimit || 10)) {
      details.push(`Curador "${curator.name}": limite diário de ${curator.dailyOffersLimit} ofertas já atingido hoje.`);
      continue;
    }

    // Selecionar melhor produto disponível no catálogo das lojas autorizadas
    const selectedProduct = db.products.find(
      (p) =>
        curator.selectedStores.includes(p.storeName) &&
        p.inStock &&
        !db.jobs.some((j) => j.productId === p.id && j.createdAt.startsWith(todayStr))
    );

    if (!selectedProduct) {
      details.push(`Curador "${curator.name}": nenhum produto elegível não-repetido hoje.`);
      continue;
    }

    const artResult = await processRadarArt({
      productTitle: selectedProduct.title,
      storeName: selectedProduct.storeName,
      imageUrl: selectedProduct.imageUrl,
      currentPrice: selectedProduct.currentPrice,
      originalPrice: selectedProduct.originalPrice,
      discountPct: selectedProduct.discountPct,
      isPriceVerified: Boolean(selectedProduct.currentPrice > 0),
      isDiscountVerified: Boolean(selectedProduct.discountPct && selectedProduct.discountPct > 0),
      fallbackRule: 'text_only',
    });

    // Validar link de afiliado do catálogo no Curador: se ausente ou igual à URL crua de terceiro, converte
    let finalAffiliateUrl = selectedProduct.affiliateUrl;
    let curatorJobStatus: 'agendado' | 'aguardando_aprovacao' = 'agendado';

    if (!finalAffiliateUrl || finalAffiliateUrl === selectedProduct.productUrl) {
      const credsMapCurator: Record<any, any> = {
        shopee: db.stores.find((s) => s.storeName === 'shopee') || null,
        mercadolivre: db.stores.find((s) => s.storeName === 'mercadolivre') || null,
        netshoes: db.stores.find((s) => s.storeName === 'netshoes') || null,
        amazon: db.stores.find((s) => s.storeName === 'amazon') || null,
        magalu: db.stores.find((s) => s.storeName === 'magalu') || null,
      };

      const convCurator = await convertToAffiliateLink(selectedProduct.productUrl, credsMapCurator);
      if (!convCurator.success || !convCurator.affiliateUrl) {
        details.push(
          `Curador "${curator.name}": produto "${selectedProduct.title}" sem link de afiliado e conversão falhou (${convCurator.error || 'Credenciais ausentes'}). Agendamento ignorado.`
        );
        continue;
      }

      finalAffiliateUrl = convCurator.affiliateUrl;
      curatorJobStatus =
        convCurator.isAutoDispatchAllowed && convCurator.linkState === 'apto_para_envio'
          ? 'agendado'
          : 'aguardando_aprovacao';
    }

    const msg = buildWhatsAppMessage({
      title: selectedProduct.title,
      originalPrice: selectedProduct.originalPrice,
      currentPrice: selectedProduct.currentPrice,
      discountPct: selectedProduct.discountPct,
      affiliateUrl: finalAffiliateUrl,
      watermarkText: db.settings.watermarkText,
    });

    for (const targetJid of curator.targetJids) {
      const job: PublicationJob = {
        id: ensureValidUuid(),
        userId: curator.userId,
        originType: 'curador',
        productId: selectedProduct.id,
        targetJid,
        messageText: msg,
        mediaType: artResult.mediaType,
        mediaUrl: artResult.artUrl,
        affiliateUrl: finalAffiliateUrl,
        status: curatorJobStatus,
        scheduledFor: now.toISOString(),
        attempts: 0,
        maxAttempts: 3,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      await savePublicationJob(job);
      createdJobIds.push(job.id);
    }

    const latestDb = readDatabase();
    const curIdx = latestDb.curatorPlans.findIndex((c) => c.id === curator.id);
    if (curIdx >= 0) {
      latestDb.curatorPlans[curIdx].updatedAt = now.toISOString();
      writeDatabase(latestDb);
    }
    details.push(`Curador "${curator.name}": gerou oferta para "${selectedProduct.title}".`);
  }

  return {
    timestamp: now.toISOString(),
    campaignsEvaluated,
    newJobsCreated: createdJobIds.length,
    createdJobIds,
    details,
  };
}
