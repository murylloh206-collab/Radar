'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { Logo } from '@/components/Logo';

const REQUIRE_AUTH = process.env.NEXT_PUBLIC_REQUIRE_AUTH === 'true';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || 'Falha ao autenticar. Verifique seus dados.');
        return;
      }

      router.push(redirectPath);
      router.refresh();
    } catch {
      setError('Erro de conexão ao tentar fazer login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const isExpired = searchParams.get('expired') === 'true';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isExpired && !error && (
        <div className="p-3.5 rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/30 text-xs font-semibold text-[#F59E0B] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Sua sessão expirou por segurança. Faça login para retornar exatamente à tela de integração.</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-[#F87171]/15 border border-[#F87171]/30 text-xs font-semibold text-[#F87171] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-[#8EADC7] block mb-1.5">
          E-mail de Acesso
        </label>
        <div className="relative">
          <Mail className="w-4 h-4 text-[#8EADC7] absolute left-3.5 top-3.5" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@radarofertas.com"
            className="w-full min-h-[48px] bg-[#061225] border border-[#18334D] rounded-xl pl-10 pr-3 text-xs sm:text-sm text-[#F8FBFF] placeholder-[#8EADC7]/40 focus:outline-none focus:border-[#1CCAF2] transition-colors"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-[#8EADC7] block mb-1.5">
          Senha de Segurança
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-[#8EADC7] absolute left-3.5 top-3.5" />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full min-h-[48px] bg-[#061225] border border-[#18334D] rounded-xl pl-10 pr-3 text-xs sm:text-sm text-[#F8FBFF] placeholder-[#8EADC7]/40 focus:outline-none focus:border-[#1CCAF2] transition-colors"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full min-h-[48px] rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] shadow-lg shadow-[#1CCAF2]/20 hover:opacity-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        <span>{loading ? 'Validando acesso...' : 'Entrar no Radar'}</span>
        <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  );
}

function RedirectToApp() {
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/';

  useEffect(() => {
    const dest = redirectTarget.startsWith('/login') ? '/' : redirectTarget;
    window.location.replace(dest);
  }, [redirectTarget]);

  return (
    <div className="min-h-screen bg-[#061225] flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-4">
        <Logo size="lg" />
        <div className="flex items-center justify-center gap-2 text-sm text-[#8EADC7]">
          <Loader2 className="w-4 h-4 animate-spin text-[#1CCAF2]" />
          <span>Acessando o Painel Operacional...</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  if (!REQUIRE_AUTH) {
    return (
      <Suspense fallback={null}>
        <RedirectToApp />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-[#061225] flex flex-col items-center justify-center p-4 selection:bg-[#1CCAF2]/30 selection:text-[#F8FBFF]">
      <div className="w-full max-w-md space-y-6">
        {/* Logo e Cabeçalho */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-3">
            <Logo size="lg" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-[#F8FBFF] tracking-tight">
            Acesso ao Painel Operacional
          </h1>
          <p className="text-xs sm:text-sm text-[#8EADC7]">
            Radar de Ofertas — Gestão autônoma de ofertas e disparos WhatsApp
          </p>
        </div>

        {/* Card do Formulário */}
        <div className="rounded-3xl bg-[#0D1B31] border border-[#18334D] p-6 sm:p-8 shadow-2xl space-y-5">
          <Suspense fallback={<div className="text-xs text-[#8EADC7] text-center py-6">Carregando formulário seguro...</div>}>
            <LoginForm />
          </Suspense>

          <div className="pt-3 border-t border-[#18334D] text-center">
            <p className="text-[11px] text-[#8EADC7] flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#20C997]" />
              <span>Controle de acesso rigoroso com cookies seguros HTTP-Only.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
