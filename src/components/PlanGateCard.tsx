'use client';

import React from 'react';
import Link from 'next/link';
import { Lock, Sparkles, ArrowRight } from 'lucide-react';
import { PLANS_CONFIG, PlanId, PlanFeatureKey, formatCurrencyBRL } from '@/lib/plans-config';
import { usePlan } from '@/components/PlanProvider';

interface PlanGateCardProps {
  feature?: PlanFeatureKey;
  requiredPlan?: PlanId;
  title: string;
  description: string;
  compact?: boolean;
  children?: React.ReactNode;
}

/**
 * Componente elegante de bloqueio visual por plano ("Disponível no plano Plus / Ultimate").
 * A validação real também ocorre nas rotas da API no servidor via plan-guard.ts.
 */
export function PlanGateCard({
  feature,
  requiredPlan,
  title,
  description,
  compact = false,
  children,
}: PlanGateCardProps) {
  const { hasFeature, getRequiredPlan, openUpgradeModal } = usePlan();

  const resolvedPlan: PlanId = requiredPlan || (feature ? getRequiredPlan(feature) : 'plus');
  const isUnlocked = feature ? hasFeature(feature) : false;

  if (isUnlocked && children) {
    return <>{children}</>;
  }

  const planDef = PLANS_CONFIG[resolvedPlan] || PLANS_CONFIG.plus;

  if (compact) {
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-500/30 p-3.5 text-white"
        style={{
          background: 'linear-gradient(135deg, rgba(10, 15, 32, 0.92) 0%, rgba(22, 34, 86, 0.85) 100%)',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
            <Lock className="w-4 h-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <strong className="text-sm font-semibold text-white">{title}</strong>
              <span className="rounded-full bg-indigo-500/25 border border-indigo-400/30 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">
                Disponível no plano {planDef.name}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">{description}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => openUpgradeModal(resolvedPlan, title, description)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 px-3 py-1.5 text-xs font-semibold text-white transition-colors shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Liberar no {planDef.name}
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-indigo-500/30 p-6 text-white shadow-lg"
      style={{
        background: 'linear-gradient(145deg, #060913 0%, #0e1738 65%, #162458 100%)',
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 border border-indigo-400/30 px-3 py-1 text-xs font-semibold text-indigo-200">
            <Lock className="w-3.5 h-3.5 text-indigo-300" />
            Disponível no plano {planDef.name}
          </div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="text-sm text-slate-300 leading-relaxed">{description}</p>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
          <span className="text-xs text-indigo-200">
            A partir de <strong>12x R$ {formatCurrencyBRL(planDef.annualMonthlyEquivalent)}/mês</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openUpgradeModal(resolvedPlan, title, description)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 px-4 py-2.5 text-xs font-semibold text-white transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Ver detalhes
            </button>
            <Link
              href="/planos"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 hover:bg-white/10 px-4 py-2.5 text-xs font-semibold text-slate-200 transition-colors"
            >
              Ir para Planos
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

