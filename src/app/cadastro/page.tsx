'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { PLANS_CONFIG, PlanId } from '@/lib/plans-config';
import {
  markKnownAccountPreference,
  resolveIntentInfo,
  sanitizeInternalRedirect,
  SIGNUP_DRAFT_STORAGE_KEY,
} from '@/lib/access-navigation';
import '../radar-access.css';

interface SignupDraft {
  name?: string;
  email?: string;
  acceptedTerms?: boolean;
}

function CadastroContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawRedirect = searchParams.get('redirect');
  const rawRecurso = searchParams.get('recurso');
  const rawPlano = searchParams.get('plano');
  const rawPeriodo = searchParams.get('periodo');
  const rawRef = searchParams.get('ref');

  const intent = useMemo(
    () =>
      resolveIntentInfo({
        recurso: rawRecurso,
        redirect: rawRedirect,
      }),
    [rawRecurso, rawRedirect]
  );

  const selectedPlanLabel = useMemo(() => {
    const cleanPlan = (rawPlano || '').trim().toLowerCase() as PlanId;
    if (cleanPlan && cleanPlan in PLANS_CONFIG) {
      const def = PLANS_CONFIG[cleanPlan];
      const periodText = rawPeriodo === 'anual' ? ' (anual)' : rawPeriodo === 'mensal' ? ' (mensal)' : '';
      return `Plano ${def.name}${periodText}`;
    }
    return null;
  }, [rawPeriodo, rawPlano]);

  const targetDestination = useMemo(() => {
    if (intent?.route) return intent.route;
    return sanitizeInternalRedirect(rawRedirect) || '/painel';
  }, [intent, rawRedirect]);

  const [view, setView] = useState<'signup' | 'confirm'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Restaura campos preenchidos (exceto senha) ao voltar de Termos ou Privacidade
  useEffect(() => {
    try {
      const rawDraft = window.sessionStorage.getItem(SIGNUP_DRAFT_STORAGE_KEY);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft) as SignupDraft;
        if (typeof parsed.name === 'string') setName(parsed.name);
        if (typeof parsed.email === 'string') setEmail(parsed.email);
        if (typeof parsed.acceptedTerms === 'boolean') setAcceptedTerms(parsed.acceptedTerms);
      }
    } catch {}
    setDraftHydrated(true);
  }, []);

  // Salva rascunho seguro em sessionStorage (nunca armazena a senha)
  useEffect(() => {
    if (!draftHydrated) return;
    try {
      const payload: SignupDraft = {
        name,
        email,
        acceptedTerms,
      };
      window.sessionStorage.setItem(SIGNUP_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }, [acceptedTerms, draftHydrated, email, name]);

  // Se já estiver autenticado com cookie válido, encaminha para o destino
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session?strict=1', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.hasCookieSession) {
          markKnownAccountPreference();
          router.replace(targetDestination);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router, targetDestination]);

  const preservedQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (rawRecurso) params.set('recurso', rawRecurso);
    if (rawRedirect) params.set('redirect', rawRedirect);
    if (rawPlano) params.set('plano', rawPlano);
    if (rawPeriodo) params.set('periodo', rawPeriodo);
    const str = params.toString();
    return str ? `?${str}` : '';
  }, [rawPeriodo, rawPlano, rawRecurso, rawRedirect]);

  const loginHref = `/login${preservedQuery}`;
  const termosHref = `/termos?origem=cadastro${preservedQuery ? `&${preservedQuery.slice(1)}` : ''}`;
  const privacidadeHref = `/privacidade?origem=cadastro${preservedQuery ? `&${preservedQuery.slice(1)}` : ''}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanName = name.trim();
    const cleanEmail = email.trim();

    if (!cleanName) {
      setError('Informe seu nome ou o nome da sua marca.');
      return;
    }

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Informe um e-mail válido.');
      return;
    }

    if (password.length < 8) {
      setError('Use pelo menos 8 caracteres na senha.');
      return;
    }

    if (!acceptedTerms) {
      setError('Confirme os Termos de uso e a ciência da Política de Privacidade para continuar.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          password,
          acceptedTerms,
          refCode: rawRef || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || 'Não foi possível criar sua conta agora.');
        setLoading(false);
        return;
      }

      markKnownAccountPreference();
      try {
        window.sessionStorage.removeItem(SIGNUP_DRAFT_STORAGE_KEY);
      } catch {}

      if (data.requiresEmailConfirmation) {
        setPassword('');
        setLoading(false);
        setView('confirm');
      } else {
        router.push(targetDestination);
        router.refresh();
      }
    } catch {
      setError('Não foi possível conectar ao servidor agora. Tente novamente.');
      setLoading(false);
    }
  };

  const intentDisplayName = intent?.name || selectedPlanLabel;

  return (
    <div id="radar-access" lang="pt-BR">
      <div className="shell auth-shell">
        <div className="auth-header">
          <Link href="/" className="brand" aria-label="Voltar para a página inicial do Radar de Ofertas">
            <span className="brand-mark" aria-hidden="true" />
            <span>Radar de Ofertas</span>
          </Link>

          {view === 'confirm' ? (
            <button
              type="button"
              className="back-link"
              onClick={() => setView('signup')}
            >
              ← Voltar para o cadastro
            </button>
          ) : (
            <Link href="/" className="back-link">
              ← Voltar para a página inicial
            </Link>
          )}
        </div>

        {view === 'signup' ? (
          <div className="auth-layout">
            <aside className="auth-art" aria-label="Boas-vindas ao Radar de Ofertas">
              <div>
                <span className="overline">Comece com clareza</span>
                <h2>Sua divulgação começa com a sua conta.</h2>
                <p>
                  Crie seu acesso para configurar suas integrações e escolher o plano que faz
                  sentido para a sua rotina.
                </p>
              </div>

              <div className="brand-world" aria-hidden="true">
                <span className="world-ring" />
                <span className="floating-label top">Mercado Livre + Shopee</span>
                <div className="floating-poster">
                  <img
                    src="/assets/camiseta-oversized-preta.webp"
                    alt=""
                    width={76}
                    height={92}
                  />
                  <div>
                    <small>A partir da sua conta</small>
                    <strong>Seus links e seu estilo</strong>
                    <span>Sem período de teste</span>
                  </div>
                </div>
                <span className="floating-label bottom">WhatsApp + Telegram</span>
              </div>

              <p className="auth-footnote">
                As funcionalidades disponíveis dependem do plano ativo.
              </p>
            </aside>

            <div className="auth-form">
              <span className="overline">Criar conta</span>
              <h1>Prepare o seu espaço no Radar.</h1>
              <p>Preencha seus dados para criar sua conta e continuar para o painel.</p>

              {intentDisplayName && (
                <div className="intent" id="ra-signup-intent">
                  <span>
                    Depois do cadastro, você continuará em <strong>{intentDisplayName}</strong>.
                  </span>
                </div>
              )}

              <form id="ra-signup-form" onSubmit={handleSubmit} noValidate>
                <div className="field">
                  <label htmlFor="signup-name">Como podemos chamar você?</label>
                  <input
                    id="signup-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    maxLength={80}
                    placeholder="Seu nome ou nome da sua marca"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="signup-email">E-mail</label>
                  <input
                    id="signup-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="voce@exemplo.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="signup-password">Crie uma senha</label>
                  <div className="password-wrap">
                    <input
                      id="signup-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      minLength={8}
                      placeholder="Mínimo de 8 caracteres"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="show-pass"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                  <span className="field-note">Use pelo menos 8 caracteres.</span>
                </div>

                <label className="checkbox" htmlFor="signup-terms">
                  <input
                    id="signup-terms"
                    name="terms"
                    type="checkbox"
                    required
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                  />
                  <span>
                    Li e concordo com os <Link href={termosHref}>Termos de uso</Link> e estou
                    ciente da <Link href={privacidadeHref}>Política de Privacidade</Link>.
                  </span>
                </label>

                <div className="form-info">
                  Sem cobrança nesta etapa. Os recursos dependem do plano contratado.
                </div>

                {error && (
                  <div
                    className="form-message warn"
                    id="ra-signup-msg"
                    role="status"
                    aria-live="polite"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="action primary wide-button"
                  disabled={loading}
                >
                  {loading ? 'Criando sua conta...' : 'Criar minha conta →'}
                </button>
              </form>

              <div className="auth-switch">
                <span>Já tem uma conta?</span>
                <Link href={loginHref} className="inline-link">
                  Entrar
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="simple-auth">
            <div className="mail-visual" aria-hidden="true">
              <MailCheck width={26} height={26} />
            </div>
            <span className="overline">Só falta confirmar</span>
            <h1>Confira seu e-mail.</h1>
            <p id="ra-confirm-copy">
              Enviamos um link de confirmação para <strong>{email.trim()}</strong>. Assim que
              confirmar, você poderá continuar em{' '}
              <strong>{intentDisplayName || 'seu painel'}</strong>.
            </p>

            <div className="form-info" style={{ marginTop: 18 }}>
              Se a mensagem não aparecer na caixa de entrada, verifique também a pasta de spam ou
              promoções.
            </div>

            <div className="auth-switch">
              <Link href={loginHref} className="inline-link">
                Ir para o login
              </Link>
              <button
                type="button"
                className="inline-link"
                onClick={() => setView('signup')}
              >
                Corrigir meu e-mail
              </button>
            </div>
          </div>
        )}

        <div className="auth-bottom">
          <span>Radar de Ofertas · Cadastro seguro</span>
          <div className="auth-bottom-links">
            <Link href={termosHref}>Termos de uso</Link>
            <Link href={privacidadeHref}>Privacidade</Link>
            <a
              href="https://wa.me/5519993812187"
              target="_blank"
              rel="noopener noreferrer"
            >
              Precisa de ajuda?
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CadastroPage() {
  return (
    <Suspense
      fallback={
        <div id="radar-access" lang="pt-BR">
          <div className="shell auth-shell" />
        </div>
      }
    >
      <CadastroContent />
    </Suspense>
  );
}
