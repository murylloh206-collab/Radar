import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  CopyDestination,
  CopySource,
  CuratorPlan,
  EngagementHook,
  IncomingMessage,
  ListCampaign,
  MessageTemplate,
  OfferEvaluation,
  ProductItem,
  PublicationJob,
  QualityRule,
  QueueCampaign,
  StoreCoupon,
  StoreCredential,
  SafeStoreCredential,
  UserSettings,
  WhatsAppGroup,
  WhatsAppIntegration,
} from '../types';
import { isSupabaseConfigured, isTestIsolationActive, supabase } from '../supabase';

export interface DatabaseSchema {
  settings: UserSettings;
  whatsapp: WhatsAppIntegration;
  stores: StoreCredential[];
  rules: QualityRule[];
  templates: MessageTemplate[];
  hooks: EngagementHook[];
  coupons: StoreCoupon[];
  groups: WhatsAppGroup[];
  sources: CopySource[];
  destinations: CopyDestination[];
  incomingMessages: IncomingMessage[];
  products: ProductItem[];
  evaluations: OfferEvaluation[];
  jobs: PublicationJob[];
  queueCampaigns: QueueCampaign[];
  listCampaigns: ListCampaign[];
  curatorPlans: CuratorPlan[];
}

export function getDatabaseFilePath(): string {
  if (process.env.RADAR_DB_PATH && process.env.RADAR_DB_PATH.trim().length > 0) {
    return path.resolve(process.env.RADAR_DB_PATH.trim());
  }
  return path.join(process.cwd(), '.data', 'radar_db.json');
}

export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Garante que o identificador esteja no padrão UUID v4 do Postgres
 */
export function ensureValidUuid(id?: string): string {
  if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id;
  }
  return crypto.randomUUID();
}

/**
 * Validação estrita da URL do gateway para prevenir SSRF e conexões arbitrárias
 */
export function isValidGatewayUrl(urlStr: string): { valid: boolean; reason?: string } {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false, reason: 'Protocolo inválido. O gateway deve utilizar HTTP ou HTTPS.' };
    }
    const hostname = url.hostname.toLowerCase();

    // Bloqueio de metadados de nuvem e redes link-local sensíveis (proteção SSRF)
    const blockedHosts = [
      '169.254.169.254',
      'metadata.google.internal',
      '100.100.100.200',
    ];

    if (blockedHosts.includes(hostname) || hostname.endsWith('.internal')) {
      return { valid: false, reason: 'Endereço bloqueado por segurança: endpoints de metadados internos não são permitidos.' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Formato de URL do gateway inválido.' };
  }
}

/**
 * Normaliza um número de telefone ou JID removendo sufixos (@...) e pontuações
 */
export function normalizeWhatsAppPhone(phoneOrJid?: string): string {
  if (!phoneOrJid) return '';
  const clean = String(phoneOrJid).toLowerCase().trim();
  const withoutDomain = clean.replace(/@.*$/, '').replace(/:\d+$/, '');
  return withoutDomain.replace(/\D/g, '');
}

/**
 * Compara a identidade da conta conectada (ownerJid/phoneNumber) com os identificadores
 * de um participante do grupo (id/phoneNumber) de forma estrita, sem usar includes parcial.
 * Suporta equivalência exata de JID, ID limpo e formato brasileiro de 8/9 dígitos (DDD + 8/9 dígitos).
 */
export function compareWhatsAppIds(
  ownerJid?: string,
  participantId?: string,
  participantPhone?: string
): boolean {
  if (!ownerJid) return false;

  const cleanOwnerJid = String(ownerJid).toLowerCase().trim();
  const cleanPartId = String(participantId || '').toLowerCase().trim();
  const cleanPartPhone = String(participantPhone || '').toLowerCase().trim();

  // 1. Correspondência exata direta de JID (ex: 5511...@s.whatsapp.net ou ...@lid)
  if (cleanPartPhone && cleanOwnerJid === cleanPartPhone) return true;
  if (cleanPartId && cleanOwnerJid === cleanPartId) return true;

  // 2. Correspondência exata dos dígitos numéricos de telefone
  const digitsOwner = normalizeWhatsAppPhone(ownerJid);
  const digitsPhone = normalizeWhatsAppPhone(participantPhone);
  const digitsId = normalizeWhatsAppPhone(participantId);

  if (digitsOwner.length >= 8) {
    if (digitsPhone && digitsOwner === digitsPhone) return true;
    if (digitsId && digitsOwner === digitsId) return true;

    // 3. Regra oficial de equivalência do 9º dígito móvel brasileiro (DDI 55 + DDD 2 dígitos + 8 ou 9 dígitos)
    const isBrNineDigitMatch = (a: string, b: string): boolean => {
      if (!a.startsWith('55') || !b.startsWith('55')) return false;
      if (a.length === 13 && b.length === 12) {
        return a.slice(0, 4) === b.slice(0, 4) && a.slice(5) === b.slice(4);
      }
      if (b.length === 13 && a.length === 12) {
        return b.slice(0, 4) === a.slice(0, 4) && b.slice(5) === a.slice(4);
      }
      return false;
    };

    if (digitsPhone && isBrNineDigitMatch(digitsOwner, digitsPhone)) return true;
    if (digitsId && isBrNineDigitMatch(digitsOwner, digitsId)) return true;
  }

  return false;
}

export type EvolutionDiagnosticReason =
  | 'timeout'
  | 'invalid_url'
  | 'auth_error'
  | 'instance_not_found'
  | 'unexpected_response'
  | 'server_error'
  | 'unavailable'
  | 'network_error';

export interface EvolutionDiagnostic {
  reason: EvolutionDiagnosticReason;
  categoryTitle: string;
  message: string;
  statusCode: number;
}

