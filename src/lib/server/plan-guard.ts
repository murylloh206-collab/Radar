import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ADMIN_UUID, SESSION_COOKIE_NAME, verifySession } from './auth';
import { readDatabase } from './storage';
import {
  BillingCycle,
  FEATURE_METADATA,
  PLANS_CONFIG,
  PlanDefinition,
  PlanFeatureKey,
  PlanId,
  SAAS_TRIAL_CONFIG,
  SubscriptionStatus,
  planHasFeature,
} from '../plans-config';

export interface UserSubscriptionRecord {
  userId: string;
  plano: PlanId;
  effectivePlan: PlanId;
  ciclo: BillingCycle;
  status: SubscriptionStatus;
  expiraEm: string | null;
  trialAte: string | null;
  isTrialActive: boolean;
  trialDaysRemaining: number;
  referralCode: string;
  referredBy: string | null;
  referralDiscountPending: boolean;
  referralsCount: number;
  updatedAt: string;
}

export interface DailyQuotaStatus {
  planId: PlanId;
  planName: string;
  postedToday: number;
  dailyLimit: number | null; // null = ilimitado
  remainingToday: number | null; // null = ilimitado
  limitReached: boolean;
  nearLimit: boolean;
}

const DEV_SUB_FILE = path.join(process.cwd(), '.data', 'dev_subscription.json');

export function isDevEnvironment(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Ponto único de resolução do usuário atual.
 * Quando o login multiusuário for ativado, basta alterar esta função.
 */
export function resolveCurrentUserId(req?: NextRequest | Request): string {
  if (req) {
    try {
      const cookieHeader = req.headers.get('cookie') || '';
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
      if (match && match[1]) {
        const session = verifySession(decodeURIComponent(match[1]));
        if (session?.userId) {
          return session.userId;
        }
      }
    } catch {}
  }
  return ADMIN_UUID;
}

function generateReferralCode(userId: string): string {
  const hash = crypto.createHash('sha256').update(`radar-ref-${userId}`).digest('hex').slice(0, 6).toUpperCase();
  return `RADAR-${hash}`;
}

function readLocalDevSubscription(userId: string): Partial<UserSubscriptionRecord> | null {
  if (!isDevEnvironment()) return null;
  try {
    if (fs.existsSync(DEV_SUB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DEV_SUB_FILE, 'utf-8'));
      if (raw && raw[userId]) {
        return raw[userId];
      }
    }
  } catch {}
  return null;
}

