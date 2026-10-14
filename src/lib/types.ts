/**
 * Tipos compartilhados entre a interface (navegador) e o servidor.
 * Este arquivo NÃO pode importar nada de Node.js (fs, path...).
 */

export type OfferStatus = "pendente" | "aprovado" | "rejeitado" | "publicado";

export const OFFER_STATUSES: OfferStatus[] = ["pendente", "aprovado", "rejeitado", "publicado"];

export type ShortLinkStatus = "pendente" | "gerando" | "pronto" | "falhou";
export type WhatsAppQueueStatus = "rascunho" | "pronto" | "agendado" | "enviando" | "enviado" | "falhou";

export interface PriceHistoryItem {
  price: number;
  recordedAt: string;
}

export interface EstimatedCommission {
  percentage: number;
  amount: number;
  source: string;
}

export type OfferSource = "mercadolivre" | "shopee";

export type FieldDataSource = "confirmado" | "indisponivel" | "estimado" | "nao_aplicavel";

export interface ScoreComponentBreakdown {
  name: string;
  points: number;
  maxPoints: number;
  dataSource: FieldDataSource;
  detail: string;
}

export interface ScoreAudit {
  version: string;
  totalScore: number;
  effectivePrice: number;
  passedMandatoryFilters: boolean;
  failedFilters: string[];
  components: ScoreComponentBreakdown[];
  penalties: string[];
  decision: "aprovado" | "pendente" | "rejeitado" | "revisao_manual";
  decisionReason: string;
  evaluatedAt: string;
}

export interface RejectionDetail {
  reason: string;
  failedFilters: string[];
  rejectedAt: string;
  previousStatus?: OfferStatus;
}

export interface TombstoneRecord {
  id: string;
  fingerprint: string;
  title: string;
  rejectedAt: string;
  reason: string;
}

export type AlgorithmRolloutMode = "observacao" | "revisao_manual" | "publicacao_automatica";

export interface AlgorithmSettings {
  rolloutMode: AlgorithmRolloutMode;
  /** Score mínimo para entrar na fila de Pendentes (default: 75) */
  minPendingScore: number;
  /** Score mínimo para publicação automática via agendador (default: 75) */
  minAutoPublishScore: number;
  /** Score mínimo para permitir publicação manual (default: 75) */
  minManualPublishScore: number;
  /** Exigir evidência verificável de desconto (preço anterior / cupom / histórico) */
  requireVerifiableDiscount: boolean;
  /** Legado / retrocompatibilidade */
  minAutoApproveScore?: number;
  minManualReviewScore?: number;
  minEffectivePrice: number;
  weights: {
    realDiscountAndPrice: number;
    salesVolumeAndDemand: number;
    reviewsAndRating: number;
    couponValidity: number;
    availabilityAndFreshness: number;
    affiliateLinkQuality: number;
    additionalSignals: number;
  };
  enabledProviders: OfferSource[];
}

/** Uma oferta salva no painel. */
export interface Offer {
  /** Identificador interno (ex.: "mercadolivre:MLB123456"). */
  id: string;
  /** De onde veio a oferta. */
  source: OfferSource;
  /** ID do item/produto na plataforma de origem. */
  externalId: string;
  title: string;
  thumbnail: string | null;
  /** Preço atual em reais. */
  price: number;
  /** Preço "de" (anterior), quando a fonte informa. */
  originalPrice: number | null;
  /** Desconto calculado a partir de price e originalPrice. */
  discountPercent: number | null;
  currency: string;
  /** Link ORIGINAL do produto. */
  originalUrl: string;
  freeShipping: boolean;
  /** Termo de busca ou categoria que encontrou este produto. */
  searchTerm: string;

  status: OfferStatus;
  /** Link de afiliado comissionado da rede autorizada ou inserido manualmente. */
  affiliateUrl: string | null;
  /** Link curto meli.la gerado pelo fluxo de fila. */
  shortUrl?: string | null;
  shortUrlStatus?: ShortLinkStatus;
  shortUrlGeneratedAt?: string | null;
  shortUrlAttempts?: number;
  shortUrlError?: string | null;

  coupon: string | null;
  couponDescription: string | null;

  // Novos campos de qualidade e enriquecimento transparente
  rating?: number | null;
  reviewsCount?: number | null;
  sellerReputation?: string | null;
  commission?: EstimatedCommission | null;
  opportunityScore?: number;
  opportunityReason?: string;
  scoreAudit?: ScoreAudit | null;
  rejectionDetail?: RejectionDetail | null;
  productFingerprint?: string;
  salesVolume?: number | null;
  priceHistory?: PriceHistoryItem[];

