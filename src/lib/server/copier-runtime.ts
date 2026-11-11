import 'server-only';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { UserSession } from './auth';
import type { PublicationJob, StoreCredential } from '../types';
import { getInitialDatabase } from './storage';
import { scopedCopierRules } from './copier-scoped-rules';
import { copierGroupCatalog } from './copier-group-catalog';
import { savedWhatsAppGroups } from './whatsapp-group-cache';
import { getStoreCredentialsMapWithSecrets } from './credentials-vault';
import { withCopierDatabase } from './copier-runtime-context';
import {
  computeIncomingOfferFingerprint,
  extractProductTitleFromFormattedMessage,
  extractWhatsAppMessageText,
  isDuplicateOfferJob,
  processIncomingMessage,
  type EvolutionWebhookPayload,
} from './copier-service';
import { validateJobForDispatch } from './job-validator';
import { getDailyOfferQuotaStatus } from './plan-guard';
import { stripChannelSrcFromMessageText } from '../offer-format';

type InboxEntry = { id: string; user_id: string; connection_id: string; payload: EvolutionWebhookPayload; lease_token: string; attempts: number };
type StoredJob = { id: string; user_id: string; connection_id: string; runtime_token: string; runtime_verified_url: string | null; runtime_payload: PublicationJob; scheduled_for: string; attempts: number; max_attempts: number; sendStarted?: boolean };
export class CopierRuntimeError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}

function database() {
  if (!isSupabaseConfigured || !supabase || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new CopierRuntimeError('O copiador precisa do Supabase com acesso de servidor configurado.');
  }
  return supabase;
}
function checked<T>(response: { data: T; error: unknown }, operation: string): T {
  if (response.error) throw new CopierRuntimeError(`${operation} falhou. Confira a migração 06 e a conexão com o banco.`);
  return response.data;
}
const serviceSession = (userId: string): UserSession => ({ userId, role: 'user', email: '', createdAt: 0, expiresAt: 0 });

