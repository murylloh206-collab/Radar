'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  KeyRound,
  Trash2,
  RefreshCw,
  Loader2,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { InstagramIcon, FacebookIcon } from './SocialIcons';
import { MetaIntegrationData } from '@/lib/server/meta-graph-service';

export default function MetaConnectionPanel() {
  const [integration, setIntegration] = useState<MetaIntegrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [pageIdInput, setPageIdInput] = useState('');
  const [igIdInput, setIgIdInput] = useState('');
  const [appIdInput, setAppIdInput] = useState('');
  const [appSecretInput, setAppSecretInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/meta/status');
      const data = await res.json();
      if (data.ok && data.integration) {
        setIntegration(data.integration);
      }
    } catch {
      setFeedback({ type: 'error', message: 'Falha ao consultar conexão com a Meta.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setFeedback({ type: 'error', message: 'Cole o Token de Acesso da Meta para conectar.' });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/meta/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: tokenInput.trim(),
          pageId: pageIdInput.trim() || undefined,
          instagramAccountId: igIdInput.trim() || undefined,
          appId: appIdInput.trim() || undefined,
          appSecret: appSecretInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Não foi possível validar o token da Meta.');
      }

      setIntegration(data.integration);
      setTokenInput('');
      setFeedback({
        type: 'success',
        message: 'Conta do Instagram Comercial e Página do Facebook conectadas com sucesso!',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro ao conectar. Verifique o token e as permissões.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar a conta do Instagram / Facebook?')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/meta/connect', { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setIntegration({ isConnected: false });
        setFeedback({ type: 'success', message: 'Conta desconectada com sucesso.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Falha ao desconectar da Meta.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner Superior */}
      <div className="rounded-2xl bg-gradient-to-r from-[#061225] via-[#0D1B31] to-[#061225] border border-[#18334D] p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-gradient-to-tr from-[#833AB4] via-[#FD1D1D] to-[#FCB045] text-white shadow-md">
                <InstagramIcon className="w-5 h-5" />
              </span>
              <h2 className="text-base sm:text-lg font-black text-[#F8FBFF]">
                Instagram & Facebook Graph API
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#8EADC7] max-w-xl">
              Conecte sua Conta Comercial do Instagram e Página do Facebook para postar Stories
              direto com artes geradas das suas ofertas com 1 clique.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowTutorial(!showTutorial)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#1CCAF2] bg-[#1CCAF2]/10 border border-[#1CCAF2]/30 px-3 py-2 rounded-xl hover:bg-[#1CCAF2]/20 transition-all self-start sm:self-center cursor-pointer"
          >
            <HelpCircle className="w-4 h-4" />
            {showTutorial ? 'Ocultar Tutorial' : 'Como Gerar o Token?'}
          </button>
        </div>
      </div>

      {/* Tutorial Passo a Passo */}
      {showTutorial && (
        <div className="rounded-2xl bg-[#0D1B31] border border-[#1CCAF2]/40 p-5 space-y-4 text-xs text-[#8EADC7]">
          <div className="flex items-center justify-between border-b border-[#18334D] pb-3">
            <h3 className="text-sm font-bold text-[#F8FBFF] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#1CCAF2]" />
              Como gerar um Token Permanente (que nunca expira):
            </h3>
            <span className="text-[10px] uppercase font-black text-[#F59E0B] bg-[#F59E0B]/15 px-2 py-0.5 rounded-full border border-[#F59E0B]/30">
              Evite Tokens Temporários de 1h
            </span>
          </div>

          {/* Alerta de Token Curto */}
          <div className="p-3 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] text-xs leading-relaxed">
            <strong>⚠️ Atenção:</strong> O Meta Graph API Explorer por padrão gera tokens de usuário que <strong>expiram em 1 ou 2 horas</strong> (causando o erro <em>Session has expired</em>). Para automações 24/7 sem interrupções, utilize o <strong>Método 1 (Usuário do Sistema)</strong> abaixo.
          </div>

          {/* Método 1 */}
          <div className="space-y-2 rounded-xl bg-[#061225] p-4 border border-[#18334D]">
            <h4 className="font-extrabold text-[#20C997] text-xs flex items-center gap-1.5">
              <span>Opção 1 (Recomendada):</span> Token Permanente via Usuário do Sistema (Sem Expiração)
            </h4>
            <ol className="list-decimal list-inside space-y-1.5 text-[#F8FBFF]/90">
              <li>
                Acesse o{' '}
                <a
                  href="https://business.facebook.com/settings/system-users"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#1CCAF2] underline font-bold"
                >
                  Meta Business Suite &gt; Usuários do Sistema <ExternalLink className="w-3 h-3 inline" />
                </a>.
              </li>
              <li>
                Clique em <strong>Adicionar</strong>, crie um usuário com função de <strong>Administrador</strong> (ex: "Radar Bot").
              </li>
              <li>
                Clique em <strong>Atribuir Ativos</strong>: marque sua <strong>Página do Facebook</strong> e seu <strong>Instagram Comercial</strong> com permissões totais de publicação e clique em Salvar.
              </li>
              <li>
                Clique em <strong>Gerar Novo Token</strong>, selecione seu aplicativo e, no campo <em>Validade do token</em>, escolha <strong>Sem expiração (Never expire)</strong>.
              </li>
              <li>
                Marque as permissões obrigatórias:
                <span className="block mt-1 font-mono text-[11px] text-[#20C997] bg-[#090E1A] p-2 rounded-lg border border-[#18334D]">
                  pages_show_list, instagram_basic, instagram_content_publish, pages_read_engagement, pages_manage_posts
                </span>
              </li>
              <li>Copie o token gerado e cole no formulário abaixo. Esse token <strong>nunca expira</strong>.</li>
            </ol>
          </div>

          {/* Método 2 */}
          <div className="space-y-2 rounded-xl bg-[#061225] p-4 border border-[#18334D]">
            <h4 className="font-extrabold text-[#1CCAF2] text-xs flex items-center gap-1.5">
              <span>Opção 2:</span> Estender Token via Token Debugger da Meta (60 dias a Permanente)
            </h4>
            <ol className="list-decimal list-inside space-y-1.5 text-[#F8FBFF]/90">
              <li>
                Gere um token no{' '}
                <a
                  href="https://developers.facebook.com/tools/explorer/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#1CCAF2] underline font-bold"
                >
                  Graph API Explorer <ExternalLink className="w-3 h-3 inline" />
                </a>
                . No campo <strong>User or Page</strong>, selecione diretamente a sua <strong>Página</strong> (e não o Usuário).
              </li>
              <li>
                Abra o{' '}
                <a
                  href="https://developers.facebook.com/tools/debug/accesstoken/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#1CCAF2] underline font-bold"
                >
                  Depurador de Tokens da Meta <ExternalLink className="w-3 h-3 inline" />
                </a>
                , cole o token e clique em <strong>Depurar</strong>.
              </li>
              <li>
                Role a página até o final e clique no botão <strong>"Estender token de acesso"</strong> (Extend Access Token).
              </li>
              <li>Copie o novo token de longa duração gerado e cole abaixo.</li>
            </ol>
          </div>
        </div>
      )}

      {/* Feedback de Operação */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-2.5 text-xs ${
            feedback.type === 'success'
              ? 'bg-[#20C997]/15 border-[#20C997]/40 text-[#20C997]'
              : 'bg-[#F87171]/15 border-[#F87171]/40 text-[#F87171]'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 font-semibold whitespace-pre-line leading-relaxed">{feedback.message}</div>
        </div>
      )}

      {/* Status da Conta Conectada */}
      {loading ? (
        <div className="p-8 text-center text-xs text-[#8EADC7] rounded-2xl bg-[#0D1B31] border border-[#18334D]">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[#1CCAF2]" />
          Consultando status da conexão com a Meta...
        </div>
      ) : integration?.isConnected ? (
        <div className="rounded-2xl bg-[#0D1B31] border border-[#20C997]/40 p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#18334D] pb-4">
            <div className="flex items-center gap-3.5">
              {integration.instagramProfilePic ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={integration.instagramProfilePic}
                  alt="Perfil"
                  className="w-12 h-12 rounded-full border-2 border-[#20C997] object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#833AB4] to-[#FD1D1D] flex items-center justify-center text-white font-black text-lg">
                  IG
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-extrabold text-[#F8FBFF]">
                    @{integration.instagramUsername || 'instagram'}
                  </h3>
                  <span className="flex items-center gap-1 text-[10px] font-black text-[#20C997] bg-[#20C997]/15 px-2.5 py-0.5 rounded-full border border-[#20C997]/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#20C997] animate-pulse"></span>
                    Ativo para Stories
                  </span>
                </div>
                <p className="text-xs text-[#8EADC7] mt-0.5 flex items-center gap-1">
                  <FacebookIcon className="w-3.5 h-3.5 text-[#1877F2]" />
                  Página vinculada: <strong>{integration.facebookPageName || 'Página do Facebook'}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadStatus}
                className="flex items-center gap-1.5 text-xs font-bold text-[#8EADC7] bg-[#061225] border border-[#18334D] px-3 py-2 rounded-xl hover:text-[#F8FBFF] transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizar
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-bold text-[#F87171] bg-[#F87171]/10 border border-[#F87171]/30 px-3 py-2 rounded-xl hover:bg-[#F87171]/20 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Desconectar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
            <div className="p-3 rounded-xl bg-[#061225] border border-[#18334D]">
              <span className="text-[#8EADC7] block text-[10px] uppercase font-bold">Tipo da Conta</span>
              <span className="font-bold text-[#F8FBFF] capitalize">Instagram Comercial</span>
            </div>
            <div className="p-3 rounded-xl bg-[#061225] border border-[#18334D]">
              <span className="text-[#8EADC7] block text-[10px] uppercase font-bold">Destino de Publicação</span>
              <span className="font-bold text-[#1CCAF2]">Instagram Stories (9:16)</span>
            </div>
            <div className="p-3 rounded-xl bg-[#061225] border border-[#18334D]">
              <span className="text-[#8EADC7] block text-[10px] uppercase font-bold">Status do Cofre</span>
              <span className="font-bold text-[#20C997] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Criptografia AES-256
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Formulário de Conexão */
        <form
          onSubmit={handleConnect}
          className="rounded-2xl bg-[#0D1B31] border border-[#18334D] p-5 sm:p-6 space-y-4 shadow-xl"
        >
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#F8FBFF] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#1CCAF2]" />
              Conectar com Access Token da Meta
            </h3>
            <p className="text-xs text-[#8EADC7]">
              Cole o Token de Acesso com permissões para a sua Página e Instagram Comercial.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[#8EADC7] block mb-1">
              Token de Acesso da Meta (Obrigatório):
            </label>
            <textarea
              rows={3}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Cole aqui seu User ou Page Access Token (ex: EAAG...)"
              className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-4 py-2.5 text-xs font-mono text-[#F8FBFF] placeholder-[#8EADC7]/40 focus:outline-none focus:border-[#1CCAF2]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-[#8EADC7] block mb-1">
                ID da Página do Facebook (Opcional):
              </label>
              <input
                type="text"
                value={pageIdInput}
                onChange={(e) => setPageIdInput(e.target.value)}
                placeholder="Ex: 104829102938472 (se a detecção automática não listar)"
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-4 py-2 text-xs font-mono text-[#F8FBFF] placeholder-[#8EADC7]/40 focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[#8EADC7] block mb-1">
                Instagram Account ID (Opcional):
              </label>
              <input
                type="text"
                value={igIdInput}
                onChange={(e) => setIgIdInput(e.target.value)}
                placeholder="Ex: 17841400000000000 (se a detecção automática não listar)"
                className="w-full bg-[#061225] border border-[#18334D] rounded-xl px-4 py-2 text-xs font-mono text-[#F8FBFF] placeholder-[#8EADC7]/40 focus:outline-none focus:border-[#1CCAF2]"
              />
            </div>
          </div>

          {/* Opções Avançadas (Opcional - Renovação Automática) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[11px] font-semibold text-[#1CCAF2] hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>{showAdvanced ? '− Ocultar' : '+ Exibir'} Opções Avançadas (App Secret para renovação automática)</span>
            </button>

            {showAdvanced && (
              <div className="mt-2.5 p-3.5 rounded-xl bg-[#061225] border border-[#18334D] grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-[#8EADC7] block mb-1">
                    Meta App ID (Opcional):
                  </label>
                  <input
                    type="text"
                    value={appIdInput}
                    onChange={(e) => setAppIdInput(e.target.value)}
                    placeholder="Ex: 123456789012345"
                    className="w-full bg-[#090E1A] border border-[#18334D] rounded-lg px-3 py-1.5 text-xs font-mono text-[#F8FBFF] placeholder-[#8EADC7]/40 focus:outline-none focus:border-[#1CCAF2]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[#8EADC7] block mb-1">
                    Meta App Secret (Opcional):
                  </label>
                  <input
                    type="password"
                    value={appSecretInput}
                    onChange={(e) => setAppSecretInput(e.target.value)}
                    placeholder="Chave secreta do seu aplicativo Meta"
                    className="w-full bg-[#090E1A] border border-[#18334D] rounded-lg px-3 py-1.5 text-xs font-mono text-[#F8FBFF] placeholder-[#8EADC7]/40 focus:outline-none focus:border-[#1CCAF2]"
                  />
                </div>
                <div className="sm:col-span-2 text-[10px] text-[#8EADC7]">
                  * Se preenchidos, o sistema tentará automaticamente estender o token para 60 dias via API.
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 text-[11px] text-[#8EADC7]">
              <ShieldCheck className="w-4 h-4 text-[#20C997]" />
              Suas credenciais são salvas criptografadas e nunca são compartilhadas.
            </div>

            <button
              type="submit"
              disabled={saving || !tokenInput.trim()}
              className="flex items-center justify-center gap-2 py-2.5 px-6 rounded-xl bg-gradient-to-r from-[#0879DF] to-[#1CCAF2] text-[#061225] text-xs font-black shadow-lg shadow-[#1CCAF2]/20 hover:opacity-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#061225]" />
                  Validando na Meta...
                </>
              ) : (
                'Salvar e Conectar Meta'
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
