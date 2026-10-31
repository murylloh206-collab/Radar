// Tipos fundamentais do Radar de Ofertas

export type StoreName = 'shopee' | 'mercadolivre' | 'netshoes' | 'amazon' | 'magalu';

export type JobStatus = 
  | 'rascunho'
  | 'aguardando_aprovacao'
  | 'agendado'
  | 'enviando'
  | 'enviado'
  | 'falha'
  | 'cancelado'
  | 'quarentena';

export type IncomingMessageStatus = 
  | 'recebida'
  | 'processada'
  | 'descartada'
  | 'erro';

export type EvaluationDecision = 'aprovado' | 'rejeitado' | 'pendente';

export type LinkState = 'gerado' | 'confirmado_pela_integracao' | 'apto_para_envio';

export interface UserSettings {
  id: string;
  userId: string;
  userEmail?: string;
  systemName: string;
  nightPauseEnabled: boolean;
  nightPauseStart: string; // '22:30:00'
  nightPauseEnd: string; // '07:30:00'
  minSendIntervalSeconds: number;
  maxDailyMessages: number;
  watermarkText?: string;
  updatedAt: string;
}

export interface WhatsAppIntegration {
  id: string;
  userId: string;
  instanceName: string;
  baseUrl: string;
  apiKey: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'qrcode';
  ownerJid?: string;
  groupsOwnerJid?: string;
  phoneNumber?: string;
  profileName?: string;
  batteryLevel?: number;
  qrCodeBase64?: string;
  webhookSecret?: string;
  webhookUrl?: string;
  lastPingAt?: string;
  lastVerificationStatus?: 'verified' | 'unreachable' | 'timeout' | 'failed';
  lastVerificationError?: string;
  lastWebhookReceivedAt?: string;
  lastRealWebhookAt?: string;
  lastWorkerCycleAt?: string;
  updatedAt: string;
}

export interface StoreCredential {
  id: string;
  userId: string;
  storeName: StoreName;
  appId?: string;
  appSecret?: string;
  affiliateTag?: string;
  userToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  extraParams?: Record<string, unknown>;
  isActive: boolean;
  isValidated?: boolean;
  lastValidatedAt?: string;
  validationError?: string;
  validationMethod?: string;
  updatedAt: string;
}

export interface SafeStoreCredential {
  id: string;
  storeName: StoreName;
  isActive: boolean;
  isConfigured: boolean;
  isValidated: boolean;
  lastValidatedAt?: string;
  validationError?: string;
  validationMethod?: string;
  affiliateTag?: string;
  appId?: string;
  hasSecret: boolean;
  hasToken: boolean;
}

export interface QualityRule {
  id: string;
  userId: string;
  storeName: StoreName;
  minRating: number;
  minReviewsCount: number;
  minSalesCount: number;
  minDiscountPct: number;
  minCommissionRate: number;
  requireSocialProof: boolean;
  requireInStock: boolean;
  blockedKeywords: string[];
  updatedAt: string;
}

export interface MessageTemplate {
  id: string;
  userId: string;
  title: string;
  templateText: string;
  includeImage: boolean;
  isDefault: boolean;
  updatedAt: string;
}

export interface EngagementHook {
  id: string;
  userId: string;
  title: string;
  hookText: string;
  category: string;
  isActive: boolean;
}

export interface StoreCoupon {
  id: string;
  userId: string;
  storeName: StoreName;
  couponCode: string;
  discountDescription: string;
  minPurchaseAmount?: number;
  rulesLink?: string;
  expiresAt?: string;
  isActive: boolean;
}

export interface WhatsAppGroup {
  id: string;
  userId: string;
  groupJid: string;
  name: string;
  participantCount: number;
  isAdmin: boolean;
  canPost?: boolean;
  permissionStatus?: 'verified_admin' | 'verified_member' | 'unverified' | 'restricted_readonly';
  isAnnounce?: boolean;
  roleDescription?: string;
  isOrigin: boolean;
  isDestination: boolean;
  isTestGroup?: boolean;
  lastSyncedAt: string;
}

export interface CopySource {
  id: string;
  userId: string;
  groupJid: string;
  name: string;
  operationMode: 'revisao_manual' | 'automatico';
  isActive: boolean;
  allowedStores: StoreName[];
  stripThirdPartyLinks: boolean;
  stripExternalTags: boolean;
  customDelaySeconds: number;
  templateText?: string;
  imageMode?: 'radar_art' | 'official_photo' | 'none';
  startTime?: string;
  endTime?: string;
  convertAffiliateLinks?: boolean;
  isTestMode?: boolean;
  testGroupJid?: string;
  isDemo?: boolean;
  destinations?: CopyDestination[];
  updatedAt: string;
}

export interface CopyDestination {
  id: string;
  sourceId: string;
  groupJid: string;
  name: string;
  canPost?: boolean;
  isActive: boolean;
}

export interface IncomingMessage {
  id: string;
  userId: string;
  messageId: string;
  instanceName: string;
  remoteJid: string;
  senderJid?: string;
  senderName?: string;
  rawText: string;
  extractedUrls: string[];
  cleanText?: string;
  extractedStore?: StoreName;
  resolvedDestinationUrl?: string;
  affiliateUrl?: string;
  status: IncomingMessageStatus;
  discardReason?: string;
  isSimulation?: boolean;
  originGroupName?: string;
  receivedAt: string;
}