  // Fila de publicação WhatsApp
  whatsappStatus?: WhatsAppQueueStatus;
  whatsappMessage?: string;
  whatsappQueuedAt?: string | null;
  whatsappSentAt?: string | null;
  whatsappError?: string | null;

  // Agendamento inteligente no fuso America/Sao_Paulo
  scheduledFor?: string | null;
  scheduledWindowDate?: string | null;
  sendAttempts?: number;
  lockedAt?: string | null;

  createdAt: string;
  updatedAt: string;
  /** Última vez que a oferta apareceu numa busca (preço atualizado). */
  lastSeenAt: string;
  statusChangedAt: string | null;
}

/** Campos que o usuário pode editar pela interface. */
export interface OfferUpdate {
  status?: OfferStatus;
  affiliateUrl?: string | null;
  shortUrl?: string | null;
  coupon?: string | null;
  couponDescription?: string | null;
  whatsappStatus?: WhatsAppQueueStatus;
  whatsappMessage?: string | null;
  whatsappError?: string | null;
  whatsappSentAt?: string | null;
  scheduledFor?: string | null;
}

export interface LastSearchInfo {
  at: string;
  terms: string[];
  found: number;
  added: number;
  updated: number;
}

export type SchedulerState = "ativo" | "pausado" | "interrompido_erro";
export type SchedulerMode = "daily_target" | "posts_per_hour" | "interval_minutes";
export type ScheduleDistribution = "fixed" | "randomized";

export interface SchedulerSettings {
  state: SchedulerState;
  startHour: string; // padrão "07:00"
  endHour: string; // padrão "00:00"
  dailyTarget: number; // ex: 30, 50, etc.
  maxPerHour: number; // padrão 5
  timezone: string; // padrão "America/Sao_Paulo"
  channelDestination: string;
  consecutiveFailures: number;
  maxConsecutiveFailures: number; // padrão 3
  lastDispatchedAt: string | null;
  lastDispatchedOfferTitle?: string | null;
  lastError?: string | null;

  // Novos campos do controle de agenda
  mode: SchedulerMode; // "daily_target" | "posts_per_hour" | "interval_minutes"
  distribution: ScheduleDistribution; // "fixed" | "randomized"
  postsPerHour: number; // ex: 2 ou 3
  intervalMinutes: number; // ex: 20
  minScore: number; // padrão 75 (retrocompatibilidade)
  minPendingScore?: number; // padrão 75
  minAutoPublishScore?: number; // padrão 75
  minManualPublishScore?: number; // padrão 75
  requireVerifiableDiscount?: boolean; // padrão true
}

export interface CategoryPolicySettings {
  allowedCategories: string[];
  blockedCategories: string[];
  blockedKeywords: string[];
  strictAllowedOnly: boolean;
}

export interface SchedulerStats {
  aprovadasFila: number;
  agendadasHoje: number;
  enviadasHoje: number;
  pendentesProximaJanela: number;
  comFalha: number;
  proximoEnvio: string | null;
  metaDiaria: number;
  limiteHora: number;

  // Novos indicadores em tempo real
  mode: SchedulerMode;
  distribution: ScheduleDistribution;
  intervalMinutes: number;
  totalEstimadoDia: number;
  proximosHorarios: string[]; // ex: ["07:00", "07:20", "07:40", ...]
  motivoSemElegivel?: string | null;
  minScore: number;
  minPendingScore: number;
  minAutoPublishScore: number;
  minManualPublishScore: number;
  requireVerifiableDiscount: boolean;
  windowStart: string;
  windowEnd: string;
}

export interface AutomationSettings {
  autoSendEnabled: boolean;
  channelDestination: string;
  intervalMinutes: number; // fixo em 5 minutos
  lastDispatchedAt: string | null;
  nextScheduledAt: string | null;
  lastDispatchedOfferTitle?: string | null;
  lastError?: string | null;
}

export interface QueueStats {
  pendingCount: number;
  maxPending: number;
  availableSlots: number;
  isQueueFull: boolean;
}

/** Resposta de GET /api/offers */
export interface OffersResponse {
  offers: Offer[];
  lastSearch: LastSearchInfo | null;
  automation: AutomationSettings;
  scheduler?: SchedulerSettings;
  schedulerStats?: SchedulerStats;
  algorithmSettings?: AlgorithmSettings;
  queueStats?: QueueStats;
  config: {
    defaultTerms: string[];
    resultsPerTerm: number;
    mercadoLivreConfigured: boolean;
    mercadoLivreConnected: boolean;
    isSupabaseActive?: boolean;
  };
}

/** Resposta de POST /api/offers/search */
export interface SearchResponse {
  offers: Offer[];
  lastSearch: LastSearchInfo;
  errors: { term: string; message: string }[];
}

export interface ApiError {
  error: string;
}
