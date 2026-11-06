'use client';

import React, { useState, useEffect } from 'react';
import { Send, CheckCircle2, AlertCircle, Camera, Clock, Trash2 } from 'lucide-react';
import { PlanGateCard } from '@/components/PlanGateCard';

interface TelegramState {
  hasBotToken: boolean;
  maskedToken: string;
  botUsername: string | null;
  botName: string | null;
  chatId: string;
  chatTitle: string | null;
  isActive: boolean;
  status: 'connected' | 'disconnected' | 'error';
  lastVerifiedAt: string | null;
}

export default function ChannelsConnectionPanel() {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [tgState, setTgState] = useState<TelegramState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingSend, setTestingSend] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadTelegram = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/telegram', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok && data.connection) {
        setTgState(data.connection);
        if (data.connection.chatId) setChatId(data.connection.chatId);
      }
    } catch {
      // Silencioso
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTelegram();
  }, []);

  const handleConnectTelegram = async () => {
    setFeedback(null);
    if (!botToken.trim()) {
      setFeedback({ type: 'err', text: 'Informe o Bot Token gerado pelo @BotFather no Telegram.' });
      return;
    }
    if (!chatId.trim()) {
      setFeedback({ type: 'err', text: 'Informe o Chat ID do seu canal ou grupo (ex: @meucanal ou -100123456789).' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'connect',
          botToken: botToken.trim(),
          chatId: chatId.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setBotToken('');
        setFeedback({
          type: 'ok',
          text: data.message || 'Telegram validado e conectado com sucesso!',
        });
        await loadTelegram();
      } else {
        setFeedback({
          type: 'err',
          text: data.error || 'Não foi possível validar o Bot Token ou Chat ID.',
        });
      }
    } catch {
      setFeedback({ type: 'err', text: 'Erro de conexão ao validar com a API do Telegram.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      const data = await res.json();
      if (data.ok) {
        setFeedback({ type: 'ok', text: 'Telegram desconectado.' });
        setChatId('');
        await loadTelegram();
      }
    } catch {} finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    setTestingSend(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          text: '✅ Teste oficial de conexão do painel Radar de Ofertas no Telegram!',
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setFeedback({ type: 'ok', text: 'Mensagem de teste enviada ao seu canal/grupo do Telegram!' });
      } else {
        setFeedback({ type: 'err', text: data.error || 'Falha ao enviar mensagem de teste.' });
      }
    } catch {
      setFeedback({ type: 'err', text: 'Erro de rede ao testar envio no Telegram.' });
    } finally {
      setTestingSend(false);
    }
  };

  return (
    <div className="rp-stack" style={{ marginTop: 16 }}>
      {feedback && (
        <div
          className="rp-panel"
          style={{
            borderColor: feedback.type === 'ok' ? '#10b981' : '#ef4444',
            background: feedback.type === 'ok' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          }}
        >
          <p style={{ color: feedback.type === 'ok' ? '#6ee7b7' : '#fca5a5', fontSize: 13 }}>
            {feedback.text}
          </p>
        </div>
      )}

      {/* 1. INTEGRAÇÃO OFICIAL TELEGRAM BOT API (PLUS E ULTIMATE) */}
      <PlanGateCard
        feature="telegram_posting"
        requiredPlan="plus"
        title="Postagem Automática no Telegram (API Oficial de Bots)"
        description="Conecte seu próprio Bot do Telegram (@BotFather) para disparar ofertas com foto, preço e link de afiliado direto nos seus canais e grupos do Telegram. Disponível nos planos Plus e Ultimate."
      >
        <div className="rp-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Send className="w-5 h-5 text-sky-400" />
              Telegram (API Oficial de Bots)
            </h2>

            {tgState?.status === 'connected' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 text-xs font-bold text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Conectado: {tgState.botUsername} → {tgState.chatTitle || tgState.chatId}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/20 border border-slate-400/30 px-3 py-1 text-xs font-semibold text-slate-300">
                <AlertCircle className="w-3.5 h-3.5" />
                Aguardando configuração
              </span>
            )}
          </div>

          <p className="rp-sub">
            1. Crie um bot no Telegram conversando com o <strong>@BotFather</strong> (comando <code>/newbot</code>) e copie o Token.<br />
            2. Adicione o seu bot como <strong>Administrador</strong> no seu canal ou grupo do Telegram.<br />
            3. Informe abaixo o Token e o Chat ID (ex.: <code>@seucanal</code> ou <code>-100123456789</code>) e clique em Validar.
          </p>

          <div className="rp-two-cols" style={{ marginTop: 14 }}>
            <label className="rp-field">
              <span>
                Bot Token {tgState?.hasBotToken ? `(Salvo: ${tgState.maskedToken})` : '*'}
              </span>
              <input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="Ex: 7123456789:AAHxyz..."
              />
            </label>

            <label className="rp-field">
              <span>Chat ID do Canal ou Grupo *</span>
              <input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="Ex: @ofertas_vip ou -1001987654321"
              />
            </label>
          </div>

          <div className="rp-inline-actions rp-section">
            <button
              type="button"
              className="rp-btn rp-primary"
              disabled={saving || loading}
              onClick={handleConnectTelegram}
            >
              {saving ? 'Validando na API do Telegram...' : 'Validar e conectar Telegram'}
            </button>

            {tgState?.status === 'connected' && (
              <>
                <button
                  type="button"
                  className="rp-btn"
                  disabled={testingSend}
                  onClick={handleSendTest}
                >
                  {testingSend ? 'Enviando...' : 'Enviar mensagem de teste'}
                </button>

                <button
                  type="button"
                  className="rp-btn rp-quiet"
                  disabled={saving}
                  onClick={handleDisconnect}
                  style={{ color: '#fca5a5' }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1 inline" />
                  Desconectar
                </button>
              </>
            )}
          </div>
        </div>
      </PlanGateCard>

      {/* 2. POSTAGEM NO INSTAGRAM — AVISO "EM BREVE" */}
      <div className="rp-panel" style={{ border: '1px solid rgba(236, 72, 153, 0.28)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'rgba(236, 72, 153, 0.16)',
                border: '1px solid rgba(236, 72, 153, 0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f472b6',
              }}
            >
              <Camera className="w-5 h-5" />
            </span>
            <div>
              <h2 style={{ margin: 0 }}>Postagem direta no Instagram</h2>
              <p className="rp-sub" style={{ margin: '2px 0 0' }}>
                Publicação direta de Stories e Feed via API Oficial da Meta (Graph API).
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-400/30 px-3 py-1 text-xs font-bold text-amber-200">
            <Clock className="w-3.5 h-3.5" />
            Em breve
          </span>
        </div>

        <p className="rp-sub" style={{ marginTop: 12 }}>
          Enquanto a publicação direta no Instagram está em homologação, você já pode gerar e baixar os <strong>Cards Automáticos de Feed (1:1) e Story (9:16)</strong> com sua marca d&apos;água e legendas com IA em <strong>Criar conteúdo</strong>.
        </p>
      </div>
    </div>
  );
}