export interface ProductItem {
  id: string;
  userId: string;
  storeName: StoreName;
  externalId: string;
  title: string;
  originalPrice?: number;
  currentPrice: number;
  discountPct: number;
  rating?: number;
  reviewsCount?: number;
  salesCount?: number;
  commissionRate?: number;
  estimatedCommission?: number;
  imageUrl?: string;
  productUrl: string;
  affiliateUrl: string;
  category?: string;
  inStock: boolean;
  lastCheckedAt: string;
}

export interface OfferEvaluation {
  id: string;
  userId: string;
  incomingMessageId?: string;
  productId?: string;
  score: number; // 0 a 100
  decision: EvaluationDecision;
  reason: string;
  criteriaBreakdown: {
    name: string;
    score: number;
    weight: number;
    passed: boolean;
    detail: string;
  }[];
  evidences: Record<string, unknown>;
  failures: string[];
  evaluatedAt: string;
}

export interface PublicationJob {
  id: string;
  userId: string;
  originType: 'manual' | 'copiador' | 'fila' | 'lista' | 'curador';
  sourceId?: string;
  incomingMessageId?: string;
  productId?: string;
  evaluationId?: string;
  targetJid: string;
  targetName?: string;
  messageText: string;
  mediaUrl?: string;
  mediaType: 'image' | 'video' | 'none';
  originalUrl?: string;
  cleanUrl?: string;
  affiliateUrl: string;
  status: JobStatus;
  scheduledFor: string;
  sentAt?: string;
  attempts: number;
  maxAttempts: number;
  errorDetails?: string;
  quarantineReason?: string;
  linkVerified?: boolean;
  linkVerificationDetails?: string;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QueueCampaign {
  id: string;
  userId: string;
  name: string;
  storeName: StoreName;
  niches: string[];
  targetJids: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating: number;
  minReviews: number;
  minSales: number;
  minCommission: number;
  sendIntervalMinutes: number;
  windowStart: string;
  windowEnd: string;
  nightPause: boolean;
  diversityMode: 'off' | 'moderate' | 'high';
  repeatAfterDays: number;
  isActive: boolean;
  lastRunAt?: string;
  updatedAt: string;
}

export interface ListCampaign {
  id: string;
  userId: string;
  name: string;
  targetJids: string[];
  intervalMinutes: number;
  scheduledStart: string;
  scheduledEnd?: string;
  items: {
    id: string;
    title: string;
    url: string;
    affiliateUrl?: string;
    price?: number;
    status: 'pendente' | 'enviado' | 'erro';
  }[];
  totalItems: number;
  sentItems: number;
  status: 'ativa' | 'pausada' | 'concluida';
  updatedAt: string;
}

export interface CuratorPlan {
  id: string;
  userId: string;
  name: string;
  audienceProfile: string;
  criteria: Record<string, unknown>;
  selectedStores: StoreName[];
  targetJids: string[];
  dailyOffersLimit: number;
  scheduleMode: 'ia' | 'fixo';
  timeslots: string[];
  isActive: boolean;
  updatedAt: string;
}

export interface GroupAnalytics {
  id: string;
  userId: string;
  groupJid: string;
  groupName?: string;
  date: string;
  memberCount: number;
  joinsCount: number;
  leavesCount: number;
  messagesCount: number;
  peakHour: number;
}

export interface BioLink {
  id: string;
  userId: string;
  slug: string;
  title: string;
  bioText?: string;
  avatarUrl?: string;
  themeConfig: {
    primaryColor: string;
    backgroundColor: string;
    cardColor: string;
  };
  blocks: {
    id: string;
    type: 'link' | 'offer' | 'group' | 'banner';
    title: string;
    url: string;
    imageUrl?: string;
    badge?: string;
  }[];
  viewsCount: number;
  clicksCount: number;
  isActive: boolean;
}

export interface DashboardStats {
  offersToday: number;
  sentToday: number;
  pendingReview: number;
  scheduledJobs: number;
  failedJobs: number;
  successRatePct: number;
  whatsappStatus: 'connected' | 'connecting' | 'disconnected' | 'qrcode';
  instanceName?: string;
  batteryLevel?: number;
  phoneNumber?: string;
  nextScheduledJob?: {
    id: string;
    title: string;
    targetName: string;
    scheduledFor: string;
  };
}

export interface SystemReadiness {
  isFullyReady: boolean;
  score: number; // 0 a 100
  whatsapp: {
    state: 'connected_now' | 'last_known' | 'timeout' | 'disconnected' | 'connecting';
    label: string;
    isVerifiedRecent: boolean;
    lastPingAt?: string;
    instanceName?: string;
    phoneNumber?: string;
    errorReason?: string;
  };
  webhook: {
    isConfigured: boolean;
    isPublicHttps: boolean;
    isLocalhostWarning: boolean;
    url?: string;
    lastRealEventAt?: string;
    lastRealMessageId?: string;
    hasReceivedRealEvent: boolean;
    errorReason?: string;
  };
  worker: {
    isOperational: boolean;
    lastCycleAt?: string;
    isRecentCycle: boolean;
    scheduledCount: number;
    errorReason?: string;
  };
  affiliates: {
    hasValidatedStores: boolean;
    activeCount: number;
    stores: {
      name: StoreName;
      configured: boolean;
      validated: boolean;
      tag?: string;
    }[];
    errorReason?: string;
  };
  queue: {
    isSafe: boolean;
    totalCount: number;
    quarantinedCount: number;
    activeCount: number;
    reasons: string[];
  };
}

