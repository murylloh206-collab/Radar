'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail } from 'lucide-react';
import {
  markKnownAccountPreference,
  resolveIntentInfo,
  sanitizeInternalRedirect,
  SIGNUP_DRAFT_STORAGE_KEY,
} from '@/lib/access-navigation';
import '../radar-access.css';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawRedirect = searchParams.get('redirect');
  const rawRecurso = searchParams.get('recurso');
  const rawExpired = searchParams.get('expired') === '1';
  const rawPlano = searchParams.get('plano');
  const rawPeriodo = searchParams.get('periodo');

  const intent = useMemo(
    () =>
      resolveIntentInfo({
        recurso: rawRecurso,
        redirect: rawRedirect,
      }),
    [rawRecurso, rawRedirect]
  );

  const targetDestination = useMemo(() => {
    if (intent?.route) return intent.route;
    return sanitizeInternalRedirect(rawRedirect) || '/painel';
  }, [intent, rawRedirect]);

  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotNotice, setForgotNotice] = useState('');
  const [forgotWarn, setForgotWarn] = useState(false);

  // Se o usuário já possui sessão válida ativa, encaminha diretamente para o destino seguro
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

  const signupHref = `/cadastro${preservedQuery}`;
  const termosHref = `/termos?origem=login${preservedQuery ? `&${preservedQuery.slice(1)}` : ''}`;
  const privacidadeHref = `/privacidade?origem=login${preservedQuery ? `&${preservedQuery.slice(1)}` : ''}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Confira o e-mail informado para continuar.');
      return;
    }

    if (!password) {
      setError('Digite sua senha para entrar.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || 'E-mail ou senha inválidos.');
        setLoading(false);
        return;
      }

      markKnownAccountPreference();
      try {
        window.sessionStorage.removeItem(SIGNUP_DRAFT_STORAGE_KEY);
      } catch {}

      router.push(targetDestination);
      router.refresh();
    } catch {
      setError('Não foi possível conectar ao servidor agora. Tente novamente.');
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotNotice('');
    setForgotWarn(false);

    const cleanEmail = forgotEmail.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setForgotWarn(true);
      setForgotNotice('Informe um e-mail válido para continuar.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setForgotWarn(true);
        setForgotNotice(
          data.error ||
            'Não foi possível solicitar a recuperação agora. Tente novamente ou fale com o suporte.'
        );
      } else {
        setForgotWarn(false);
        setForgotNotice(
          data.message ||
            'Se este e-mail estiver vinculado a uma conta, enviaremos as instruções de recuperação.'
        );
      }
    } catch {
      setForgotWarn(true);
      setForgotNotice('Falha de conexão ao solicitar recuperação. Tente novamente.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div id="radar-access" lang="pt-BR">
      <div className="shell auth-shell">
        <div className="auth-header">
          <Link href="/" className="brand" aria-label="Voltar para a página inicial do Radar de Ofertas">
            <span className="brand-mark" aria-hidden="true" />
            <span>Radar de Ofertas</span>
          </Link>

          {view === 'forgot' ? (
            <button
              type="button"
              className="back-link"
              onClick={() => {
                setForgotNotice('');
                setView('login');
              }}
            >
              ← Voltar para o login
            </button>
          ) : (
            <Link href="/" className="back-link">
              ← Voltar para a página inicial
            </Link>
          )}
        </div>

        {view === 'login' ? (
          <div className="auth-layout">
            <aside className="auth-art" aria-label="Identidade do Radar de Ofertas">
              <div>
                <span className="overline">Sua operação em ordem</span>
                <h2>Entre e continue de onde parou.</h2>
                <p>
                  Seus grupos, seus modelos e suas integrações ficam reunidos em um só painel.
                </p>
              </div>

              <div className="brand-world" aria-hidden="true">
                <span className="world-ring" />
                <span className="floating-label top">Sua identidade</span>
                <div className="floating-poster">
                  <img
                    src="/assets/camiseta-oversized-preta.webp"
                    alt=""
                    width={76}
                    height={92}
                  />
                  <div>
                    <small>Radar de Ofertas</small>
                    <strong>Sua marca em destaque</strong>
                    <span>Link da sua conta</span>
                  </div>
                </div>
                <span className="floating-label bottom">Canais sob seu controle</span>
              </div>

              <p className="auth-footnote">
                Acesse sua conta para abrir os recursos do seu plano.
              </p>
            </aside>

            <div className="auth-form">
              <span className="overline">Acesso à conta</span>
              <h1>Bom ver você por aqui.</h1>
              <p>Use o e-mail e a senha da sua conta para entrar no painel.</p>

              {rawExpired && !error && (
                <div className="form-message warn" role="status" aria-live="polite" style={{ marginTop: 16 }}>
                  Sua sessão expirou. Entre novamente para continuar.
                </div>
              )}

              {intent && (
                <div className="intent" id="ra-login-intent">
                  <span>
                    Depois do acesso, você continuará em <strong>{intent.name}</strong>.
                  </span>
                </div>
              )}

              <form id="ra-login-form" onSubmit={handleSubmit} noValidate>
                <div className="field">
                  <label htmlFor="login-email">E-mail</label>
                  <input
                    id="login-email"
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
                  <div className="form-row">
                    <label htmlFor="login-password">Senha</label>
                    <button
                      type="button"
                      className="inline-link"
                      onClick={() => {
                        setError('');
                        setForgotNotice('');
                        setForgotEmail(email);
                        setView('forgot');
                      }}
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="password-wrap">
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Digite sua senha"
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
                </div>

                {error && (
                  <div className="form-message warn" id="ra-login-msg" role="status" aria-live="polite">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="action primary wide-button"
                  disabled={loading}
                >
                  {loading ? 'Entrando...' : 'Entrar no painel →'}
                </button>
              </form>

              <div className="auth-switch">
                <span>Primeira vez por aqui?</span>
                <Link href={signupHref} className="inline-link">
                  Criar minha conta
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="simple-auth">
            <div className="mail-visual" aria-hidden="true">
              <Mail width={26} height={26} />
            </div>
            <span className="overline">Recuperação de acesso</span>
            <h1>Vamos ajudar você a voltar.</h1>
            <p>
              Informe o e-mail da sua conta para receber as instruções de redefinição de senha.
            </p>

            <form id="ra-forgot-form" onSubmit={handleForgotSubmit} noValidate>
              <div className="field">
                <label htmlFor="forgot-email">E-mail da conta</label>
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />
              </div>

              {forgotNotice && (
                <div
                  className={`form-message${forgotWarn ? ' warn' : ''}`}
                  id="ra-forgot-msg"
                  role="status"
                  aria-live="polite"
                >
                  {forgotNotice}
                </div>
              )}

              <button
                type="submit"
                className="action primary wide-button"
                disabled={forgotLoading}
              >
                {forgotLoading ? 'Enviando...' : 'Enviar instruções →'}
              </button>
            </form>

            <div className="auth-switch">
              <span>Lembrou a senha?</span>
              <button
                type="button"
                className="inline-link"
                onClick={() => {
                  setForgotNotice('');
                  setView('login');
                }}
              >
                Voltar para o login
              </button>
            </div>
          </div>
        )}

        <div className="auth-bottom">
          <span>Radar de Ofertas · Acesso seguro</span>
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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div id="radar-access" lang="pt-BR">
          <div className="shell auth-shell" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