function writeLocalDevSubscription(userId: string, record: UserSubscriptionRecord): void {
  if (!isDevEnvironment()) return;
  try {
    const dir = path.dirname(DEV_SUB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let existing: Record<string, UserSubscriptionRecord> = {};
    if (fs.existsSync(DEV_SUB_FILE)) {
      try {
        existing = JSON.parse(fs.readFileSync(DEV_SUB_FILE, 'utf-8')) || {};
      } catch {}
    }
    existing[userId] = record;
    fs.writeFileSync(DEV_SUB_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  } catch {}
}

function normalizeSubscriptionRecord(
  userId: string,
  raw?: {
    plano?: string | null;
    ciclo?: string | null;
    status?: string | null;
    expira_em?: string | null;
    trial_ate?: string | null;
    referral_code?: string | null;
    referred_by?: string | null;
    referral_discount_pending?: boolean | null;
    referrals_count?: number | null;
    updated_at?: string | null;
  } | null
): UserSubscriptionRecord {
  const validPlans: PlanId[] = ['impulse', 'plus', 'ultimate'];
  const rawPlan = (raw?.plano || 'plus').toLowerCase() as PlanId;
  const plano: PlanId = validPlans.includes(rawPlan) ? rawPlan : 'impulse';

  const ciclo: BillingCycle = raw?.ciclo === 'mensal' ? 'mensal' : 'anual';
  const status: SubscriptionStatus =
    raw?.status === 'trialing' || raw?.status === 'past_due' || raw?.status === 'canceled'
      ? raw.status
      : 'active';

  const trialAte = raw?.trial_ate || null;
  let isTrialActive = false;
  let trialDaysRemaining = 0;

  if (trialAte) {
    const diffMs = new Date(trialAte).getTime() - Date.now();
    if (diffMs > 0) {
      isTrialActive = true;
      trialDaysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }
  }

  // Se o trial acabou e o status ainda era 'trialing', volta para o plano base 'impulse'
  let effectivePlan: PlanId = plano;
  if (status === 'trialing' && !isTrialActive) {
    effectivePlan = 'impulse';
  } else if (status === 'canceled') {
    effectivePlan = 'impulse';
  }

  return {
    userId,
    plano,
    effectivePlan,
    ciclo,
    status,
    expiraEm: raw?.expira_em || null,
    trialAte,
    isTrialActive,
    trialDaysRemaining,
    referralCode: raw?.referral_code || generateReferralCode(userId),
    referredBy: raw?.referred_by || null,
    referralDiscountPending: Boolean(raw?.referral_discount_pending),
    referralsCount: Number(raw?.referrals_count || 0),
    updatedAt: raw?.updated_at || new Date().toISOString(),
  };
}

/**
 * Obtém a assinatura do usuário.
 * - Em PRODUÇÃO (NODE_ENV === 'production'): consulta EXCLUSIVAMENTE a tabela `user_subscriptions` no Supabase.
 * - Em DESENVOLVIMENTO (NODE_ENV !== 'production'): consulta `user_subscriptions` ou o espelho de desenvolvimento `.data/dev_subscription.json`.
 */
export async function getUserSubscription(userIdInput?: string): Promise<UserSubscriptionRecord> {
  const userId = userIdInput || ADMIN_UUID;

  // 1. Em desenvolvimento, verifica primeiro se o desenvolvedor selecionou um plano no seletor de teste
  if (isDevEnvironment()) {
    const devLocal = readLocalDevSubscription(userId);
    if (devLocal && devLocal.plano) {
      return normalizeSubscriptionRecord(userId, {
        plano: devLocal.plano,
        ciclo: devLocal.ciclo,
        status: devLocal.status,
        expira_em: devLocal.expiraEm,
        trial_ate: devLocal.trialAte,
        referral_code: devLocal.referralCode,
        referred_by: devLocal.referredBy,
        referral_discount_pending: devLocal.referralDiscountPending,
        referrals_count: devLocal.referralsCount,
        updated_at: devLocal.updatedAt,
      });
    }
  }

  // 2. Consulta oficial na tabela `user_subscriptions` do Supabase
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        return normalizeSubscriptionRecord(userId, data);
      }

      // Se o usuário ainda não tem registro na tabela, cria com teste grátis de 7 dias no Plus
      if (!error && !data) {
        const trialEnd = new Date(
          Date.now() + SAAS_TRIAL_CONFIG.trialDurationDays * 24 * 60 * 60 * 1000
        ).toISOString();
        const referralCode = generateReferralCode(userId);
        const initialRow = {
          user_id: userId,
          plano: SAAS_TRIAL_CONFIG.defaultTrialPlan,
          ciclo: 'anual',
          status: 'trialing',
          trial_ate: trialEnd,
          referral_code: referralCode,
          updated_at: new Date().toISOString(),
        };

        const { data: inserted } = await supabase
          .from('user_subscriptions')
          .upsert(initialRow, { onConflict: 'user_id' })
          .select('*')
          .maybeSingle();

        if (inserted) {
          return normalizeSubscriptionRecord(userId, inserted);
        }
      }
    } catch {
      // Se a tabela ainda não foi migrada no Supabase remoto, segue para o estado seguro padrão
    }
  }

  // Fallback padrão: Em produção sem linha criada, inicia no Impulse (seguro); em dev, inicia com trial Plus de 7 dias
  if (!isDevEnvironment()) {
    return normalizeSubscriptionRecord(userId, {
      plano: 'impulse',
      ciclo: 'anual',
      status: 'active',
      referral_code: generateReferralCode(userId),
    });
  }

  const defaultTrialEnd = new Date(
    Date.now() + SAAS_TRIAL_CONFIG.trialDurationDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const initialRecord = normalizeSubscriptionRecord(userId, {
    plano: 'plus',
    ciclo: 'anual',
    status: 'trialing',
    trial_ate: defaultTrialEnd,
    referral_code: generateReferralCode(userId),
  });
  writeLocalDevSubscription(userId, initialRecord);
  return initialRecord;
}

/**
 * Altera o plano pelo seletor "Plano de teste".
 * BLOQUEADO ESTRITAMENTE EM PRODUÇÃO (NODE_ENV === 'production').
 */