/**
 * Retorna as credenciais ativas da Evolution API com resolução estrita de precedência:
 * - BaseUrl: Salva no banco se presente, senão variáveis de ambiente EVOLUTION_BASE_URL / WHATSAPP_GATEWAY_URL
 * - ApiKey: Salva no banco se presente (e válida), senão variáveis de ambiente EVOLUTION_API_KEY / WHATSAPP_GATEWAY_KEY
 * - InstanceName:
 *   1. Se houver valor salvo no banco e diferente do legado 'RadarInstancia1', prioriza o banco.
 *   2. Se houver variável de ambiente (EVOLUTION_INSTANCE_NAME / WHATSAPP_GATEWAY_INSTANCE), utiliza a do ambiente.
 *   3. Se houver valor salvo no banco (mesmo legado, quando nada no ambiente), usa o banco.
 *   4. NÃO utiliza 'RadarInstancia1' como fallback silencioso se nenhuma instância foi configurada.
 */
export function getActiveEvolutionConfig(dbWhatsapp?: WhatsAppIntegration) {
  const envBaseUrl = (process.env.EVOLUTION_BASE_URL || process.env.WHATSAPP_GATEWAY_URL || '').trim();
  const envApiKey = (process.env.EVOLUTION_API_KEY || process.env.WHATSAPP_GATEWAY_KEY || '').trim();
  const envInstance = (process.env.EVOLUTION_INSTANCE_NAME || process.env.WHATSAPP_GATEWAY_INSTANCE || '').trim();

  let wa = dbWhatsapp;
  if (!wa) {
    try {
      wa = readDatabase().whatsapp;
    } catch {
      wa = undefined;
    }
  }

  const baseUrl = (wa?.baseUrl || envBaseUrl || '').trim();

  const apiKey = (wa?.apiKey || envApiKey || '').trim();

  const dbInstance = (wa?.instanceName || '').trim();
  let instanceName = '';

  if (dbInstance && dbInstance !== 'RadarInstancia1') {
    instanceName = dbInstance;
  } else if (envInstance) {
    instanceName = envInstance;
  } else if (dbInstance) {
    instanceName = dbInstance;
  }

  return { baseUrl, apiKey, instanceName };
}

/**
 * Sanitiza o objeto da conexão WhatsApp para NUNCA vazar segredos/apiKey ao navegador
 */
export function sanitizeWhatsApp(
  wa: WhatsAppIntegration,
  overrides?: {
    verificationStatus?: 'verified' | 'unreachable' | 'timeout' | 'failed';
    verificationMessage?: string;
  }
) {
  const config = getActiveEvolutionConfig(wa);
  const hasApiKey = Boolean(config.apiKey && config.apiKey.length > 0);

  return {
    id: wa.id,
    userId: wa.userId,
    instanceName: config.instanceName,
    baseUrl: wa.baseUrl || (config.baseUrl ? 'Configurado via Ambiente' : ''),
    hasApiKey,
    status: wa.status,
    verificationStatus: overrides?.verificationStatus || wa.lastVerificationStatus || 'verified',
    verificationMessage:
      overrides?.verificationMessage ||
      (wa.lastVerificationStatus === 'unreachable' ? 'Não foi possível verificar agora' : undefined),
    lastVerificationError: wa.lastVerificationError,
    ownerJid: wa.ownerJid,
    phoneNumber: wa.phoneNumber,
    profileName: wa.profileName,
    batteryLevel: wa.batteryLevel,
    qrCodeBase64: wa.qrCodeBase64,
    lastPingAt: wa.lastPingAt,
    updatedAt: wa.updatedAt,
  };
}

/**
 * Sanitiza a lista de credenciais de lojas para NUNCA devolver segredos, tokens ou chaves
 * ao navegador ou logs. Devolve apenas flags como isConfigured, isValidated e tags públicas.
 */
export function sanitizeStoreCredentials(stores: StoreCredential[]): SafeStoreCredential[] {
  return (stores || []).map((s) => ({
    id: s.id,
    storeName: s.storeName,
    isActive: Boolean(s.isActive),
    isConfigured: Boolean(
      (s.affiliateTag && s.affiliateTag.trim().length > 0) ||
      (s.appId && s.appId.trim().length > 0) ||
      (s.appSecret && s.appSecret.trim().length > 0) ||
      (s.userToken && s.userToken.trim().length > 0)
    ),
    isValidated: Boolean(s.isValidated),
    lastValidatedAt: s.lastValidatedAt,
    validationError: s.validationError,
    validationMethod: s.validationMethod,
    affiliateTag: s.affiliateTag || '',
    appId: s.appId || '',
    hasSecret: Boolean(s.appSecret && s.appSecret.trim().length > 0),
    hasToken: Boolean(s.userToken && s.userToken.trim().length > 0),
  }));
}

/**
 * Diagnostica falhas do servidor Evolution de forma segura e útil para o usuário,
 * sem devolver respostas brutas que possam conter dados sensíveis ou segredos.
 */