export async function acceptCopierEvent(payload: EvolutionWebhookPayload, suppliedSecret: string) {
  const client = database();
  const instance = typeof payload.instance === 'string' ? payload.instance : '';
  if (!instance || !suppliedSecret) throw new CopierRuntimeError('Instância ou autenticação ausente.', 401);
  const registered = checked(await client.from('whatsapp_connections').select('*').eq('instance_name', instance).limit(2), 'Identificação da conexão');
  if (!registered || registered.length !== 1 || !registered[0].webhook_secret) throw new CopierRuntimeError('Instância não registrada com webhook exclusivo.');
  const connection = registered[0];
  const secretHash = (secret: string) => createHash('sha256').update(secret).digest();
  if (!timingSafeEqual(secretHash(suppliedSecret), secretHash(connection.webhook_secret))) {
    throw new CopierRuntimeError('Webhook não autorizado.', 401);
  }
  const event = String(payload.event || '').toLowerCase().replaceAll('_', '.');
  if (event === 'connection.update') {
    const state = String((payload.data as unknown as { state?: string })?.state || '').toLowerCase();
    const status = ['open', 'connected'].includes(state) ? 'connected' : ['close', 'closed'].includes(state) ? 'disconnected' : state === 'connecting' ? 'connecting' : undefined;
    if (status) checked(await client.from('whatsapp_connections').update({ status, last_ping_at: new Date().toISOString(),
      last_verification_status: 'verified' }).eq('id', connection.id).eq('user_id', connection.user_id), 'Estado da conexão');
    return { accepted: true, inserted: 0 };
  }
  if (event && event !== 'messages.upsert') return { accepted: true, inserted: 0 };
  const sources = checked(await client.from('copy_sources').select('source_jid,configuration')
    .eq('user_id', connection.user_id).eq('connection_id', connection.id).eq('is_active', true), 'Origens monitoradas');
  const monitored = new Set((sources || []).filter(source => source.configuration?.ownerJid === connection.owner_jid).map(source => source.source_jid));
  const entries = Array.isArray(payload.data) ? payload.data : [payload.data];
  const candidateEntries = entries.filter(entry => {
    const key = entry?.key;
    return !key?.fromMe && monitored.has(key?.remoteJid) && key?.id && typeof key.id === 'string' && /^\d{5,30}@g\.us$/.test(key.remoteJid || '');
  });
  if (!candidateEntries.length) return { accepted: true, inserted: 0 };

  // Deduplicação na entrada: evita que múltiplos bots do grupo de origem (com message_id diferentes ou caracteres invisíveis)
  // enfileirem a mesma oferta duas vezes no copier_inbox
  const cutoffIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const recentInboxRes = await client
    .from('copier_inbox')
    .select('message_id, status, payload, received_at')
    .eq('user_id', connection.user_id)
    .eq('connection_id', connection.id)
    .in('status', ['pending', 'processing', 'processed'])
    .gte('received_at', cutoffIso)
    .order('received_at', { ascending: false })
    .limit(50);

  const seenUrls = new Set<string>();
  const seenTexts = new Set<string>();
  const seenMsgIds = new Set<string>();

  for (const row of recentInboxRes.data || []) {
    if (row.message_id) seenMsgIds.add(String(row.message_id));
    const prevData = Array.isArray(row.payload?.data) ? row.payload.data[0] : row.payload?.data;
    const prevText = extractWhatsAppMessageText(prevData);
    if (!prevText) continue;
    const fp = computeIncomingOfferFingerprint(prevText);
    for (const u of fp.normalizedUrls) seenUrls.add(u);
    if (fp.normalizedText.length >= 20) seenTexts.add(fp.normalizedText);
  }

  const records: Array<{
    user_id: string;
    connection_id: string;
    message_id: string;
    payload: { event: string; instance: string; data: unknown };
  }> = [];

  for (const entry of candidateEntries) {
    const msgId = String(entry.key!.id);
    if (seenMsgIds.has(msgId)) continue;

    // Ignorar mensagens antigas (> 90 min) reenviadas pelo Baileys ao sincronizar histórico offline
    const rawTs = Number((entry as Record<string, unknown>)?.messageTimestamp || 0);
    const msgTimeMs = rawTs > 1e12 ? rawTs : rawTs * 1000;
    if (msgTimeMs > 0 && Date.now() - msgTimeMs > 90 * 60 * 1000) {
      continue;
    }

    const rawText = extractWhatsAppMessageText(entry);
    const fp = computeIncomingOfferFingerprint(rawText);
    if (fp.normalizedUrls.length === 0) {
      // Mensagens de aviso no grupo sem nenhum link de produto (ex.: "CUPOM ESGOTADO")
      continue;
    }

    const hasDuplicateUrl = fp.normalizedUrls.some(u => seenUrls.has(u));
    const hasDuplicateText = fp.normalizedText.length >= 20 && seenTexts.has(fp.normalizedText);

    if (hasDuplicateUrl || hasDuplicateText) {
      continue;
    }

    seenMsgIds.add(msgId);
    for (const u of fp.normalizedUrls) seenUrls.add(u);
    if (fp.normalizedText.length >= 20) seenTexts.add(fp.normalizedText);

    records.push({
      user_id: connection.user_id,
      connection_id: connection.id,
      message_id: msgId,
      payload: { event: 'messages.upsert', instance, data: entry },
    });
  }

  if (records.length) checked(await client.from('copier_inbox').upsert(records, {
    onConflict: 'user_id,connection_id,message_id', ignoreDuplicates: true,
  }), 'Persistência do evento');
  return { accepted: true, inserted: records.length };
}

