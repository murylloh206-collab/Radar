'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, ArrowRight, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { usePlan } from '@/components/PlanProvider';

const DEFAULT_STEPS = [
  {
    id: 'whatsapp_connected',
    stepNumber: 1,
    title: '1. Conectar seu WhatsApp',
    description: 'Leia o QR Code com seu celular para o painel conseguir enviar as promoções nos seus grupos.',
    completed: false,
    actionLabel: 'Conectar WhatsApp',
    actionHref: '/conexoes',
  },
  {
    id: 'affiliate_configured',
    stepNumber: 2,
    title: '2. Cadastrar seu ID de afiliado',
    description: 'Informe sua etiqueta do Mercado Livre ou Shopee para que todas as vendas gerem comissão para você.',
    completed: false,
    actionLabel: 'Cadastrar ID de afiliado',
    actionHref: '/conexoes',
  },
  {
    id: 'first_offer_posted',
    stepNumber: 3,
    title: '3. Postar a primeira oferta',
    description: 'Escolha uma promoção ou ative o Copiador para publicar sua primeira oferta com seu link próprio.',
    completed: false,
    actionLabel: 'Postar primeira oferta',
    actionHref: '/copiador',
  },
  {
    id: 'first_click_tracked',
    stepNumber: 4,
    title: '4. Ver o primeiro clique',
    description: 'Acompanhe no painel quando os participantes do grupo clicarem no seu link de oferta.',
    completed: false,
    actionLabel: 'Ver cliques',
    actionHref: '/estatisticas',
  },
];

export function OnboardingChecklist() {
  const { onboarding, planDefinition, quota } = usePlan();
  const [collapsed, setCollapsed] = useState(false);

  const steps = onboarding.steps.length > 0 ? onboarding.steps : DEFAULT_STEPS;
  const completedCount = onboarding.steps.length > 0 ? onboarding.completedCount : 0;
  const totalCount = steps.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  return (
    <section
      aria-labelledby="onboarding-heading"
      className="rounded-2xl border border-indigo-500/30 p-5 sm:p-6 text-white shadow-lg"
      style={{
        background: 'linear-gradient(155deg, #060913 0%, #0b132c 60%, #121f48 100%)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
            <Sparkles className="w-5 h-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="onboarding-heading" className="text-base sm:text-lg font-bold text-white">
                Primeiros passos no Radar de Ofertas
              </h2>
              <span className="rounded-full bg-indigo-500/25 border border-indigo-400/30 px-2.5 py-0.5 text-xs font-semibold text-indigo-200">
                {completedCount} de {totalCount} concluídos ({progressPct}%)
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Siga este passo a passo simples para colocar seu grupo no piloto automático e começar a ganhar comissões.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/planos"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-colors"
          >
            <span>Plano {planDefinition.name}</span>
            <span className="text-slate-400">•</span>
            <span>
              {quota.dailyLimit === null
                ? 'Envios ilimitados'
                : `${quota.postedToday}/${quota.dailyLimit} hoje`}
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
          >
            {collapsed ? (
              <>
                Mostrar passos <ChevronDown className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Recolher <ChevronUp className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500"
          style={{ width: `${Math.max(progressPct, 6)}%` }}
        />
      </div>

      {!collapsed && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
                step.completed
                  ? 'border-emerald-500/35 bg-emerald-950/20'
                  : 'border-white/12 bg-black/30 hover:border-indigo-400/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${
                      step.completed ? 'text-emerald-300' : 'text-indigo-300'
                    }`}
                  >
                    {step.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-indigo-400 shrink-0" />
                    )}
                    Passo {step.stepNumber}
                  </span>
                  {step.completed && (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      Concluído
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-white mb-1">{step.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed mb-4">{step.description}</p>
              </div>

              <Link
                href={step.actionHref}
                className={`inline-flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  step.completed
                    ? 'bg-white/5 hover:bg-white/10 text-emerald-300 border border-emerald-500/20'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                <span>{step.actionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

