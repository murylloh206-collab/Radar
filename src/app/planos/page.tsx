'use client';

import React, { useState } from 'react';
import {
  Check,
  Sparkles,
  ShieldCheck,
  Gift,
  Copy,
  CheckCircle2,
  X,
  CreditCard,
  Clock,
  FlaskConical,
} from 'lucide-react';
import {
  PLANS_ORDER,
  PLANS_CONFIG,
  PlanId,
  BillingCycle,
  TRIAL_CONFIG,
  REFERRAL_CONFIG,
  formatCurrencyBRL,
} from '@/lib/plans-config';
import { usePlan } from '@/components/PlanProvider';

interface CheckoutModalData {
  open: boolean;
  planId: PlanId;
  cycle: BillingCycle;
  loading: boolean;
  message: string;
  amountLabel: string;
  commitmentLabel: string;
}

export default function PlanosPage() {
  const { subscription, quota, isDevMode, setTestPlan } = usePlan();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('anual');
  const [copiedRef, setCopiedRef] = useState(false);
  const [checkoutModal, setCheckoutModal] = useState<CheckoutModalData | null>(null);

  const referralCode = subscription.referral_code || 'RADAR-000001';
  const referralUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/planos?ref=${encodeURIComponent(referralCode)}`
      : `https://radardeofertas.com.br/planos?ref=${encodeURIComponent(referralCode)}`;

  const handleCopyReferral = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(referralUrl);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2500);
    }
  };

  const handleStartCheckout = async (planId: PlanId) => {
    const plan = PLANS_CONFIG[planId];
    const amountLabel =
      billingCycle === 'anual'
        ? `12x R$ ${formatCurrencyBRL(plan.annualMonthlyEquivalent)}/mês`
        : `R$ ${formatCurrencyBRL(plan.monthlyPrice)}/mês`;
    const commitmentLabel =
      billingCycle === 'anual'
        ? `Compromisso de 12 meses. Sem juros. Preço anual total: R$ ${formatCurrencyBRL(plan.annualTotalPrice)}`
        : 'Renovação mensal sem fidelidade.';

    setCheckoutModal({
      open: true,
      planId,
      cycle: billingCycle,
      loading: true,
      message: 'Preparando sessão de assinatura...',
      amountLabel,
      commitmentLabel,
    });

    try {
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'checkout',
          planId,
          cycle: billingCycle,
        }),
      });
      const data = await res.json();
      setCheckoutModal({
        open: true,
        planId,
        cycle: billingCycle,
        loading: false,
        message:
          data.checkout?.message ||
          `Checkout em breve para o plano ${plan.name}. A função única de pagamento já está pronta para integração com Stripe ou Mercado Pago.`,
        amountLabel,
        commitmentLabel,
      });
    } catch {
      setCheckoutModal({
        open: true,
        planId,
        cycle: billingCycle,
        loading: false,
        message: `Checkout em breve para o plano ${plan.name}.`,
        amountLabel,
        commitmentLabel,
      });
    }
  };

  return (
    <div
      className="min-h-screen rounded-3xl p-4 sm:p-8 md:p-10 text-white"
      style={{
        background: 'linear-gradient(165deg, #03050a 0%, #070d22 50%, #0d173a 100%)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
      }}
    >
      {/* Cabeçalho centralizado */}
      <div className="max-w-3xl mx-auto text-center mb-10">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/15 border border-indigo-400/30 px-3.5 py-1.5 text-xs font-semibold text-indigo-200 mb-4">
          <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
          Planos e Assinatura • Radar de Ofertas SaaS
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
          Escolha o melhor plano para você
        </h1>

        <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Automatize suas postagens no WhatsApp, personalize sua marca d&apos;água e aumente suas comissões no Mercado Livre e na Shopee com ferramentas profissionais.
        </p>

        {/* Seletor de Ciclo: Anual parcelado (padrão) e Mensal */}
        <div className="mt-8 inline-flex items-center rounded-2xl bg-black/60 border border-white/15 p-1.5 shadow-inner">
          <button
            type="button"
            onClick={() => setBillingCycle('anual')}
            className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
              billingCycle === 'anual'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <span>Anual parcelado</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                billingCycle === 'anual'
                  ? 'bg-emerald-400 text-slate-950'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
              }`}
            >
              Economize 20%
            </span>
          </button>

          <button
            type="button"
            onClick={() => setBillingCycle('mensal')}
            className={`rounded-xl px-5 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
              billingCycle === 'mensal'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Mensal
          </button>
        </div>

        {/* Resumo do uso atual */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            Plano ativo: <strong className="text-white">{PLANS_CONFIG[subscription.plano].name}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            Uso diário hoje:{' '}
            <strong className="text-white">
              {quota.dailyLimit === null
                ? `${quota.postedToday} ofertas postadas (Ilimitado)`
                : `${quota.postedToday} de ${quota.dailyLimit} ofertas`}
            </strong>
          </span>
        </div>
      </div>

      {/* Grade de Cards de Planos (estilo Supabase Pricing) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto items-stretch">
        {PLANS_ORDER.map((planId) => {
          const plan = PLANS_CONFIG[planId];
          const isCurrentPlan = subscription.plano === planId;
          const isPopular = Boolean(plan.popular);
          const displayPrice =
            billingCycle === 'anual' ? plan.annualMonthlyEquivalent : plan.monthlyPrice;

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col justify-between rounded-2xl p-6 sm:p-8 transition-all ${
                isPopular
                  ? 'border-2 border-indigo-400/80 shadow-2xl shadow-indigo-950/60 lg:-translate-y-2'
                  : 'border border-white/15 shadow-xl'
              }`}
              style={{
                background: isPopular
                  ? 'linear-gradient(170deg, #060916 0%, #0d173b 55%, #172765 100%)'
                  : 'linear-gradient(170deg, #04060c 0%, #091026 65%, #101b42 100%)',
              }}
            >
              {/* Selo "Mais popular" no plano Plus */}
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
                  {plan.badge}
                </div>
              )}

              <div>
                {/* Cabeçalho do Card */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h2 className="text-xl font-bold text-white">{plan.name}</h2>
                  {plan.id === 'plus' && TRIAL_CONFIG.enabled && (
                    <span className="rounded-full bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                      {TRIAL_CONFIG.durationDays} dias grátis
                    </span>
                  )}
                </div>

                <p className="text-xs sm:text-sm text-slate-300 min-h-[40px] leading-relaxed">
                  {plan.tagline}
                </p>

                {/* Bloco de Preço com fonte serifada forte e gradiente de cinza claro para branco */}
                <div className="my-6 pt-5 border-t border-white/10">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    {billingCycle === 'anual' && (
                      <span className="text-base sm:text-lg font-semibold text-indigo-200">
                        12x
                      </span>
                    )}
                    <span className="text-lg sm:text-xl font-semibold text-slate-300">R$</span>
                    <span
                      style={{
                        fontFamily: "var(--font-serif-pricing), 'Playfair Display', Georgia, serif",
                        backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}
                      className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-none"
                    >
                      {formatCurrencyBRL(displayPrice)}
                    </span>
                    <span className="text-sm text-slate-300 font-medium">/mês</span>
                  </div>

                  {billingCycle === 'anual' ? (
                    <p className="mt-2.5 text-xs text-slate-300 leading-relaxed">
                      Compromisso de 12 meses. Sem juros. Preço anual total:{' '}
                      <strong className="text-white">
                        R$ {formatCurrencyBRL(plan.annualTotalPrice)}
                      </strong>
                    </p>
                  ) : (
                    <p className="mt-2.5 text-xs text-slate-400 leading-relaxed">
                      Cobrança mensal avulsa de R$ {formatCurrencyBRL(plan.monthlyPrice)}. Mude para o anual e economize 20%.
                    </p>
                  )}
                </div>

                {/* Botão de ação principal */}
                <div className="mb-6">
                  {isCurrentPlan ? (
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-xl bg-white/10 border border-white/20 py-3 px-4 text-sm font-semibold text-slate-300 cursor-not-allowed"
                    >
                      Plano atual
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStartCheckout(plan.id)}
                      className={`w-full rounded-xl py-3 px-4 text-sm font-bold transition-all cursor-pointer ${
                        isPopular
                          ? 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-600/30'
                          : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                      }`}
                    >
                      {plan.id === 'plus'
                        ? `Testar ${TRIAL_CONFIG.durationDays} dias grátis no Plus`
                        : `Assinar ${plan.name}`}
                    </button>
                  )}

                  {/* Atalho de teste rápido se estiver em ambiente de desenvolvimento */}
                  {isDevMode && !isCurrentPlan && (
                    <button
                      type="button"
                      onClick={() => setTestPlan(plan.id, billingCycle)}
                      className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 hover:bg-amber-500/20 py-1.5 px-3 text-[11px] font-medium text-amber-200 transition-colors cursor-pointer"
                    >
                      <FlaskConical className="w-3 h-3" />
                      Ativar {plan.name} agora (Modo Teste Dev)
                    </button>
                  )}
                </div>

                {/* Lista de benefícios com checkmarks */}
                <div className="space-y-3 pt-4 border-t border-white/10">
                  {plan.inheritsFromLabel ? (
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                      {plan.inheritsFromLabel}
                    </p>
                  ) : (
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Recursos incluídos:
                    </p>
                  )}

                  <ul className="space-y-2.5">
                    {plan.highlights.map((featureText, index) => (
                      <li key={index} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-200">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                          <Check className="w-3 h-3" />
                        </span>
                        <span className="leading-snug">{featureText}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Limite diário de postagens</span>
                <strong className="text-slate-200">
                  {plan.dailyOfferLimit === null ? 'Ilimitado' : `${plan.dailyOfferLimit} ofertas/dia`}
                </strong>
              </div>
            </div>
          );
        })}
      </div>

      {/* Seção: Programa de Indicação (Código / Link Único) */}
      <div
        className="max-w-6xl mx-auto mt-10 rounded-2xl border border-indigo-500/30 p-6 sm:p-8"
        style={{
          background: 'linear-gradient(135deg, rgba(13, 23, 58, 0.9) 0%, rgba(23, 37, 84, 0.75) 100%)',
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 text-xs font-semibold text-emerald-300">
              <Gift className="w-3.5 h-3.5" />
              Programa de Indicação • Ganhe {REFERRAL_CONFIG.referrerDiscountPercent}% de desconto
            </div>
            <h3 className="text-xl font-bold text-white">
              Indique um amigo afiliado e pague menos na sua próxima renovação
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {REFERRAL_CONFIG.description} Compartilhe seu link exclusivo abaixo nos seus grupos ou com colegas afiliados.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div className="rounded-xl bg-black/50 border border-white/15 px-4 py-2.5 text-xs font-mono text-indigo-200 select-all">
              {referralUrl}
            </div>
            <button
              type="button"
              onClick={handleCopyReferral}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 px-4 py-2.5 text-xs font-bold text-white transition-colors cursor-pointer shrink-0"
            >
              {copiedRef ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  Link copiado!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copiar meu link ({referralCode})
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modal "Checkout em breve" — Fecha ao clicar fora */}
      {checkoutModal?.open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCheckoutModal(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-modal-title"
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-indigo-500/40 p-6 sm:p-7 text-white shadow-2xl"
            style={{
              background: 'linear-gradient(160deg, #060913 0%, #0e1738 60%, #17255a 100%)',
            }}
          >
            <button
              type="button"
              onClick={() => setCheckoutModal(null)}
              aria-label="Fechar modal"
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 border border-indigo-400/30 px-3 py-1 text-xs font-semibold text-indigo-200 mb-4">
              <CreditCard className="w-3.5 h-3.5 text-indigo-300" />
              Checkout em breve
            </div>

            <h3 id="checkout-modal-title" className="text-xl font-bold text-white mb-2">
              Plano {PLANS_CONFIG[checkoutModal.planId].name} ({checkoutModal.cycle === 'anual' ? 'Anual parcelado' : 'Mensal'})
            </h3>

            <div className="rounded-xl bg-black/40 border border-white/10 p-4 my-4">
              <div className="text-lg font-bold text-white">{checkoutModal.amountLabel}</div>
              <div className="text-xs text-slate-300 mt-1">{checkoutModal.commitmentLabel}</div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed mb-5">
              {checkoutModal.message}
            </p>

            {isDevMode && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3.5 mb-5 text-xs text-amber-200">
                <strong className="block mb-1">Ambiente de Desenvolvimento Detectado:</strong>
                Você pode testar todos os recursos do plano{' '}
                <strong>{PLANS_CONFIG[checkoutModal.planId].name}</strong> agora mesmo clicando no botão abaixo ou usando o seletor no topo da tela.
                <button
                  type="button"
                  onClick={async () => {
                    await setTestPlan(checkoutModal.planId, checkoutModal.cycle);
                    setCheckoutModal(null);
                  }}
                  className="mt-2.5 w-full rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold py-2 px-3 text-xs transition-colors cursor-pointer"
                >
                  Simular assinatura ativa do {PLANS_CONFIG[checkoutModal.planId].name} agora
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setCheckoutModal(null)}
              className="w-full rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 py-2.5 px-4 text-sm font-semibold text-white transition-colors cursor-pointer"
            >
              Entendi, fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