async function snapshot(userId: string, connectionId: string) {
  const client = database();
  const session = serviceSession(userId);
  const loadCatalog = async () => {
    const saved = await savedWhatsAppGroups(session, connectionId);
    if (saved.groups.length > 0 && saved.connection.ownerJid) {
      return saved;
    }
    return copierGroupCatalog(session, { connectionId, permissions: true });
  };
  const [scoped, catalog, settingsResponse, qualityResponse, recentResponse, credentials] = await Promise.all([
    scopedCopierRules(session, connectionId),
    loadCatalog(),
    client.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
    client.from('quality_rules').select('*').eq('user_id', userId),
    client.from('publication_jobs').select('id,runtime_payload,status,runtime_delivery,affiliate_url,original_url,clean_url,message_text,created_at,sent_at,updated_at').eq('user_id', userId)
      .eq('connection_id', connectionId).order('created_at', { ascending: false }).limit(200),
    getStoreCredentialsMapWithSecrets(userId),
  ]);
  if (scoped.connection.persistence !== 'multi') throw new CopierRuntimeError('Salve a conexão no cadastro múltiplo antes de ativar o copiador.');
  const settings = checked(settingsResponse, 'Leitura das configurações');
  if (!settings) throw new CopierRuntimeError('Configure os horários e limites da conta antes de enviar.');
  const quality = checked(qualityResponse, 'Leitura dos filtros');
  const recent = checked(recentResponse, 'Leitura da fila');
  const initial = getInitialDatabase();
  initial.settings = { ...initial.settings, userId, id: settings.id, nightPauseEnabled: settings.night_pause_enabled,
    nightPauseStart: settings.night_pause_start, nightPauseEnd: settings.night_pause_end,
    minSendIntervalSeconds: settings.min_send_interval_seconds, maxDailyMessages: settings.max_daily_messages,
    watermarkText: settings.watermark_text };
  initial.connections = [catalog.connection];
  initial.whatsapp = { ...catalog.connection };
  initial.groups = catalog.groups;
  initial.sources = scoped.sources.map(source => ({ ...source, isActive: source.isActive &&
    (source as typeof source & { ownerJid?: string }).ownerJid === catalog.connection.ownerJid }));
  initial.destinations = scoped.destinations;
  initial.stores = Object.values(credentials).filter((credential): credential is StoreCredential => !!credential);
  initial.rules = (quality || []).map(rule => ({ id: rule.id, userId, storeName: rule.store_name,
    minRating: Number(rule.min_rating), minReviewsCount: rule.min_reviews_count, minSalesCount: rule.min_sales_count,
    minDiscountPct: Number(rule.min_discount_pct), minCommissionRate: Number(rule.min_commission_rate),
    requireSocialProof: rule.require_social_proof, requireInStock: rule.require_in_stock,
    blockedKeywords: rule.blocked_keywords || [], updatedAt: rule.updated_at }));
  initial.templates = []; initial.hooks = []; initial.coupons = []; initial.products = []; initial.evaluations = [];
  initial.incomingMessages = []; initial.queueCampaigns = []; initial.listCampaigns = []; initial.curatorPlans = [];
  initial.jobs = (recent || []).filter(row => row.runtime_payload).map(row => ({
    ...row.runtime_payload,
    id: row.id || row.runtime_payload.id,
    status: row.status,
    runtimeDelivery: row.runtime_delivery ?? null,
    affiliateUrl: row.affiliate_url || row.runtime_payload?.affiliateUrl,
    originalUrl: row.original_url || row.runtime_payload?.originalUrl,
    cleanUrl: row.clean_url || (row.runtime_payload as PublicationJob & { cleanUrl?: string })?.cleanUrl,
    messageText: row.message_text || row.runtime_payload?.messageText,
    createdAt: row.created_at || row.runtime_payload?.createdAt,
    sentAt: row.sent_at,
    updatedAt: row.updated_at,
  } as PublicationJob & { runtimeDelivery?: string | null; cleanUrl?: string }));
  return initial;
}

