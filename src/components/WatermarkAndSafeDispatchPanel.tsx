'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Sparkles,
  Upload,
  Move,
  ShieldCheck,
  CheckCircle2,
  Eye,
  Sliders,
} from 'lucide-react';
import { usePlan } from '@/components/PlanProvider';
import type { WatermarkPosition } from '@/lib/server/brand-settings';

const POSITION_OPTIONS: Array<{ id: WatermarkPosition; label: string }> = [
  { id: 'bottom-right', label: 'Canto inferior direito' },
  { id: 'bottom-left', label: 'Canto inferior esquerdo' },
  { id: 'top-right', label: 'Canto superior direito' },
  { id: 'top-left', label: 'Canto superior esquerdo' },
  { id: 'center', label: 'Centro da imagem' },
  { id: 'custom', label: 'Arrastar livremente' },
];

export default function WatermarkAndSafeDispatchPanel() {
  const { hasFeature, openUpgradeModal } = usePlan();
  const canCustomize = hasFeature('watermark_custom');

  const [loading, setLoading] = useState(true);
  const [savingWm, setSavingWm] = useState(false);
  const [savingSafe, setSavingSafe] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Estado da Marca d'Água e Identidade
  const [panelName, setPanelName] = useState('Radar de Ofertas');
  const [accentColor, setAccentColor] = useState('#6366f1');
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [watermarkHandle, setWatermarkHandle] = useState('@radar.ofertas.br1');
  const [watermarkLogoUrl, setWatermarkLogoUrl] = useState<string | null>(null);
  const [watermarkPosition, setWatermarkPosition] = useState<WatermarkPosition>('bottom-right');
  const [watermarkCustomX, setWatermarkCustomX] = useState<number>(82);
  const [watermarkCustomY, setWatermarkCustomY] = useState<number>(90);
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(95);
  const [watermarkScale, setWatermarkScale] = useState<number>(100);

  // Estado do Envio Seguro
  const [safeDispatchEnabled, setSafeDispatchEnabled] = useState(true);
  const [safeDispatchDelaySec, setSafeDispatchDelaySec] = useState<number>(45);
  const [safeDispatchHourlyLimit, setSafeDispatchHourlyLimit] = useState<number>(30);

  // Arrastar livremente na prévia ao vivo
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    fetch('/api/brand-settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.settings) {
          const s = data.settings;
          setPanelName(s.panelName || 'Radar de Ofertas');
          setAccentColor(s.accentColor || '#6366f1');
          setWatermarkEnabled(s.watermarkEnabled !== false);
          setWatermarkHandle(s.watermarkHandle || '@radar.ofertas.br1');
          setWatermarkLogoUrl(s.watermarkLogoUrl || null);
          setWatermarkPosition(s.watermarkPosition || 'bottom-right');
          setWatermarkCustomX(Number(s.watermarkCustomX ?? 82));
          setWatermarkCustomY(Number(s.watermarkCustomY ?? 90));
          setWatermarkOpacity(Number(s.watermarkOpacity ?? 95));
          setWatermarkScale(Number(s.watermarkScale ?? 100));
          setSafeDispatchEnabled(s.safeDispatchEnabled !== false);
          setSafeDispatchDelaySec(Number(s.safeDispatchDelaySec ?? 45));
          setSafeDispatchHourlyLimit(Number(s.safeDispatchHourlyLimit ?? 30));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Valores efetivamente exibidos na prévia (se for Impulse, mostra a marca padrão fixa)
  const displayEnabled = canCustomize ? watermarkEnabled : true;
  const displayHandle = canCustomize
    ? (watermarkHandle.trim().startsWith('@') ? watermarkHandle.trim() : `@${watermarkHandle.trim() || 'radar.ofertas.br1'}`)
    : '@radar.ofertas.br1';
  const displayLogo = canCustomize ? watermarkLogoUrl : null;
  const displayPosition: WatermarkPosition = canCustomize ? watermarkPosition : 'bottom-right';
  const displayOpacity = canCustomize ? watermarkOpacity : 95;
  const displayScale = canCustomize ? watermarkScale : 100;

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canCustomize) {
      openUpgradeModal('plus', 'Marca d’água personalizável', 'Envie sua própria logo e personalize seu @ no plano Plus.');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1500 * 1024) {
      setFeedback({ type: 'err', text: 'A imagem da logo deve ter até 1,5 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setWatermarkLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const updatePointerDrag = (clientX: number, clientY: number) => {
    if (!canCustomize || !previewBoxRef.current) return;
    const rect = previewBoxRef.current.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * 100;
    const relY = ((clientY - rect.top) / rect.height) * 100;
    setWatermarkPosition('custom');
    setWatermarkCustomX(Math.round(Math.max(12, Math.min(88, relX))));
    setWatermarkCustomY(Math.round(Math.max(10, Math.min(92, relY))));
  };

  const handleSaveWatermark = async () => {
    if (!canCustomize) {
      openUpgradeModal(
        'plus',
        'Marca d’água 100% personalizável',
        'No plano Impulse a marca d’água padrão (@radar.ofertas.br1) é fixa. Faça upgrade para o plano Plus para colocar sua logo, seu @, escolher a posição e ajustar opacidade e tamanho.'
      );
      return;
    }

    setSavingWm(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/brand-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          panelName,
          accentColor,
          watermarkEnabled,
          watermarkHandle,
          watermarkLogoUrl,
          watermarkPosition,
          watermarkCustomX,
          watermarkCustomY,
          watermarkOpacity,
          watermarkScale,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setFeedback({
          type: 'ok',
          text: 'Marca d’água e identidade visual salvas! Todas as próximas ofertas do Copiador e dos Envios já usarão sua configuração.',
        });
        window.dispatchEvent(new CustomEvent('brand-settings-updated'));
      } else {
        setFeedback({ type: 'err', text: data.error || 'Erro ao salvar marca d’água.' });
      }
    } catch {
      setFeedback({ type: 'err', text: 'Erro de conexão ao salvar marca d’água.' });
    } finally {
      setSavingWm(false);
    }
  };

  const handleSaveSafeDispatch = async () => {
    setSavingSafe(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/brand-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_safe_dispatch',
          safeDispatchEnabled,
          safeDispatchDelaySec,
          safeDispatchHourlyLimit,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setFeedback({
          type: 'ok',
          text: `Envio Seguro atualizado (${safeDispatchDelaySec}s entre mensagens e limite de ${safeDispatchHourlyLimit}/hora).`,
        });
      } else {
        setFeedback({ type: 'err', text: data.error || 'Erro ao salvar Envio Seguro.' });
      }
    } catch {
      setFeedback({ type: 'err', text: 'Erro de conexão ao salvar Envio Seguro.' });
    } finally {
      setSavingSafe(false);
    }
  };

  // Cálculo do estilo da pílula na prévia ao vivo
  const getPreviewBadgePositionStyle = (): React.CSSProperties => {
    const baseScale = displayScale / 100;
    if (displayPosition === 'bottom-left') {
      return { bottom: 16, left: 16, transform: `scale(${baseScale})`, transformOrigin: 'bottom left' };
    }
    if (displayPosition === 'top-right') {
      return { top: 16, right: 16, transform: `scale(${baseScale})`, transformOrigin: 'top right' };
    }
    if (displayPosition === 'top-left') {
      return { top: 16, left: 16, transform: `scale(${baseScale})`, transformOrigin: 'top left' };
    }
    if (displayPosition === 'center') {
      return {
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${baseScale})`,
        transformOrigin: 'center center',
      };
    }
    if (displayPosition === 'custom') {
      return {
        top: `${watermarkCustomY}%`,
        left: `${watermarkCustomX}%`,
        transform: `translate(-50%, -50%) scale(${baseScale})`,
        transformOrigin: 'center center',
      };
    }
    // bottom-right default
    return { bottom: 16, right: 16, transform: `scale(${baseScale})`, transformOrigin: 'bottom right' };
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

      {/* BLOCO 1: MARCA D'ÁGUA PERSONALIZÁVEL COM PRÉVIA AO VIVO */}
      <div className="rp-split">
        <div className="rp-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sliders className="w-4 h-4 text-indigo-400" />
              Marca d&apos;água das ofertas
            </h2>

            {!canCustomize ? (
              <button
                type="button"
                onClick={() =>
                  openUpgradeModal(
                    'plus',
                    'Marca d’água personalizável (Plus / Ultimate)',
                    'No plano Impulse a marca d’água padrão (@radar.ofertas.br1) é fixa. Faça upgrade para o plano Plus para colocar sua logo, seu @ do Instagram, ajustar tamanho, opacidade e arrastar livremente.'
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/40 px-3 py-1 text-xs font-bold text-indigo-200 hover:bg-indigo-500/30 transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-amber-300" />
                Personalização no plano Plus
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Personalização liberada
              </span>
            )}
          </div>

          <p className="rp-sub">
            Aplicada automaticamente nas fotos do <strong>Copiador</strong>, nos <strong>Envios</strong> e nos <strong>Cards de Story/Feed</strong>.
          </p>

          {!canCustomize && (
            <div
              style={{
                marginTop: 12,
                padding: '12px 14px',
                borderRadius: 12,
                background: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                fontSize: 12,
                color: '#e0e7ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <span>
                <Lock className="w-3.5 h-3.5 inline mr-1.5 text-amber-300" />
                No plano <strong>Impulse</strong>, a marca padrão <strong>@radar.ofertas.br1</strong> permanece ativa e fixa.
              </span>
              <button
                type="button"
                onClick={() => openUpgradeModal('plus', 'Marca d’água personalizável')}
                style={{
                  padding: '5px 10px',
                  borderRadius: 8,
                  background: '#6366f1',
                  color: '#fff',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                Liberar no Plus
              </button>
            </div>
          )}

          {/* Controles da Marca d'Água (com cadeado no Impulse) */}
          <div style={{ opacity: canCustomize ? 1 : 0.6, marginTop: 14 }} className="rp-stack">
            <label className="rp-check" style={{ cursor: canCustomize ? 'pointer' : 'not-allowed' }}>
              <input
                type="checkbox"
                checked={displayEnabled}
                disabled={!canCustomize}
                onChange={(e) => setWatermarkEnabled(e.target.checked)}
              />
              <span>
                Ativar marca d&apos;água nas imagens das ofertas{' '}
                {!canCustomize && <Lock className="w-3 h-3 inline ml-1 text-amber-300" />}
              </span>
            </label>

            <div className="rp-two-cols">
              <label className="rp-field">
                <span>
                  Seu @ do Instagram{' '}
                  {!canCustomize && <Lock className="w-3 h-3 inline ml-1 text-amber-300" />}
                </span>
                <input
                  value={displayHandle}
                  disabled={!canCustomize}
                  onChange={(e) => setWatermarkHandle(e.target.value)}
                  placeholder="@seu.perfil.ofertas"
                />
              </label>

              <div className="rp-field">
                <span>
                  Logo da marca d&apos;água{' '}
                  {!canCustomize && <Lock className="w-3 h-3 inline ml-1 text-amber-300" />}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <label
                    className="rp-btn"
                    style={{
                      cursor: canCustomize ? 'pointer' : 'not-allowed',
                      fontSize: 12,
                      padding: '7px 12px',
                    }}
                  >
                    <Upload className="w-3.5 h-3.5 mr-1.5 inline" />
                    {watermarkLogoUrl ? 'Trocar logo' : 'Enviar logo (PNG/JPG)'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={!canCustomize}
                      onChange={handleLogoFileChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {canCustomize && watermarkLogoUrl && (
                    <button
                      type="button"
                      className="rp-btn rp-quiet"
                      onClick={() => setWatermarkLogoUrl(null)}
                      style={{ fontSize: 11 }}
                    >
                      Usar padrão
                    </button>
                  )}
                </div>
              </div>
            </div>

            <label className="rp-field">
              <span>
                Posição da marca d&apos;água{' '}
                {!canCustomize && <Lock className="w-3 h-3 inline ml-1 text-amber-300" />}
              </span>
              <select
                value={displayPosition}
                disabled={!canCustomize}
                onChange={(e) => setWatermarkPosition(e.target.value as WatermarkPosition)}
              >
                {POSITION_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="rp-two-cols">
              <label className="rp-field">
                <span>
                  Opacidade: <strong>{displayOpacity}%</strong>{' '}
                  {!canCustomize && <Lock className="w-3 h-3 inline ml-1 text-amber-300" />}
                </span>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={displayOpacity}
                  disabled={!canCustomize}
                  onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                />
              </label>

              <label className="rp-field">
                <span>
                  Tamanho: <strong>{displayScale}%</strong>{' '}
                  {!canCustomize && <Lock className="w-3 h-3 inline ml-1 text-amber-300" />}
                </span>
                <input
                  type="range"
                  min={60}
                  max={145}
                  value={displayScale}
                  disabled={!canCustomize}
                  onChange={(e) => setWatermarkScale(Number(e.target.value))}
                />
              </label>
            </div>

            <div className="rp-two-cols">
              <label className="rp-field">
                <span>
                  Nome do seu Painel / Marca{' '}
                  {!canCustomize && <Lock className="w-3 h-3 inline ml-1 text-amber-300" />}
                </span>
                <input
                  value={canCustomize ? panelName : 'Radar de Ofertas'}
                  disabled={!canCustomize}
                  onChange={(e) => setPanelName(e.target.value)}
                  placeholder="Ex: Central de Ofertas VIP"
                />
              </label>

              <label className="rp-field">
                <span>
                  Cor de destaque do painel{' '}
                  {!canCustomize && <Lock className="w-3 h-3 inline ml-1 text-amber-300" />}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="color"
                    value={canCustomize ? accentColor : '#6366f1'}
                    disabled={!canCustomize}
                    onChange={(e) => setAccentColor(e.target.value)}
                    style={{ width: 42, height: 36, padding: 2, borderRadius: 8, cursor: canCustomize ? 'pointer' : 'not-allowed' }}
                  />
                  <span style={{ fontSize: 12, color: '#cbd5e1' }}>
                    {canCustomize ? accentColor : '#6366f1 (Padrão)'}
                  </span>
                </div>
              </label>
            </div>
          </div>

          <div className="rp-inline-actions rp-section">
            <button
              type="button"
              className="rp-btn rp-primary"
              disabled={savingWm || loading}
              onClick={handleSaveWatermark}
            >
              {canCustomize ? (
                savingWm ? (
                  'Salvando marca d’água...'
                ) : (
                  'Salvar marca d’água e identidade'
                )
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5 inline" />
                  Desbloquear personalização no plano Plus
                </>
              )}
            </button>
          </div>
        </div>

        {/* Coluna da Direita: Prévia ao Vivo Interativa (com suporte a arrastar livremente!) */}
        <div className="rp-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Eye className="w-4 h-4 text-sky-400" />
              Prévia ao vivo (1:1 WhatsApp)
            </h2>
            {canCustomize && (
              <span style={{ fontSize: 11, color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Move className="w-3.5 h-3.5" /> Arraste a marca na imagem
              </span>
            )}
          </div>

          <div
            ref={previewBoxRef}
            onMouseDown={(e) => {
              if (!canCustomize) return;
              setDragging(true);
              updatePointerDrag(e.clientX, e.clientY);
            }}
            onMouseMove={(e) => {
              if (dragging && canCustomize) {
                updatePointerDrag(e.clientX, e.clientY);
              }
            }}
            onMouseUp={() => setDragging(false)}
            onMouseLeave={() => setDragging(false)}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 380,
              aspectRatio: '1 / 1',
              margin: '12px auto',
              background: '#ffffff',
              borderRadius: 16,
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.15)',
              cursor: canCustomize ? 'grab' : 'default',
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Produto ilustrativo para prévia da marca d'água */}
            <div style={{ textAlign: 'center', padding: 24, color: '#1e293b', pointerEvents: 'none' }}>
              <img
                src="/icon.png"
                alt="Produto exemplo"
                style={{ width: 120, height: 120, objectFit: 'contain', margin: '0 auto 12px', opacity: 0.9 }}
              />
              <strong style={{ display: 'block', fontSize: 14, color: '#0f172a' }}>
                Fotografia do Produto (1080×1080)
              </strong>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Enquadramento seguro sem cortes no WhatsApp
              </span>
            </div>

            {/* Pílula da Marca d'Água Renderizada ao Vivo */}
            {displayEnabled && (
              <div
                style={{
                  position: 'absolute',
                  ...getPreviewBadgePositionStyle(),
                  opacity: displayOpacity / 100,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 13px 5px 6px',
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, rgba(6,18,37,0.96) 0%, rgba(11,26,48,0.96) 100%)',
                  border: '1.5px solid rgba(28, 202, 242, 0.8)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.28)',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayLogo ? (
                  <img
                    src={displayLogo}
                    alt="Logo"
                    style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <img
                    src="/radar-logo.jpg"
                    alt="Radar"
                    style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }}
                  />
                )}
                <span style={{ width: 1, height: 16, background: 'rgba(28, 202, 242, 0.45)' }} />
                <span style={{ color: '#ffffff', fontWeight: 700, fontSize: 13, letterSpacing: 0.2 }}>
                  {displayHandle}
                </span>
              </div>
            )}
          </div>

          <p className="rp-sub" style={{ textAlign: 'center', fontSize: 12 }}>
            {canCustomize
              ? displayPosition === 'custom'
                ? `Posição personalizada: X ${watermarkCustomX}% · Y ${watermarkCustomY}% (clique ou arraste na imagem para mover)`
                : 'Dica: você pode escolher um canto na lista ou clicar e arrastar a marca d’água diretamente sobre a imagem acima.'
              : 'Marca oficial @radar.ofertas.br1 aplicada automaticamente.'}
          </p>
        </div>
      </div>

      {/* BLOCO 2: ENVIO SEGURO NO WHATSAPP (TODOS OS PLANOS) */}
      <div className="rp-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            Envio Seguro no WhatsApp
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-0.5 text-xs font-semibold text-emerald-300">
            Incluído em todos os planos
          </span>
        </div>

        <p className="rp-sub">
          Proteja seu número de WhatsApp controlando o intervalo automático entre cada mensagem e o limite máximo de envios por hora.
        </p>

        <div style={{ marginTop: 14 }} className="rp-stack">
          <label className="rp-check">
            <input
              type="checkbox"
              checked={safeDispatchEnabled}
              onChange={(e) => setSafeDispatchEnabled(e.target.checked)}
            />
            <span>Ativar proteção de Envio Seguro nos disparos para grupos</span>
          </label>

          <div className="rp-two-cols">
            <label className="rp-field">
              <span>Intervalo mínimo entre mensagens (segundos)</span>
              <input
                type="number"
                min={5}
                max={600}
                value={safeDispatchDelaySec}
                onChange={(e) => setSafeDispatchDelaySec(Number(e.target.value))}
              />
              <small style={{ color: '#94a3b8', fontSize: 11 }}>
                Recomendado: entre 30 e 60 segundos para evitar bloqueios no WhatsApp.
              </small>
            </label>

            <label className="rp-field">
              <span>Limite máximo de ofertas por hora</span>
              <input
                type="number"
                min={1}
                max={500}
                value={safeDispatchHourlyLimit}
                onChange={(e) => setSafeDispatchHourlyLimit(Number(e.target.value))}
              />
              <small style={{ color: '#94a3b8', fontSize: 11 }}>
                Recomendado: até 30 mensagens por hora por número conectado.
              </small>
            </label>
          </div>

          <div className="rp-inline-actions">
            <button
              type="button"
              className="rp-btn rp-primary"
              disabled={savingSafe}
              onClick={handleSaveSafeDispatch}
            >
              {savingSafe ? 'Salvando Envio Seguro...' : 'Salvar configurações de Envio Seguro'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