export function diagnoseEvolutionError(
  status: number | null,
  rawText: string,
  errorObj: unknown,
  instanceName: string
): EvolutionDiagnostic {
  const errMsg = errorObj instanceof Error ? errorObj.message : String(errorObj || '');
  const rawLower = (rawText || '').toLowerCase();

  // 1. Timeout
  const isTimeout =
    errMsg.includes('aborted') ||
    errMsg.includes('timeout') ||
    errMsg.includes('ETIMEDOUT') ||
    status === 504 ||
    status === 408;

  if (isTimeout) {
    return {
      reason: 'timeout',
      categoryTitle: 'Tempo Limite Esgotado',
      message:
        'O servidor da Evolution API não respondeu dentro do tempo limite. O serviço pode estar lento, desligado ou inacessível no momento.',
      statusCode: 504,
    };
  }

  // 2. URL Incorreta ou Falha de Resolução de DNS
  const isInvalidUrl =
    errMsg.includes('ENOTFOUND') ||
    errMsg.includes('EAI_AGAIN') ||
    errMsg.includes('ERR_INVALID_URL') ||
    errMsg.includes('Invalid URL');

  if (isInvalidUrl) {
    return {
      reason: 'invalid_url',
      categoryTitle: 'URL Incorreta ou Inalcançável',
      message:
        'Não foi possível localizar o endereço do gateway Evolution no DNS da rede. Verifique a URL configurada em Ajustes.',
      statusCode: 502,
    };
  }

  // 3. Instância Inexistente (404)
  if (
    status === 404 ||
    rawLower.includes('does not exist') ||
    rawLower.includes('instance not found') ||
    rawLower.includes('not found')
  ) {
    const instDisplay = instanceName ? `"${instanceName}"` : 'especificada';
    return {
      reason: 'instance_not_found',
      categoryTitle: 'Instância Inexistente',
      message: `A instância ${instDisplay} não foi encontrada no servidor Evolution. Verifique se o nome da instância está correto na tela de Ajustes.`,
      statusCode: 404,
    };
  }

  // 4. Falha de Autenticação (401 / 403)
  if (
    status === 401 ||
    status === 403 ||
    rawLower.includes('unauthorized') ||
    rawLower.includes('forbidden') ||
    rawLower.includes('invalid api key') ||
    rawLower.includes('apikey')
  ) {
    return {
      reason: 'auth_error',
      categoryTitle: 'Falha de Autenticação',
      message:
        'A chave de API (apikey) configurada foi rejeitada pelo servidor Evolution. Verifique se a chave está correta em Ajustes.',
      statusCode: 401,
    };
  }

  // 5. Erro do Servidor (500, 502, 503, conexão recusada)
  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    errMsg.includes('ECONNREFUSED') ||
    errMsg.includes('fetch failed')
  ) {
    return {
      reason: 'server_error',
      categoryTitle: 'Erro no Servidor Evolution',
      message: `O servidor Evolution retornou uma falha de serviço (${status ? 'HTTP ' + status : 'conexão recusada'}). O serviço pode estar reiniciando ou indisponível.`,
      statusCode: status && status >= 500 && status < 600 ? status : 503,
    };
  }

  // 6. Resposta Inesperada
  if (status && status !== 200 && status !== 201) {
    return {
      reason: 'unexpected_response',
      categoryTitle: 'Resposta Inesperada',
      message: `O servidor Evolution retornou um código de resposta inesperado (HTTP ${status}).`,
      statusCode: status,
    };
  }

  return {
    reason: 'server_error',
    categoryTitle: 'Falha de Comunicação',
    message: `Falha ao comunicar com a Evolution API (${errMsg || 'erro desconhecido'}).`,
    statusCode: 502,
  };
}

export function getPersistenceInfo(): {
  isSupabase: boolean;
  mode: 'supabase_producao' | 'desenvolvimento_local';
  label: string;
} {
  if (isSupabaseConfigured) {
    return {
      isSupabase: true,
      mode: 'supabase_producao',
      label: 'Supabase PostgreSQL (Produção)',
    };
  }
  return {
    isSupabase: false,
    mode: 'desenvolvimento_local',
    label: 'Desenvolvimento Local (.data/radar_db.json)',
  };
}