async function processEntry(entry: InboxEntry) {
  const started = performance.now();
  const raw = Array.isArray(entry.payload.data) ? entry.payload.data[0] : entry.payload.data;
  const rawTs = Number((raw as Record<string, unknown>)?.messageTimestamp || 0);
  const msgTimeMs = rawTs > 1e12 ? rawTs : rawTs * 1000;
  if (msgTimeMs > 0 && Date.now() - msgTimeMs > 2 * 60 * 60 * 1000) {
    checked(await database().rpc('copier_complete_inbox', {
      p_id: entry.id,
      p_token: entry.lease_token,
      p_result: { status: 'descartada', reason: 'Mensagem histórica antiga (> 2h) sincronizada após reconexão; descartada para evitar envio de ofertas vencidas.' },
      p_jobs: [],
    }), 'Conclusão de evento histórico antigo');
    return;
  }
  const scoped = await scopedCopierRules(serviceSession(entry.user_id), entry.connection_id);
  const matchingSource = scoped.sources.find(source => source.isActive && source.groupJid === raw?.key?.remoteJid &&
    (source as typeof source & { ownerJid?: string }).ownerJid === scoped.connection.ownerJid);
  if (!matchingSource || raw?.key?.fromMe) {
    checked(await database().rpc('copier_complete_inbox', { p_id: entry.id, p_token: entry.lease_token,
      p_result: { reason: 'Mensagem fora das origens ativas desta conta. Nenhum envio criado.' }, p_jobs: [] }), 'Conclusão do evento sem regra');
    return;
  }
  const initial = await snapshot(entry.user_id, entry.connection_id);
  const before = new Set(initial.jobs.map(job => job.id));
  const processed = await withCopierDatabase(initial, () => processIncomingMessage(entry.payload, {
    connectionId: entry.connection_id, deferDispatch: true,
  }));
  const jobs = processed.database.jobs.filter(job => !before.has(job.id)).map(job => ({ ...job,
    runtimeOwnerJid: initial.connections![0].ownerJid }));
  const completed = checked(await database().rpc('copier_complete_inbox', {
    p_id: entry.id, p_token: entry.lease_token,
    p_result: { ...processed.result, incoming: processed.database.incomingMessages,
      processingMs: Math.round(performance.now() - started) }, p_jobs: jobs,
  }), 'Conclusão atômica do processamento');
  if (!completed) throw new CopierRuntimeError('A reserva do evento expirou; nenhuma publicação foi liberada por esta execução.');
}

function minuteOfDay(time: string) {
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) throw new CopierRuntimeError('Horário inválido na configuração da conta ou regra.');
  const [hours, minutes] = time.split(':').map(Number);
  if (hours > 23 || minutes > 59) throw new CopierRuntimeError('Horário fora do intervalo permitido.');
  return hours * 60 + minutes;
}
export function withinWindow(now: number, start: number, end: number) {
  return start === end || (start < end ? now >= start && now < end : now >= start || now < end);
}
function currentMinute() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  return minuteOfDay(parts);
}

