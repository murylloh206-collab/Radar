'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Lock, Sparkles, X, ArrowRight, CheckCircle2 } from 'lucide-react';
import {
  PLANS_CONFIG,
  PlanId,
  BillingCycle,
  PlanFeatureKey,
  PlanDefinition,
  UserSubscriptionRecord,
  isFeatureAllowedInPlan,
  getMinimumPlanForFeature,
  formatCurrencyBRL,
} from '@/lib/plans-config';
import type { OnboardingStepStatus } from '@/app/api/subscription/route';

export interface DailyQuotaState {
  dailyLimit: number | null;
  postedToday: number;
  remainingToday: number | null;
  limitReached: boolean;
}

export interface OnboardingState {
  steps: OnboardingStepStatus[];
  completedCount: number;
  totalCount: number;
  allCompleted: boolean;
}

interface UpgradeModalState {
  open: boolean;
  requiredPlan: PlanId;
  featureTitle: string;
  featureDescription?: string;
}

interface PlanContextValue {
  loading: boolean;
  isDevMode: boolean;
  subscription: UserSubscriptionRecord;
  planDefinition: PlanDefinition;
  quota: DailyQuotaState;
  onboarding: OnboardingState;
  refreshPlan: () => Promise<void>;
  setTestPlan: (planId: PlanId, ciclo?: BillingCycle) => Promise<boolean>;
  hasFeature: (feature: PlanFeatureKey) => boolean;
  getRequiredPlan: (feature: PlanFeatureKey) => PlanId;
  openUpgradeModal: (requiredPlan: PlanId, featureTitle: string, featureDescription?: string) => void;
  closeUpgradeModal: () => void;
}

const DEFAULT_SUBSCRIPTION: UserSubscriptionRecord = {
  user_id: '00000000-0000-0000-0000-000000000001',
  plano: 'impulse',
  ciclo: 'anual',
  status: 'active',
  expira_em: null,
  trial_ate: null,
  referral_code: 'RADAR-000001',
};

const DEFAULT_QUOTA: DailyQuotaState = {
  dailyLimit: 20,
  postedToday: 0,
  remainingToday: 20,
  limitReached: false,
};

const DEFAULT_ONBOARDING: OnboardingState = {
  steps: [],
  completedCount: 0,
  totalCount: 4,
  allCompleted: false,
};

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isDevMode, setIsDevMode] = useState(false);
  const [subscription, setSubscription] = useState<UserSubscriptionRecord>(DEFAULT_SUBSCRIPTION);
  const [quota, setQuota] = useState<DailyQuotaState>(DEFAULT_QUOTA);
  const [onboarding, setOnboarding] = useState<OnboardingState>(DEFAULT_ONBOARDING);
  const [upgradeModal, setUpgradeModal] = useState<UpgradeModalState>({
    open: false,
    requiredPlan: 'plus',
    featureTitle: '',
  });

  const refreshPlan = useCallback(async () => {
    try {
      const res = await fetch('/api/subscription', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok) {
        setIsDevMode(Boolean(data.isDevMode));
        if (data.subscription) setSubscription(data.subscription);
        if (data.quota) setQuota(data.quota);
        if (data.onboarding) setOnboarding(data.onboarding);
      }
    } catch {
      // Silencioso em caso de oscilação de rede
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPlan();
  }, [refreshPlan]);

  const setTestPlan = useCallback(async (planId: PlanId, ciclo: BillingCycle = 'anual'): Promise<boolean> => {
    try {
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_test_plan',
          plano: planId,
          ciclo,
        }),
      });
      const data = await res.json();
      if (data.ok && data.subscription) {
        setSubscription(data.subscription);
        if (data.quota) setQuota(data.quota);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const hasFeature = useCallback(
    (feature: PlanFeatureKey) => {
      return isFeatureAllowedInPlan(subscription.plano, feature);
    },
    [subscription.plano]
  );

  const getRequiredPlan = useCallback((feature: PlanFeatureKey): PlanId => {
    return getMinimumPlanForFeature(feature);
  }, []);

  const openUpgradeModal = useCallback(
    (requiredPlan: PlanId, featureTitle: string, featureDescription?: string) => {
      setUpgradeModal({
        open: true,
        requiredPlan,
        featureTitle,
        featureDescription,
      });
    },
    []
  );

  const closeUpgradeModal = useCallback(() => {
    setUpgradeModal((prev) => ({ ...prev, open: false }));
  }, []);

  const planDefinition = PLANS_CONFIG[subscription.plano] || PLANS_CONFIG.impulse;
  const targetUpgradePlan = PLANS_CONFIG[upgradeModal.requiredPlan] || PLANS_CONFIG.plus;

  return (
    <PlanContext.Provider
      value={{
        loading,
        isDevMode,
        subscription,
        planDefinition,
        quota,
        onboarding,
        refreshPlan,
        setTestPlan,
        hasFeature,
        getRequiredPlan,
        openUpgradeModal,
        closeUpgradeModal,
      }}
    >
      {children}

      {/* Modal global de recurso exclusivo (fecha ao clicar fora) */}
      {upgradeModal.open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeUpgradeModal();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="upgrade-modal-title"
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-indigo-500/30 p-6 text-white shadow-2xl"
            style={{
              background: 'linear-gradient(155deg, #070a14 0%, #0e1636 60%, #162256 100%)',
            }}
          >
            <button
              type="button"
              onClick={closeUpgradeModal}
              aria-label="Fechar janela"
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 border border-indigo-400/30 px-3 py-1 text-xs font-semibold text-indigo-200 mb-4">
              <Lock className="w-3.5 h-3.5 text-indigo-300" />
              Disponível no plano {targetUpgradePlan.name}
            </div>

            <h3 id="upgrade-modal-title" className="text-xl font-bold text-white mb-2">
              {upgradeModal.featureTitle || `Desbloqueie o plano ${targetUpgradePlan.name}`}
            </h3>

            <p className="text-sm text-slate-300 leading-relaxed mb-5">
              {upgradeModal.featureDescription ||
                `Este recurso faz parte do plano ${targetUpgradePlan.name}. Evolua sua assinatura para liberar esta funcionalidade imediatamente.`}
            </p>

            <div className="rounded-xl bg-black/40 border border-white/10 p-4 mb-5">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-indigo-300 font-semibold">
                  Plano {targetUpgradePlan.name} (Anual)
                </span>
                <span className="text-lg font-bold text-white">
                  12x R$ {formatCurrencyBRL(targetUpgradePlan.annualMonthlyEquivalent)}/mês
                </span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {targetUpgradePlan.highlights.slice(0, 4).map((item, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Link
                href="/planos"
                onClick={closeUpgradeModal}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold py-2.5 px-4 text-sm transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Ver planos e fazer upgrade
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={closeUpgradeModal}
                className="w-full sm:w-auto rounded-xl border border-white/15 hover:bg-white/5 text-slate-300 py-2.5 px-4 text-sm transition-colors"
              >
                Agora não
              </button>
            </div>
          </div>
        </div>
      )}
    </PlanContext.Provider>
  );
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    throw new Error('usePlan deve ser utilizado dentro de um <PlanProvider>');
  }
  return ctx;
}