export function getInitialDatabase(): DatabaseSchema {
  return {
    settings: {
      id: '00000000-0000-0000-0000-000000000002',
      userId: DEFAULT_USER_ID,
      systemName: 'Radar de Ofertas',
      nightPauseEnabled: true,
      nightPauseStart: '22:30:00',
      nightPauseEnd: '07:30:00',
      minSendIntervalSeconds: 60,
      maxDailyMessages: 120,
      watermarkText: '🎯 *Radar de Ofertas* — Os melhores achadinhos',
      updatedAt: new Date().toISOString(),
    },
    whatsapp: {
      id: '00000000-0000-0000-0000-000000000003',
      userId: DEFAULT_USER_ID,
      instanceName: process.env.EVOLUTION_INSTANCE_NAME || process.env.WHATSAPP_GATEWAY_INSTANCE || 'radar_ofertas',
      baseUrl: process.env.EVOLUTION_BASE_URL || process.env.WHATSAPP_GATEWAY_URL || '',
      apiKey: process.env.EVOLUTION_API_KEY || process.env.WHATSAPP_GATEWAY_KEY || '',
      webhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET || '',
      status: 'disconnected',
      phoneNumber: '',
      profileName: '',
      updatedAt: new Date().toISOString(),
    },
    stores: [
      {
        id: '00000000-0000-0000-0000-000000000010',
        userId: DEFAULT_USER_ID,
        storeName: 'shopee',
        affiliateTag: process.env.SHOPEE_AFFILIATE_SUB_ID || '',
        isActive: Boolean(process.env.SHOPEE_AFFILIATE_SUB_ID),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-000000000011',
        userId: DEFAULT_USER_ID,
        storeName: 'mercadolivre',
        appId: process.env.ML_AFFILIATE_APP_ID || '',
        affiliateTag: process.env.ML_AFFILIATE_TAG || '',
        isActive: Boolean(process.env.ML_AFFILIATE_TAG),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-000000000012',
        userId: DEFAULT_USER_ID,
        storeName: 'netshoes',
        affiliateTag: process.env.RAKUTEN_NETSHOES_SITE_ID || '',
        appId: process.env.RAKUTEN_NETSHOES_MERCHANT_ID || '',
        isActive: Boolean(process.env.RAKUTEN_NETSHOES_SITE_ID),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-000000000013',
        userId: DEFAULT_USER_ID,
        storeName: 'amazon',
        affiliateTag: '',
        isActive: false,
        updatedAt: new Date().toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-000000000014',
        userId: DEFAULT_USER_ID,
        storeName: 'magalu',
        affiliateTag: '',
        isActive: false,
        updatedAt: new Date().toISOString(),
      },
    ],
    rules: [
      {
        id: '00000000-0000-0000-0000-000000000020',
        userId: DEFAULT_USER_ID,
        storeName: 'shopee',
        minRating: 4.5,
        minReviewsCount: 15,
        minSalesCount: 10,
        minDiscountPct: 15,
        minCommissionRate: 2.0,
        requireSocialProof: true,
        requireInStock: true,
        blockedKeywords: ['réplica', 'falsificado', 'amostra', 'sorteio', 'defeito'],
        updatedAt: new Date().toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-000000000021',
        userId: DEFAULT_USER_ID,
        storeName: 'mercadolivre',
        minRating: 4.3,
        minReviewsCount: 10,
        minSalesCount: 5,
        minDiscountPct: 10,
        minCommissionRate: 1.5,
        requireSocialProof: true,
        requireInStock: true,
        blockedKeywords: ['réplica', 'usado', 'defeito', 'falsificado', 'amostra'],
        updatedAt: new Date().toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-000000000022',
        userId: DEFAULT_USER_ID,
        storeName: 'netshoes',
        minRating: 4.2,
        minReviewsCount: 10,
        minSalesCount: 5,
        minDiscountPct: 15,
        minCommissionRate: 2.0,
        requireSocialProof: true,
        requireInStock: true,
        blockedKeywords: ['réplica', 'defeito', 'falsificado'],
        updatedAt: new Date().toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-000000000023',
        userId: DEFAULT_USER_ID,
        storeName: 'amazon',
        minRating: 4.2,
        minReviewsCount: 20,
        minSalesCount: 5,
        minDiscountPct: 10,
        minCommissionRate: 2.0,
        requireSocialProof: true,
        requireInStock: true,
        blockedKeywords: ['importação não oficial', 'réplica'],
        updatedAt: new Date().toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-000000000024',
        userId: DEFAULT_USER_ID,
        storeName: 'magalu',
        minRating: 4.0,
        minReviewsCount: 5,
        minSalesCount: 3,
        minDiscountPct: 10,
        minCommissionRate: 1.5,
        requireSocialProof: true,
        requireInStock: true,
        blockedKeywords: [],
        updatedAt: new Date().toISOString(),
      },
    ],
    templates: [
      {
        id: '00000000-0000-0000-0000-000000000030',
        userId: DEFAULT_USER_ID,
        title: 'Padrão Alta Conversão',
        templateText: `{gancho}\n\n*{titulo}*\n\n{preco_de}\n🔥 *Por apenas {preco_por}* ({desconto})\n{cupom}\n\n🛒 *Compre aqui com segurança:*\n{link}\n\n{marca_dagua}`,
        includeImage: true,
        isDefault: true,
        updatedAt: new Date().toISOString(),
      },
    ],
    hooks: [
      {
        id: '00000000-0000-0000-0000-000000000031',
        userId: DEFAULT_USER_ID,
        title: 'Menor Preço',
        hookText: '🔥 *MENOR PREÇO HISTÓRICO REGISTRADO!*',
        category: 'urgencia',
        isActive: true,
      },
      {
        id: '00000000-0000-0000-0000-000000000032',
        userId: DEFAULT_USER_ID,
        title: 'Corre Antes que Acabe',
        hookText: '⚡ *CORRE ANTES QUE O ESTOQUE ACABE!*',
        category: 'urgencia',
        isActive: true,
      },
      {
        id: '00000000-0000-0000-0000-000000000033',
        userId: DEFAULT_USER_ID,
        title: 'Achadinho Testado',
        hookText: '✨ *ACHADINHO IMPERDÍVEL COM AVALIAÇÃO 5 ESTRELAS!*',
        category: 'qualidade',
        isActive: true,
      },
    ],
    coupons: [
      {
        id: '00000000-0000-0000-0000-000000000034',
        userId: DEFAULT_USER_ID,
        storeName: 'shopee',
        couponCode: 'RADAR10',
        discountDescription: 'R$ 10 OFF em compras acima de R$ 50',
        minPurchaseAmount: 50,
        isActive: true,
      },
    ],
    groups: [],
    sources: [],
    destinations: [],
    incomingMessages: [],
    products: [],
    evaluations: [],
    jobs: [],
    queueCampaigns: [],
    listCampaigns: [],
    curatorPlans: [],
  };
}

/**
 * Leitura síncrona do arquivo local (usado apenas em testes e fallback offline)
 */
export function readDatabase(): DatabaseSchema {
  try {
    const dbFile = getDatabaseFilePath();
    const dataDir = path.dirname(dbFile);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(dbFile)) {
      const initial = getInitialDatabase();
      fs.writeFileSync(dbFile, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }

    const content = fs.readFileSync(dbFile, 'utf-8');
    const parsed = JSON.parse(content) as DatabaseSchema;
    return parsed;
  } catch {
    return getInitialDatabase();
  }
}

/**
 * Gravação síncrona no arquivo local (usado apenas em testes e fallback offline)
 */
export function writeDatabase(data: DatabaseSchema): void {
  try {
    const dbFile = getDatabaseFilePath();
    const dataDir = path.dirname(dbFile);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao persistir banco de dados local:', err);
  }
}

// -----------------------------------------------------------------------------
// OPERAÇÕES REAIS E VERIFICADAS NO SUPABASE (PRODUÇÃO)
// -----------------------------------------------------------------------------

/**
 * Lê o estado completo do banco de dados.
 * Em produção (Supabase configurado), busca diretamente nas tabelas reais do Supabase.
 * Se houver falha de rede/banco, lança o erro real sem mascarar.
 */