export async function setDevTestPlan(
  userId: string,
  planId: PlanId,
  options?: { ciclo?: BillingCycle; simulateTrial?: boolean }
): Promise<UserSubscriptionRecord> {
  if (!isDevEnvironment()) {
    throw new Error('Operação proibida: o seletor de plano de teste só existe em ambiente de desenvolvimento.');
  }

  const validPlans: PlanId[] = ['impulse', 'plus', 'ultimate'];
  if (!validPlans.includes(planId)) {
    throw new Error(`Plano inválido: ${planId}`);
  }

  const current = await getUserSubscription(userId);
  const trialAte = options?.simulateTrial
    ? new Date(Date.now() + SAAS_TRIAL_CONFIG.trialDurationDays * 24 * 60 * 60 * 1000).toISOString()
    : current.trialAte;

  const updated = normalizeSubscriptionRecord(userId, {
    plano: planId,
    ciclo: options?.ciclo || current.ciclo || 'anual',
    status: options?.simulateTrial ? 'trialing' : 'active',
    expira_em: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    trial_ate: trialAte,
    referral_code: current.referralCode,
    referred_by: current.referredBy,
    referral_discount_pending: current.referralDiscountPending,
    referrals_count: current.referralsCount,
    updated_at: new Date().toISOString(),
  });

  writeLocalDevSubscription(userId, updated);

  // Também sincroniza na tabela `user_subscriptions` do Supabase se existir
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('user_subscriptions').upsert(
        {
          user_id: userId,
          plano: updated.plano,
          ciclo: updated.ciclo,
          status: updated.status,
          expira_em: updated.expiraEm,
          trial_ate: updated.trialAte,
          referral_code: updated.referralCode,
          updated_at: updated.updatedAt,
        },
        { onConflict: 'user_id' }
      );
    } catch {}
  }

  return updated;
}

/**
 * Conta quantas ofertas foram postadas hoje pelo usuário (fuso America/Sao_Paulo)
 * e verifica se atingiu o limite diário do plano.
 */
export async function getDailyOfferQuotaStatus(userIdInput?: string): Promise<DailyQuotaStatus> {
  const userId = userIdInput || ADMIN_UUID;
  const sub = await getUserSubscription(userId);
  const planDef: PlanDefinition = PLANS_CONFIG[sub.effectivePlan] || PLANS_CONFIG.impulse;
  const dailyLimit = planDef.dailyOfferLimit;

  // Início do dia no fuso de Brasília (America/Sao_Paulo)
  const now = new Date();
  const brtFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayDateStr = brtFormatter.format(now); // YYYY-MM-DD
  const startOfDayIso = `${todayDateStr}T00:00:00.000-03:00`;
  const startOfDayMs = new Date(startOfDayIso).getTime();

  let postedToday = 0;

  if (isSupabaseConfigured && supabase) {
    try {
      const { count, error } = await supabase
        .from('publication_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'enviado')
        .gte('created_at', new Date(startOfDayMs).toISOString());

      if (!error && typeof count === 'number') {
        postedToday = count;
      }
    } catch {}
  }

  // Fallback / complemento com banco em memória/local para precisão imediata
  try {
    const db = readDatabase();
    const localSentToday = (db.jobs || []).filter((j) => {
      if (j.userId !== userId) return false;
      if (j.status !== 'enviado') return false;
      const t = new Date(j.sentAt || j.createdAt).getTime();
      return !isNaN(t) && t >= startOfDayMs;
    }).length;
    if (localSentToday > postedToday) {
      postedToday = localSentToday;
    }
  } catch {}

  const remainingToday = dailyLimit === null ? null : Math.max(0, dailyLimit - postedToday);
  const limitReached = dailyLimit !== null && postedToday >= dailyLimit;
  const nearLimit = dailyLimit !== null && !limitReached && postedToday >= Math.floor(dailyLimit * 0.8);

  return {
    planId: sub.effectivePlan,
    planName: planDef.name,
    postedToday,
    dailyLimit,
    remainingToday,
    limitReached,
    nearLimit,
  };
}

/**
 * Valida no servidor se o usuário possui acesso a uma funcionalidade específica do plano.
 */
export async function checkPlanFeatureAccess(
  feature: PlanFeatureKey,
  userIdInput?: string
): Promise<{
  allowed: boolean;
  currentPlan: PlanId;
  requiredPlan: PlanId;
  requiredPlanName: string;
  featureLabel: string;
  error?: string;
}> {
  const userId = userIdInput || ADMIN_UUID;
  const sub = await getUserSubscription(userId);
  const allowed = planHasFeature(sub.effectivePlan, feature);
  const meta = FEATURE_METADATA[feature];
  const requiredPlan = meta?.minPlan || 'ultimate';
  const requiredPlanName = PLANS_CONFIG[requiredPlan].name;

  return {
    allowed,
    currentPlan: sub.effectivePlan,
    requiredPlan,
    requiredPlanName,
    featureLabel: meta?.label || feature,
    error: allowed
      ? undefined
      : `O recurso "${meta?.label || feature}" é exclusivo do plano ${requiredPlanName} (seu plano atual é ${PLANS_CONFIG[sub.effectivePlan].name}).`,
  };
}

