'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { PLANS_CONFIG, PlanId, BillingCycle, formatCurrencyBRL } from '@/lib/plans-config';

function parsePlanParam(raw: string | null): PlanId | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'impulse' || normalized === 'plus' || normalized === 'ultimate') {
    return normalized;
  }
  return null;
}

function parseCycleParam(raw: string | null): BillingCycle {
  if (!raw) return 'mensal';
  const normalized = raw.trim().toLowerCase();
  return normalized === 'anual' ? 'anual' : 'mensal';
}

function CadastroForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refCode = searchParams.get('ref') || '';
  const selectedPlanId = parsePlanParam(searchParams.get('plano') || searchParams.get('plan'));
  const selectedCycle = parseCycleParam(searchParams.get('periodo') || searchParams.get('cycle'));
  const selectedPlan = selectedPlanId ? PLANS_CONFIG[selectedPlanId] : null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!acceptedTerms) {
      setError('Você precisa aceitar os Termos de Uso e a Política de Privacidade para continuar.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          acceptedTerms,
          refCode,
          intendedPlan: selectedPlanId || undefined,
          intendedCycle: selectedPlanId ? selectedCycle : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || 'Falha ao criar conta. Tente novamente.');
        return;
      }

      if (data.requiresEmailConfirmation) {
        setSuccessMessage(
          'Conta criada com sucesso! Enviamos um link de confirmação para o seu e-mail. Confirme seu endereço para acessar sua conta e prosseguir com a contratação do plano escolhido.'
        );
      } else {
        router.push('/painel');
        router.refresh();
      }
    } catch {
      setError('Erro de conexão ao tentar criar conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-[#0D1B31] border border-[#1E293B] rounded-2xl shadow-2xl backdrop-blur-sm">
      <div className="flex flex-col items-center mb-6 text-center">
        <Logo className="h-10 mb-2" />
        <h1 className="text-xl font-bold text-white tracking-wide">Crie sua conta no Radar de Ofertas</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure seu acesso para organizar e divulgar suas ofertas
        </p>
      </div>

      {selectedPlan && (
        <div
          className="mb-5 p-3.5 bg-[#081528] border border-[#2B3A50] rounded-xl text-xs text-slate-200 space-y-1"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[#35D4ED]">
              Plano selecionado: {selectedPlan.name} ({selectedCycle === 'anual' ? 'Anual' : 'Mensal'})
            </span>
            <Link href="/#rh-planos" className="text-[11px] text-slate-400 hover:text-white underline">
              Alterar
            </Link>
          </div>
          <p className="text-slate-300">
            {selectedCycle === 'anual'
              ? `12× R$ ${formatCurrencyBRL(selectedPlan.pricing.annualMonthlyInstallment)}/parcela · Total anual R$ ${formatCurrencyBRL(selectedPlan.pricing.annualTotalPrice)} (compromisso de 12 meses).`
              : `R$ ${formatCurrencyBRL(selectedPlan.pricing.monthlyPrice)}/mês · Assinatura mensal.`}
          </p>
          <p className="text-[11px] text-slate-400">
            Intenção de contratação: a confirmação do plano ocorre na etapa de assinatura após o cadastro.
          </p>
        </div>
      )}

      {refCode && (
        <div className="mb-4 p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-xl text-xs text-cyan-300 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>Indicação reconhecida ({refCode}).</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-950/50 border border-red-800/80 rounded-xl flex items-start space-x-3 text-red-200 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMessage ? (
        <div className="p-6 bg-emerald-950/40 border border-emerald-800/70 rounded-xl text-emerald-200 text-sm flex flex-col items-center text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
          <h2 className="text-base font-semibold text-white mb-2">Confirmação de E-mail Necessária</h2>
          <p className="text-slate-300 mb-4">{successMessage}</p>
          <Link
            href="/login"
            className="px-4 py-2 bg-[#0879DF] hover:bg-[#0768c0] text-white rounded-lg text-xs font-medium transition-colors"
          >
            Ir para Login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="cadastro-email" className="block text-xs font-semibold text-slate-300 mb-1.5">
              E-mail de acesso
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Mail className="h-4 w-4" />
              </div>
              <input
                id="cadastro-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full pl-10 pr-4 py-2.5 bg-[#061225] border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1CCAF2] focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div>
            <label htmlFor="cadastro-password" className="block text-xs font-semibold text-slate-300 mb-1.5">
              Senha (mínimo 6 dígitos)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock className="h-4 w-4" />
              </div>
              <input
                id="cadastro-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-[#061225] border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1CCAF2] focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div>
            <label htmlFor="cadastro-confirm-password" className="block text-xs font-semibold text-slate-300 mb-1.5">
              Confirmar senha
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock className="h-4 w-4" />
              </div>
              <input
                id="cadastro-confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-[#061225] border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1CCAF2] focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                required
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-700 bg-[#061225] text-[#1CCAF2] focus:ring-[#1CCAF2] focus:ring-offset-0"
              />
              <span className="text-xs text-slate-300 leading-snug">
                Li e concordo com os{' '}
                <Link href="/termos" target="_blank" className="text-[#1CCAF2] hover:underline font-medium">
                  Termos de Uso
                </Link>{' '}
                e a{' '}
                <Link href="/privacidade" target="_blank" className="text-[#1CCAF2] hover:underline font-medium">
                  Política de Privacidade (LGPD)
                </Link>
                .
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 flex items-center justify-center space-x-2 py-3 px-4 bg-[#35D4ED] hover:bg-[#70E6F5] text-[#06131C] font-semibold rounded-xl text-sm shadow-lg shadow-cyan-950/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Criando sua conta...</span>
              </>
            ) : (
              <>
                <span>Começar agora</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </form>
      )}

      <div className="mt-6 pt-6 border-t border-slate-800/80 text-center text-xs text-slate-400">
        Já tem uma conta?{' '}
        <Link href="/login" className="text-[#1CCAF2] hover:underline font-medium">
          Entrar
        </Link>
      </div>
    </div>
  );
}

export default function CadastroPage() {
  return (
    <div className="min-h-screen bg-[#080D18] flex flex-col justify-center items-center px-4 py-10 relative overflow-hidden">
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <Suspense
        fallback={
          <div className="w-full max-w-md p-8 bg-[#0D1B31] border border-[#1E293B] rounded-2xl shadow-2xl flex flex-col items-center justify-center min-h-[350px]">
            <Loader2 className="w-8 h-8 text-[#1CCAF2] animate-spin" />
          </div>
        }
      >
        <CadastroForm />
      </Suspense>

      <div className="mt-8 text-center text-xs text-slate-400 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className="hover:text-white transition-colors">Início</Link>
        <span>•</span>
        <Link href="/termos" className="hover:text-white transition-colors">Termos</Link>
        <span>•</span>
        <Link href="/privacidade" className="hover:text-white transition-colors">Privacidade</Link>
        <span>•</span>
        <Link href="/ajuda" className="hover:text-white transition-colors">Ajuda</Link>
      </div>
    </div>
  );
}