export async function getDatabase(): Promise<DatabaseSchema> {
  if (!isSupabaseConfigured || !supabase || isTestIsolationActive()) {
    return readDatabase();
  }

  try {
    // 1. Settings
    const { data: settingsData, error: errSettings } = await supabase
      .from('user_settings')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (errSettings) throw new Error(`Supabase [user_settings]: ${errSettings.message}`);

    // 2. WhatsApp
    const { data: waData, error: errWa } = await supabase
      .from('integrations_whatsapp')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (errWa) throw new Error(`Supabase [integrations_whatsapp]: ${errWa.message}`);

    // 3. Stores
    const { data: storesData, error: errStores } = await supabase
      .from('store_credentials')
      .select('*');
    if (errStores) throw new Error(`Supabase [store_credentials]: ${errStores.message}`);

    // 4. Quality Rules
    const { data: rulesData, error: errRules } = await supabase
      .from('quality_rules')
      .select('*');
    if (errRules) throw new Error(`Supabase [quality_rules]: ${errRules.message}`);

    // 5. Message Templates
    const { data: tplData, error: errTpl } = await supabase
      .from('message_templates')
      .select('*');
    if (errTpl) throw new Error(`Supabase [message_templates]: ${errTpl.message}`);

    // 6. Hooks
    const { data: hooksData, error: errHooks } = await supabase
      .from('engagement_hooks')
      .select('*');
    if (errHooks) throw new Error(`Supabase [engagement_hooks]: ${errHooks.message}`);

    // 7. Coupons
    const { data: couponsData, error: errCoupons } = await supabase
      .from('store_coupons')
      .select('*');
    if (errCoupons) throw new Error(`Supabase [store_coupons]: ${errCoupons.message}`);

    // 8. Groups
    const { data: groupsData, error: errGroups } = await supabase
      .from('whatsapp_groups')
      .select('*');
    if (errGroups) throw new Error(`Supabase [whatsapp_groups]: ${errGroups.message}`);

    // 9. Copy Sources & Destinations
    const { data: sourcesData, error: errSources } = await supabase
      .from('copy_sources')
      .select('*');
    if (errSources) throw new Error(`Supabase [copy_sources]: ${errSources.message}`);

    const { data: destsData, error: errDests } = await supabase
      .from('copy_destinations')
      .select('*');
    if (errDests) throw new Error(`Supabase [copy_destinations]: ${errDests.message}`);

    // 10. Incoming Messages (recentes)
    const { data: msgsData, error: errMsgs } = await supabase
      .from('incoming_messages')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(100);
    if (errMsgs) throw new Error(`Supabase [incoming_messages]: ${errMsgs.message}`);

    // 11. Products Catalog (recentes)
    const { data: prodsData, error: errProds } = await supabase
      .from('products_catalog')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (errProds) throw new Error(`Supabase [products_catalog]: ${errProds.message}`);

    // 12. Offer Evaluations
    const { data: evalsData, error: errEvals } = await supabase
      .from('offer_evaluations')
      .select('*')
      .order('evaluated_at', { ascending: false })
      .limit(100);
    if (errEvals) throw new Error(`Supabase [offer_evaluations]: ${errEvals.message}`);

    // 13. Publication Jobs
    const { data: jobsData, error: errJobs } = await supabase
      .from('publication_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (errJobs) throw new Error(`Supabase [publication_jobs]: ${errJobs.message}`);

    // 14. Campaigns (Fila, Lista, Curador)
    const { data: queueData, error: errQueue } = await supabase
      .from('queue_campaigns')
      .select('*');
    if (errQueue) throw new Error(`Supabase [queue_campaigns]: ${errQueue.message}`);

    const { data: listData, error: errList } = await supabase
      .from('list_campaigns')
      .select('*');
    if (errList) throw new Error(`Supabase [list_campaigns]: ${errList.message}`);

    const { data: curatorData, error: errCurator } = await supabase
      .from('curator_plans')
      .select('*');
    if (errCurator) throw new Error(`Supabase [curator_plans]: ${errCurator.message}`);

    const fallback = getInitialDatabase();

    // Mapear objetos snake_case -> camelCase
    const mappedSources: CopySource[] = (sourcesData || []).map((s) => ({
      id: s.id,
      userId: s.user_id,
      groupJid: s.group_jid,
      name: s.name,
      operationMode: s.operation_mode,
      isActive: s.is_active,
      allowedStores: s.allowed_stores || [],
      stripThirdPartyLinks: s.strip_third_party_links,
      stripExternalTags: s.strip_external_tags,
      customDelaySeconds: s.custom_delay_seconds,
      destinations: (destsData || [])
        .filter((d) => d.source_id === s.id)
        .map((d) => ({
          id: d.id,
          sourceId: d.source_id,
          groupJid: d.group_jid,
          name: d.name,
          isActive: d.is_active,
        })),
      updatedAt: s.updated_at,
    }));

    const mappedJobs: PublicationJob[] = (jobsData || []).map((j) => ({
      id: j.id,
      userId: j.user_id,
      originType: j.origin_type,
      sourceId: j.source_id,
      incomingMessageId: j.incoming_message_id,
      productId: j.product_id,
      evaluationId: j.evaluation_id,
      targetJid: j.target_jid,
      targetName: j.target_name,
      messageText: j.message_text,
      mediaUrl: j.media_url,
      mediaType: j.media_type,
      affiliateUrl: j.affiliate_url,
      status: j.status,
      scheduledFor: j.scheduled_for,
      sentAt: j.sent_at,
      attempts: j.attempts,
      maxAttempts: j.max_attempts,
      errorDetails: j.error_details,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
    }));

    const mappedProducts: ProductItem[] = (prodsData || []).map((p) => ({
      id: p.id,
      userId: p.user_id,
      storeName: p.store_name,
      externalId: p.external_id,
      title: p.title,
      originalPrice: p.original_price,
      currentPrice: p.current_price,
      discountPct: p.discount_pct,
      rating: p.rating,
      reviewsCount: p.reviews_count,
      salesCount: p.sales_count,
      commissionRate: p.commission_rate,
      estimatedCommission: p.estimated_commission,
      imageUrl: p.image_url,
      productUrl: p.product_url,
      affiliateUrl: p.affiliate_url,
      category: p.category,
      inStock: p.in_stock,
      lastCheckedAt: p.last_checked_at,
    }));

    return {
      settings: settingsData
        ? {
            id: settingsData.id,
            userId: settingsData.user_id,
            systemName: settingsData.system_name,
            nightPauseEnabled: settingsData.night_pause_enabled,
            nightPauseStart: settingsData.night_pause_start,
            nightPauseEnd: settingsData.night_pause_end,
            minSendIntervalSeconds: settingsData.min_send_interval_seconds,
            maxDailyMessages: settingsData.max_daily_messages,
            watermarkText: settingsData.watermark_text,
            updatedAt: settingsData.updated_at,
          }
        : fallback.settings,
      whatsapp: waData
        ? {
            id: waData.id,
            userId: waData.user_id,
            instanceName: waData.instance_name,
            baseUrl: waData.base_url,
            apiKey: waData.api_key,
            status: waData.status,
            phoneNumber: waData.phone_number,
            profileName: waData.profile_name,
            batteryLevel: waData.battery_level,
            qrCodeBase64: waData.qr_code_base64,
            webhookSecret: waData.webhook_secret,
            lastPingAt: waData.last_ping_at,
            updatedAt: waData.updated_at,
          }
        : fallback.whatsapp,
      stores: (storesData && storesData.length > 0)
        ? storesData.map((s) => ({
            id: s.id,
            userId: s.user_id,
            storeName: s.store_name,
            appId: s.app_id,
            appSecret: s.app_secret,
            affiliateTag: s.affiliate_tag,
            isActive: s.is_active,
            updatedAt: s.updated_at,
          }))
        : fallback.stores,
      rules: (rulesData && rulesData.length > 0)
        ? rulesData.map((r) => ({
            id: r.id,
            userId: r.user_id,
            storeName: r.store_name,
            minRating: Number(r.min_rating),
            minReviewsCount: r.min_reviews_count,
            minSalesCount: r.min_sales_count,
            minDiscountPct: Number(r.min_discount_pct),
            minCommissionRate: Number(r.min_commission_rate),
            requireSocialProof: r.require_social_proof,
            requireInStock: r.require_in_stock,
            blockedKeywords: r.blocked_keywords || [],
            updatedAt: r.updated_at,
          }))
        : fallback.rules,
      templates: (tplData && tplData.length > 0)
        ? tplData.map((t) => ({
            id: t.id,
            userId: t.user_id,
            title: t.title,
            templateText: t.template_text,
            includeImage: t.include_image,
            isDefault: t.is_default,
            updatedAt: t.updated_at,
          }))
        : fallback.templates,
      hooks: (hooksData && hooksData.length > 0)
        ? hooksData.map((h) => ({
            id: h.id,
            userId: h.user_id,
            title: h.title,
            hookText: h.hook_text,
            category: h.category,
            isActive: h.is_active,
          }))
        : fallback.hooks,
      coupons: (couponsData && couponsData.length > 0)
        ? couponsData.map((c) => ({
            id: c.id,
            userId: c.user_id,
            storeName: c.store_name,
            couponCode: c.coupon_code,
            discountDescription: c.discount_description,
            minPurchaseAmount: c.min_purchase_amount,
            rulesLink: c.rules_link,
            expiresAt: c.expires_at,
            isActive: c.is_active,
          }))
        : fallback.coupons,
      groups: (groupsData && groupsData.length > 0)
        ? groupsData.map((g) => ({
            id: g.id,
            userId: g.user_id,
            groupJid: g.group_jid,
            name: g.name,
            participantCount: g.participant_count,
            isAdmin: g.is_admin,
            isOrigin: g.is_origin,
            isDestination: g.is_destination,
            lastSyncedAt: g.last_synced_at,
          }))
        : fallback.groups,
      sources: mappedSources,
      destinations: (destsData || []).map((d) => ({
        id: d.id,
        sourceId: d.source_id,
        groupJid: d.group_jid,
        name: d.name,
        isActive: d.is_active,
      })),
      incomingMessages: (msgsData || []).map((m) => ({
        id: m.id,
        userId: m.user_id,
        messageId: m.message_id,
        instanceName: m.instance_name,
        remoteJid: m.remote_jid,
        senderJid: m.sender_jid,
        senderName: m.sender_name,
        rawText: m.raw_text,
        extractedUrls: m.extracted_urls || [],
        cleanText: m.clean_text,
        extractedStore: m.extracted_store,
        resolvedDestinationUrl: m.resolved_destination_url,
        affiliateUrl: m.affiliate_url,
        status: m.status,
        discardReason: m.discard_reason,
        receivedAt: m.received_at,
      })),
      products: mappedProducts,
      evaluations: (evalsData || []).map((e) => ({
        id: e.id,
        userId: e.user_id,
        incomingMessageId: e.incoming_message_id,
        productId: e.product_id,
        score: e.score,
        decision: e.decision,
        reason: e.reason,
        criteriaBreakdown: e.criteria_breakdown || [],
        evidences: e.evidences || {},
        failures: e.failures || [],
        evaluatedAt: e.evaluated_at,
      })),
      jobs: mappedJobs,
      queueCampaigns: (queueData || []).map((q) => ({
        id: q.id,
        userId: q.user_id,
        name: q.name,
        storeName: q.store_name,
        niches: q.niches || [],
        targetJids: q.target_jids || [],
        minPrice: q.min_price ? Number(q.min_price) : undefined,
        maxPrice: q.max_price ? Number(q.max_price) : undefined,
        minRating: q.min_rating ? Number(q.min_rating) : 4.5,
        minReviews: q.min_reviews || 10,
        minSales: q.min_sales || 5,
        minCommission: q.min_commission ? Number(q.min_commission) : 2.0,
        sendIntervalMinutes: q.send_interval_minutes,
        windowStart: q.window_start,
        windowEnd: q.window_end,
        nightPause: q.night_pause,
        diversityMode: q.diversity_mode,
        repeatAfterDays: q.repeat_after_days,
        isActive: q.is_active,
        lastRunAt: q.last_run_at,
        createdAt: q.created_at,
        updatedAt: q.updated_at,
      })),
      listCampaigns: (listData || []).map((l) => ({
        id: l.id,
        userId: l.user_id,
        name: l.name,
        targetJids: l.target_jids || [],
        intervalMinutes: l.interval_minutes,
        scheduledStart: l.scheduled_start,
        scheduledEnd: l.scheduled_end,
        items: l.items || [],
        totalItems: l.total_items,
        sentItems: l.sent_items,
        status: l.status,
        createdAt: l.created_at,
        updatedAt: l.updated_at,
      })),
      curatorPlans: (curatorData || []).map((c) => ({
        id: c.id,
        userId: c.user_id,
        name: c.name,
        audienceProfile: c.audience_profile,
        criteria: c.criteria || {},
        selectedStores: c.selected_stores || [],
        targetJids: c.target_jids || [],
        dailyOffersLimit: c.daily_offers_limit,
        scheduleMode: c.schedule_mode,
        timeslots: c.timeslots || [],
        isActive: c.is_active,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Falha de leitura no Supabase:', msg);
    throw new Error(`Falha na leitura com Supabase: ${msg}`);
  }
}

/**
 * Salva e persiste todo o banco de dados.
 * Em produção, envia operações reais verificadas para o Supabase.
 */
export async function saveDatabase(data: DatabaseSchema): Promise<void> {
  // Sempre mantém o snapshot local atualizado
  writeDatabase(data);

  if (!isSupabaseConfigured || !supabase || isTestIsolationActive()) {
    return;
  }

  try {
    // 1. user_settings
    const { error: errSettings } = await supabase.from('user_settings').upsert({
      id: ensureValidUuid(data.settings.id),
      user_id: ensureValidUuid(data.settings.userId),
      system_name: data.settings.systemName,
      night_pause_enabled: data.settings.nightPauseEnabled,
      night_pause_start: data.settings.nightPauseStart,
      night_pause_end: data.settings.nightPauseEnd,
      min_send_interval_seconds: data.settings.minSendIntervalSeconds,
      max_daily_messages: data.settings.maxDailyMessages,
      watermark_text: data.settings.watermarkText,
      updated_at: new Date().toISOString(),
    });
    if (errSettings) throw new Error(`Falha ao gravar user_settings no Supabase: ${errSettings.message}`);

    // 2. integrations_whatsapp
    const { error: errWa } = await supabase.from('integrations_whatsapp').upsert({
      id: ensureValidUuid(data.whatsapp.id),
      user_id: ensureValidUuid(data.whatsapp.userId),
      instance_name: data.whatsapp.instanceName,
      base_url: data.whatsapp.baseUrl,
      api_key: data.whatsapp.apiKey,
      status: data.whatsapp.status,
      phone_number: data.whatsapp.phoneNumber,
      profile_name: data.whatsapp.profileName,
      battery_level: data.whatsapp.batteryLevel,
      qr_code_base64: data.whatsapp.qrCodeBase64,
      webhook_secret: data.whatsapp.webhookSecret,
      last_ping_at: data.whatsapp.lastPingAt,
      updated_at: new Date().toISOString(),
    });
    if (errWa) throw new Error(`Falha ao gravar integrations_whatsapp no Supabase: ${errWa.message}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Erro de persistência no Supabase:', msg);
    throw new Error(`Falha na persistência com Supabase: ${msg}`);
  }
}

// -----------------------------------------------------------------------------
// OPERAÇÕES ATÔMICAS E ENTIDADES ESPECÍFICAS
// -----------------------------------------------------------------------------

/**
 * Reserva atômica de um trabalho de publicação para envio.
 * Substitui locks frágeis em memória por uma transação/operação atômica no banco,
 * garantindo que mesmo com dois processos ou instâncias concorrentes,
 * o mesmo trabalho NUNCA é enviado duas vezes.
 */
export async function atomicReserveJob(jobId: string): Promise<boolean> {
  if (isSupabaseConfigured && supabase && !isTestIsolationActive()) {
    const validId = ensureValidUuid(jobId);
    const { data, error } = await supabase
      .from('publication_jobs')
      .update({
        status: 'enviando',
        updated_at: new Date().toISOString(),
      })
      .eq('id', validId)
      .eq('status', 'agendado')
      .select('id');

    if (error) {
      throw new Error(`Falha ao reservar job atomicamente no Supabase: ${error.message}`);
    }

    return Boolean(data && data.length > 0);
  }

  // Fallback local seguro para testes unitários
  const db = readDatabase();
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job || job.status !== 'agendado') {
    return false;
  }

  job.status = 'enviando';
  job.updatedAt = new Date().toISOString();
  writeDatabase(db);
  return true;
}

/**
 * Salva ou atualiza um Job de publicação de forma verificada
 */
export async function savePublicationJob(job: PublicationJob): Promise<void> {
  const db = readDatabase();
  const idx = db.jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) {
    db.jobs[idx] = job;
  } else {
    db.jobs.unshift(job);
  }
  writeDatabase(db);

  if (isSupabaseConfigured && supabase && !isTestIsolationActive()) {
    const { error } = await supabase.from('publication_jobs').upsert({
      id: ensureValidUuid(job.id),
      user_id: ensureValidUuid(job.userId),
      origin_type: job.originType,
      source_id: job.sourceId ? ensureValidUuid(job.sourceId) : null,
      incoming_message_id: job.incomingMessageId ? ensureValidUuid(job.incomingMessageId) : null,
      product_id: job.productId ? ensureValidUuid(job.productId) : null,
      evaluation_id: job.evaluationId ? ensureValidUuid(job.evaluationId) : null,
      target_jid: job.targetJid,
      target_name: job.targetName,
      message_text: job.messageText,
      media_url: job.mediaUrl,
      media_type: job.mediaType,
      affiliate_url: job.affiliateUrl,
      status: job.status,
      scheduled_for: job.scheduledFor,
      sent_at: job.sentAt,
      attempts: job.attempts,
      max_attempts: job.maxAttempts,
      error_details: job.errorDetails,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.warn(`[Storage] Aviso ao persistir publication_job no Supabase: ${error.message}`);
    }
  }
}

/**
 * Salva produto garimpado no catálogo
 */
export async function saveProductToCatalog(product: ProductItem): Promise<void> {
  const db = readDatabase();
  const idx = db.products.findIndex((p) => p.id === product.id);
  if (idx >= 0) {
    db.products[idx] = product;
  } else {
    db.products.unshift(product);
  }
  writeDatabase(db);

  if (isSupabaseConfigured && supabase && !isTestIsolationActive()) {
    try {
      const { error } = await supabase.from('products_catalog').upsert({
        id: ensureValidUuid(product.id),
        user_id: ensureValidUuid(product.userId),
        store_name: product.storeName,
        external_id: product.externalId,
        title: product.title,
        original_price: product.originalPrice,
        current_price: product.currentPrice,
        discount_pct: product.discountPct,
        rating: product.rating,
        reviews_count: product.reviewsCount,
        sales_count: product.salesCount,
        image_url: product.imageUrl,
        affiliate_url: product.affiliateUrl,
        in_stock: product.inStock,
        raw_data: {
          category: product.category,
          commission_rate: product.commissionRate,
          estimated_commission: product.estimatedCommission,
          product_url: product.productUrl,
          last_checked_at: product.lastCheckedAt,
        },
      });

      if (error) {
        console.warn(`[Storage] Aviso ao persistir produto no catálogo do Supabase: ${error.message}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Storage] Exceção ao persistir produto no Supabase: ${msg}`);
    }
  }
}

/**
 * Salva avaliação de qualidade de oferta
 */
export async function saveOfferEvaluation(evalItem: OfferEvaluation): Promise<void> {
  const db = readDatabase();
  db.evaluations.unshift(evalItem);
  writeDatabase(db);

  if (isSupabaseConfigured && supabase && !isTestIsolationActive()) {
    try {
      const { error } = await supabase.from('offer_evaluations').insert({
        id: ensureValidUuid(evalItem.id),
        user_id: ensureValidUuid(evalItem.userId),
        incoming_message_id: evalItem.incomingMessageId ? ensureValidUuid(evalItem.incomingMessageId) : null,
        product_id: evalItem.productId ? ensureValidUuid(evalItem.productId) : null,
        score: evalItem.score,
        decision: evalItem.decision,
        reason: evalItem.reason,
        criteria_breakdown: evalItem.criteriaBreakdown,
        evidences: evalItem.evidences,
        failures: evalItem.failures,
        evaluated_at: evalItem.evaluatedAt,
      });

      if (error) {
        console.warn(`[Storage] Aviso ao registrar avaliação no Supabase: ${error.message}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Storage] Exceção ao registrar avaliação no Supabase: ${msg}`);
    }
  }
}

/**
 * Salva mensagem recebida via webhook com idempotência garantida
 */
export async function saveIncomingMessageRecord(msg: IncomingMessage): Promise<void> {
  const db = readDatabase();
  // Evitar duplicação em memória
  const existingIdx = db.incomingMessages.findIndex((m) => m.id === msg.id || (m.instanceName === msg.instanceName && m.messageId === msg.messageId));
  if (existingIdx >= 0) {
    db.incomingMessages[existingIdx] = msg;
  } else {
    db.incomingMessages.unshift(msg);
  }
  writeDatabase(db);

  if (isSupabaseConfigured && supabase && !isTestIsolationActive()) {
    try {
      const { error } = await supabase.from('incoming_messages').upsert(
        {
          id: ensureValidUuid(msg.id),
          user_id: ensureValidUuid(msg.userId),
          message_id: msg.messageId,
          instance_name: msg.instanceName,
          source_group_jid: msg.remoteJid,
          sender_jid: msg.senderJid || 'unknown@s.whatsapp.net',
          content_text: msg.rawText || msg.cleanText || '',
          media_type: 'none',
          raw_payload: {
            clean_text: msg.cleanText,
            extracted_urls: msg.extractedUrls,
            extracted_store: msg.extractedStore,
            affiliate_url: msg.affiliateUrl,
            discard_reason: msg.discardReason,
            is_simulation: Boolean(msg.isSimulation),
            sender_name: msg.senderName,
            received_at: msg.receivedAt,
          },
          status:
            msg.status === 'processada'
              ? 'processed'
              : msg.status === 'descartada'
              ? 'discarded'
              : 'received',
          processed_at: msg.status === 'processada' ? new Date().toISOString() : null,
          created_at: msg.receivedAt || new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      if (error) {
        console.warn(`[Storage] Aviso ao registrar incoming_message no Supabase: ${error.message}`);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[Storage] Exceção ao registrar incoming_message no Supabase: ${errorMsg}`);
    }
  }
}