async function updateJob(row: StoredJob, update: Record<string, unknown>) {
  const updated = checked(await database().from('publication_jobs').update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', row.id).eq('runtime_token', row.runtime_token).eq('status', 'enviando').select('id'), 'Atualização da publicação');
  if (!updated?.length) throw new CopierRuntimeError('A reserva da publicação não pertence mais a esta execução.');
}

async function sendEntry(row: StoredJob) {
  const initial = await snapshot(row.user_id, row.connection_id);
  const job: PublicationJob = { ...row.runtime_payload, status: 'enviando', attempts: row.attempts };
  const source = initial.sources.find(rule => rule.id === job.sourceId && rule.connectionId === row.connection_id && rule.isActive);
  const connection = initial.connections![0];
  if (!source || job.userId !== row.user_id || job.connectionId !== row.connection_id ||
    row.runtime_verified_url !== job.affiliateUrl || source.operationMode !== 'automatico' ||
    (row.runtime_payload as PublicationJob & { runtimeOwnerJid?: string }).runtimeOwnerJid !== connection.ownerJid) {
    return updateJob(row, { status: 'falha', error_details: 'Regra, conexão ou evidência do link inválida. Revalide a oferta.' });
  }
  const now = currentMinute();
  const isRule24h = Boolean(source.is24Hours) || (source.startTime === '00:00' && (source.endTime === '00:00' || source.endTime === '23:59'));
  if (!isRule24h) {
    if ((initial.settings.nightPauseEnabled && withinWindow(now, minuteOfDay(initial.settings.nightPauseStart), minuteOfDay(initial.settings.nightPauseEnd))) ||
      !withinWindow(now, minuteOfDay(source.startTime || '00:00'), minuteOfDay(source.endTime || '00:00'))) {
      return updateJob(row, { status: 'agendado', locked_at: null, runtime_delivery: null,
        scheduled_for: new Date(Date.now() + 60000).toISOString(), attempts: Math.max(row.attempts - 1, 0), error_details: 'Aguardando horário permitido.' });
    }
  }
  const validation = validateJobForDispatch(job, initial);
  if (!validation.valid) return updateJob(row, { status: 'falha', error_details: validation.error });

  // Trava anti-duplicata de última milha antes de disparar na Evolution API:
  // Impede que 2 jobs da mesma oferta sejam enviados caso tenham sido criados quase simultaneamente
  const otherJobs = initial.jobs.filter(j => j.id !== row.id);
  const isDuplicateAtSendTime = isDuplicateOfferJob(
    {
      targetJid: job.targetJid,
      affiliateUrl: job.affiliateUrl,
      originalUrl: job.originalUrl,
      cleanUrl: (job as PublicationJob & { cleanUrl?: string }).cleanUrl,
      productTitle: extractProductTitleFromFormattedMessage(job.messageText),
    },
    otherJobs.filter(j =>
      j.status === 'enviado' ||
      j.status === 'enviando' ||
      (j as PublicationJob & { runtimeDelivery?: string | null }).runtimeDelivery === 'accepted' ||
      (j as PublicationJob & { runtimeDelivery?: string | null }).runtimeDelivery === 'uncertain'
    ),
    24
  );
  if (isDuplicateAtSendTime) {
    return updateJob(row, {
      status: 'falha',
      runtime_delivery: 'blocked',
      error_details: 'Envio duplicado bloqueado preventivamente: oferta já enviada recentemente para este grupo.',
    });
  }

  const quota = await getDailyOfferQuotaStatus(row.user_id);
  if (quota.limitReached) {
    return updateJob(row, {
      status: 'aguardando_aprovacao',
      locked_at: null,
      runtime_delivery: 'blocked',
      error_details: `Limite diário do plano (${quota.dailyLimit} ofertas/dia) atingido (${quota.postedToday} postadas hoje). Faça upgrade em /planos para continuar enviando hoje.`,
    });
  }
  const ready = checked(await database().rpc('copier_begin_send', { p_id: row.id, p_token: row.runtime_token }), 'Confirmação de envio');
  if (!ready) throw new CopierRuntimeError('Publicação cancelada ou conexão removida antes do envio.');
  row.sendStarted = true;
  const media = !!job.mediaUrl;
  if (!media && job.mediaType !== 'none') {
    return updateJob(row, { status: 'falha', runtime_delivery: 'blocked', error_details: 'Oferta exige fotografia, mas a mídia processada não está disponível. Envio bloqueado para evitar publicação incompleta.' });
  }
  const cleanMessageText = stripChannelSrcFromMessageText(job.messageText);
  let response: Response;
  try {
    response = await fetch(`${connection.baseUrl.replace(/\/+$/, '')}/message/${media ? 'sendMedia' : 'sendText'}/${encodeURIComponent(connection.instanceName)}`, {
      method: 'POST', headers: { apikey: connection.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(media ? { number: job.targetJid, mediatype: job.mediaType === 'video' ? 'video' : 'image', media: job.mediaUrl, caption: cleanMessageText } : { number: job.targetJid, text: cleanMessageText }),
      signal: AbortSignal.timeout(35000), cache: 'no-store',
    });
  } catch (netErr: unknown) {
    const netMsg = netErr instanceof Error ? netErr.message : String(netErr);
    return updateJob(row, { status: 'falha', runtime_delivery: 'uncertain', error_details: `Envio sem resposta conclusiva do gateway (${netMsg}). Confira o gateway antes de repetir.` });
  }
  if (!response.ok) {
    let errBody = '';
    try { errBody = await response.text(); } catch {}
    const isConnectionClosed = /connection\s+closed|connection\s+terminated|socket\s+closed/i.test(errBody);
    if (isConnectionClosed && row.attempts < (row.max_attempts || 3)) {
      try {
        await fetch(`${connection.baseUrl.replace(/\/+$/, '')}/instance/connect/${encodeURIComponent(connection.instanceName)}`, {
          method: 'GET',
          headers: { apikey: connection.apiKey },
          signal: AbortSignal.timeout(8000),
          cache: 'no-store',
        });
      } catch {}
      return updateJob(row, {
        status: 'agendado',
        locked_at: null,
        runtime_delivery: null,
        scheduled_for: new Date(Date.now() + 20000).toISOString(),
        error_details: 'Sessão do WhatsApp oscilou (Connection Closed). Reconectando para reenvio automático.',
      });
    }
    const briefErr = errBody ? `: ${errBody.slice(0, 120)}` : '';
    return updateJob(row, { status: 'falha', runtime_delivery: response.status >= 500 ? 'uncertain' : 'rejected', error_details: `Gateway retornou HTTP ${response.status}${briefErr}. Não houve repetição automática.` });
  }
  let provider: { key?: { id?: string } };
  try { provider = await response.json(); }
  catch { return updateJob(row, { status: 'falha', runtime_delivery: 'uncertain', error_details: 'Resposta do envio sem confirmação legível.' }); }
  if (!provider.key?.id) return updateJob(row, { status: 'falha', runtime_delivery: 'uncertain', error_details: 'Gateway não informou o identificador da mensagem.' });
  await updateJob(row, { status: 'enviado', sent_at: new Date().toISOString(), runtime_delivery: 'accepted', error_details: null });
}

const workerId = randomUUID();
export async function copierHeartbeat() {
  checked(await database().from('copier_worker_heartbeat').upsert({ id: workerId, last_seen_at: new Date().toISOString() }), 'Heartbeat');
}
async function configurePendingWebhook() {
  const rows = checked(await database().from('whatsapp_connections').select('*').lt('runtime_webhook_version', 2)
    .lte('runtime_webhook_next_at', new Date().toISOString()).limit(1), 'Consulta do webhook');
  if (!rows?.length) return;
  const row = rows[0];
  try {
    const root = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (!root || new URL(root).protocol !== 'https:') throw new CopierRuntimeError('Configure APP_URL com o endereço público HTTPS do painel no worker.');
    if (!row.webhook_secret) throw new CopierRuntimeError('Reconecte o cadastro para registrar um segredo de webhook exclusivo.');
    const { connection } = await scopedCopierRules(serviceSession(row.user_id), row.id);
    const url = new URL('/api/webhook/evolution', root).href;
    const settings = { enabled: true, url, byEvents: false, webhookByEvents: false,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'], headers: { 'x-webhook-secret': row.webhook_secret } };
    const response = await fetch(`${connection.baseUrl.replace(/\/+$/, '')}/webhook/set/${encodeURIComponent(connection.instanceName)}`, {
      method: 'POST', headers: { apikey: connection.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook: settings, ...settings }), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new CopierRuntimeError('O gateway não aceitou configurar o recebimento.');
    const verify = await fetch(`${connection.baseUrl.replace(/\/+$/, '')}/webhook/find/${encodeURIComponent(connection.instanceName)}`, {
      headers: { apikey: connection.apiKey }, signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
    if (!verify.ok) throw new CopierRuntimeError('Não foi possível confirmar o webhook no gateway.');
    const registered = await verify.json();
    const actual = registered.webhook || registered;
    if (actual.enabled !== true || actual.url !== url || !actual.events?.includes('MESSAGES_UPSERT') || !actual.events?.includes('CONNECTION_UPDATE')) {
      throw new CopierRuntimeError('A configuração de recebimento não foi confirmada pelo gateway.');
    }
    checked(await database().from('whatsapp_connections').update({ runtime_webhook_version: 2, runtime_webhook_error: null })
      .eq('id', row.id).eq('user_id', row.user_id), 'Confirmação do webhook');
  } catch (error) {
    checked(await database().from('whatsapp_connections').update({ runtime_webhook_next_at: new Date(Date.now() + 30000).toISOString(),
      runtime_webhook_error: error instanceof CopierRuntimeError ? error.message : 'Falha temporária na configuração do recebimento.' })
      .eq('id', row.id).eq('user_id', row.user_id), 'Diagnóstico do webhook');
  }
}
let running = false;
export async function runDurableCopierCycle() {
  if (running) return { busy: true, processed: 0, dispatched: 0 };
  running = true;
  let processed = 0; let dispatched = 0;
  try {
    await copierHeartbeat();

    // 1ª Rodada: Despacha publicações que já estavam agendadas
    for (let count = 0; count < 3; count++) {
      const claims = checked(await database().rpc('copier_claim_job'), 'Reserva de publicação') as StoredJob[];
      if (!claims.length) break;
      try { await sendEntry(claims[0]); dispatched++; }
      catch (error) {
        const errorMsg = error instanceof CopierRuntimeError ? error.message : (error instanceof Error ? error.message : 'Falha ao validar a publicação. Consulte o diagnóstico.');
        await updateJob(claims[0], { status: 'falha', runtime_delivery: claims[0].sendStarted ? 'uncertain' : 'blocked',
          error_details: claims[0].sendStarted ? 'Não foi possível concluir o registro do envio. Reconciliar no gateway antes de repetir.' : errorMsg });
      }
    }
    await configurePendingWebhook();

    // 2ª Rodada: Processa eventos da caixa de entrada recebidos pelo Webhook
    // Limita a 2 itens (ou 5s) por ciclo para garantir folga de tempo para o envio imediato na 3ª rodada
    const batchStarted = performance.now();
    for (let count = 0; count < 2 && performance.now() - batchStarted < 5000; count++) {
      const entries = checked(await database().rpc('copier_claim_inbox'), 'Reserva de evento') as InboxEntry[];
      if (!entries.length) break;
      {
        const entry = entries[0];
        try {
          await copierHeartbeat();
          await processEntry(entry);
          processed++;
        }
        catch (error) {
          checked(await database().from('copier_inbox').update({ status: entry.attempts >= 3 ? 'failed' : 'pending',
            available_at: new Date(Date.now() + 15000).toISOString(), lease_until: null,
            last_error: error instanceof Error ? error.message : 'Falha de processamento. Consulte configurações de afiliados e gateway.' })
            .eq('id', entry.id).eq('lease_token', entry.lease_token), 'Registro da falha do evento');
        }
      }
    }

    // 3ª Rodada (AUTO-DISPATCH IMEDIATO): Se foram gerados novos jobs pelo processamento do inbox,
    // despacha imediatamente sem deixar a oferta presa aguardando próximo ciclo de cron
    if (processed > 0) {
      for (let count = 0; count < 3; count++) {
        const claims = checked(await database().rpc('copier_claim_job'), 'Reserva de publicação') as StoredJob[];
        if (!claims.length) break;
        try { await sendEntry(claims[0]); dispatched++; }
        catch (error) {
          const errorMsg = error instanceof CopierRuntimeError ? error.message : (error instanceof Error ? error.message : 'Falha ao validar a publicação. Consulte o diagnóstico.');
          await updateJob(claims[0], { status: 'falha', runtime_delivery: claims[0].sendStarted ? 'uncertain' : 'blocked',
            error_details: claims[0].sendStarted ? 'Não foi possível concluir o registro do envio. Reconciliar no gateway antes de repetir.' : errorMsg });
        }
      }
    }

    return { processed, dispatched };
  } finally { running = false; }
}
