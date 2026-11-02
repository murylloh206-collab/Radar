'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Settings,
  Image as ImageIcon,
  Camera,
  Eye,
  X,
  Clock,
  Shuffle,
  ListOrdered,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Save,
  Plus,
  Trash2,
  HelpCircle,
  FileText,
  Sparkles,
} from 'lucide-react';
import { CopySource } from '@/lib/types';
import { buildWhatsAppMessage, DEFAULT_TEMPLATE } from '@/lib/server/message-builder';
import './copier-settings-modal.css';

export const BUILTIN_TEMPLATES: Record<string, { id: string; name: string; templateText: string; description: string }> = {
  essencial: {
    id: 'essencial',
    name: 'Oferta essencial',
    description: 'Preço atual, preço anterior e link limpo. Ideal para promoções diárias rápidas.',
    templateText: `{gancho}

*{titulo}*

{preco_de}
🔥 *Por apenas {preco_por}* ({desconto})
{cupom}

🛒 *Compre aqui com segurança:*
{link}

{marca_dagua}`,
  },
  cupom: {
    id: 'cupom',
    name: 'Oferta com cupom e destaque',
    description: 'Destaque visual para cupons promocionais e grandes descontos.',
    templateText: `{gancho}

🏷️ *SUPER OFERTA COM CUPOM!*
*{titulo}*

{preco_de}
🔥 *Preço final: {preco_por}* ({desconto})
{cupom}

👉 *Resgate o cupom e garanta já:*
{link}

{marca_dagua}`,
  },
  curto: {
    id: 'curto',
    name: 'Texto curto e direto',
    description: 'Sem enrolação: apenas título, preço por e link de compra.',
    templateText: `*{titulo}*
🔥 *{preco_por}* ({desconto})
{cupom}

👉 {link}`,
  },
};

const VARIABLE_CHIPS = [
  { tag: '{titulo}', label: 'Título do produto' },
  { tag: '{preco_por}', label: 'Preço com desconto' },
  { tag: '{preco_de}', label: 'Preço anterior (De)' },
  { tag: '{desconto}', label: '% de desconto' },
  { tag: '{cupom}', label: 'Código do cupom' },
  { tag: '{link}', label: 'Link de afiliado (Obrigatório)' },
  { tag: '{gancho}', label: 'Frase de destaque' },
  { tag: '{marca_dagua}', label: 'Assinatura do canal' },
];

const PRESET_DELAYS = [
  { seconds: 30, label: '30s', badge: 'Rápido' },
  { seconds: 60, label: '1 min', badge: 'Equilibrado' },
  { seconds: 180, label: '3 min', badge: 'Recomendado' },
  { seconds: 300, label: '5 min', badge: 'Seguro' },
  { seconds: 600, label: '10 min', badge: 'Espaçado' },
];

function isBrasiliaInWindow(startTime: string, endTime: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date());

    const [curH, curM] = parts.split(':').map(Number);
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const nowMin = curH * 60 + curM;
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;

    if (startMin === endMin) return true;
    if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
    return nowMin >= startMin || nowMin < endMin;
  } catch {
    return true;
  }
}

export interface CopierSettingsModalProps {
  isOpen: boolean;
  isRuleActive: boolean;
  rule: CopySource | null;
  connectionId: string;
  onClose: () => void;
  onSave: (updated: Partial<CopySource>) => Promise<void>;
  onPauseRule?: () => Promise<void>;
}

export default function CopierSettingsModal({
  isOpen,
  isRuleActive,
  rule,
  connectionId,
  onClose,
  onSave,
  onPauseRule,
}: CopierSettingsModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Determinar template inicial baseado no texto salvo ou nome
  const resolveInitialTemplateId = () => {
    if (!rule?.templateText) return 'essencial';
    if (rule.templateText === BUILTIN_TEMPLATES.essencial.templateText) return 'essencial';
    if (rule.templateText === BUILTIN_TEMPLATES.cupom.templateText) return 'cupom';
    if (rule.templateText === BUILTIN_TEMPLATES.curto.templateText) return 'curto';
    return 'custom';
  };

  // Estados locais do RASCUNHO (descartáveis ao cancelar ou fechar)
  const [delaySeconds, setDelaySeconds] = useState<number>(rule?.customDelaySeconds ?? 60);
  const [customDelayInput, setCustomDelayInput] = useState<string>('');
  const [is24Hours, setIs24Hours] = useState<boolean>(
    rule?.is24Hours ?? (!rule?.startTime || rule?.startTime === '00:00' && (rule?.endTime === '00:00' || rule?.endTime === '23:59'))
  );
  const [startTime, setStartTime] = useState<string>(rule?.startTime || '08:00');
  const [endTime, setEndTime] = useState<string>(rule?.endTime || '22:00');
  const [dispatchOrder, setDispatchOrder] = useState<'sequencial' | 'aleatoria'>(
    rule?.dispatchOrder || 'sequencial'
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(resolveInitialTemplateId);
  const [templateText, setTemplateText] = useState<string>(
    rule?.templateText || BUILTIN_TEMPLATES.essencial.templateText
  );
  const [customTemplateName, setCustomTemplateName] = useState<string>(
    rule?.templateName || 'Meu Template Personalizado'
  );

  // Estados de Imagem do Copiador
  const [imageMode, setImageMode] = useState<'foto_oficial' | 'none'>(
    rule?.imageMode === 'none' ? 'none' : 'foto_oficial'
  );
  const [imageFailureFallback, setImageFailureFallback] = useState<'usar_foto_oficial' | 'revisao_manual'>(
    rule?.imageFailureFallback === 'revisao_manual' ? 'revisao_manual' : 'usar_foto_oficial'
  );
  const [watermarkHandle, setWatermarkHandle] = useState<string>(
    rule?.brandWatermarkHandle || '@radar.ofertas.br1'
  );
  const [watermarkEnabled, setWatermarkEnabled] = useState<boolean>(
    rule?.brandWatermarkEnabled !== false
  );
  const [showFullPreview, setShowFullPreview] = useState<boolean>(false);
  const [savedCustomTemplates, setSavedCustomTemplates] = useState<
    Array<{ id: string; name: string; templateText: string }>
  >(rule?.customTemplates || []);

  const [saving, setSaving] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Ao abrir o modal, redefinir o rascunho com os valores da regra atual
  useEffect(() => {
    if (isOpen) {
      setDelaySeconds(rule?.customDelaySeconds ?? 60);
      setCustomDelayInput('');
      const rule24h =
        rule?.is24Hours ??
        (!rule?.startTime || (rule?.startTime === '00:00' && (rule?.endTime === '00:00' || rule?.endTime === '23:59')));
      setIs24Hours(rule24h);
      setStartTime(rule?.startTime || '08:00');
      setEndTime(rule?.endTime || '22:00');
      setDispatchOrder(rule?.dispatchOrder || 'sequencial');

      const initialTpl = resolveInitialTemplateId();
      setSelectedTemplateId(initialTpl);
      setTemplateText(
        rule?.templateText || BUILTIN_TEMPLATES[initialTpl]?.templateText || BUILTIN_TEMPLATES.essencial.templateText
      );
      setCustomTemplateName(rule?.templateName || 'Meu Template Personalizado');
      setSavedCustomTemplates(rule?.customTemplates || []);
      setImageMode(rule?.imageMode === 'none' ? 'none' : 'foto_oficial');
      setImageFailureFallback(rule?.imageFailureFallback === 'revisao_manual' ? 'revisao_manual' : 'usar_foto_oficial');
      setWatermarkHandle(rule?.brandWatermarkHandle || '@radar.ofertas.br1');
      setWatermarkEnabled(rule?.brandWatermarkEnabled !== false);
      setValidationError(null);
    }
  }, [isOpen, rule]);

  // Tecla Esc para fechar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, saving, onClose]);

  // Checar se o horário atual de Brasília está dentro da janela
  const isInWindowNow = useMemo(() => {
    if (is24Hours) return true;
    return isBrasiliaInWindow(startTime, endTime);
  }, [is24Hours, startTime, endTime]);

  // Inserir chip de variável no textarea
  const handleInsertVariable = (variableTag: string) => {
    if (isRuleActive) return;
    const textarea = textareaRef.current;
    if (!textarea) {
      setTemplateText((prev) => prev + ' ' + variableTag);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = textarea.value;

    const nextText = current.substring(0, start) + variableTag + current.substring(end);
    setTemplateText(nextText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variableTag.length, start + variableTag.length);
    }, 10);
  };

  // Selecionar um template por card
  const handleSelectTemplateCard = (templateId: string) => {
    if (isRuleActive) return;
    setSelectedTemplateId(templateId);

    if (BUILTIN_TEMPLATES[templateId]) {
      setTemplateText(BUILTIN_TEMPLATES[templateId].templateText);
    } else {
      const custom = savedCustomTemplates.find((t) => t.id === templateId);
      if (custom) {
        setTemplateText(custom.templateText);
        setCustomTemplateName(custom.name);
      }
    }
  };

  // Salvar novo template personalizado na biblioteca local
  const handleSaveCustomTemplate = () => {
    if (isRuleActive) return;
    if (!templateText.includes('{link}')) {
      setValidationError('O template precisa conter a variável {link} antes de ser salvo.');
      return;
    }

    const newId = `custom_${Date.now()}`;
    const newTpl = {
      id: newId,
      name: customTemplateName.trim() || 'Template Personalizado',
      templateText,
    };

    setSavedCustomTemplates((prev) => [...prev, newTpl]);
    setSelectedTemplateId(newId);
    setValidationError(null);
  };

  // Excluir template personalizado
  const handleDeleteCustomTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRuleActive) return;
    setSavedCustomTemplates((prev) => prev.filter((t) => t.id !== id));
    if (selectedTemplateId === id) {
      handleSelectTemplateCard('essencial');
    }
  };

  // Prévia da mensagem em tempo real
  const livePreview = useMemo(() => {
    try {
      return buildWhatsAppMessage({
        templateText: templateText || DEFAULT_TEMPLATE,
        title: 'Fone de Ouvido Bluetooth Sem Fio Estéreo',
        originalPrice: 199.9,
        currentPrice: 129.9,
        discountPct: 35,
        couponCode: 'PROMO10',
        couponDiscount: '10% OFF extra',
        affiliateUrl: 'https://shope.ee/seu-link-afiliado',
        hookText: '🔥 *Achado imperdível do Radar*',
        watermarkText: '🎯 _Radar de Ofertas_',
      });
    } catch {
      return 'Erro ao formatar prévia do template.';
    }
  }, [templateText]);

  // Salvar configurações
  const handleSave = async () => {
    if (isRuleActive) {
      setValidationError('Pause o copiador antes de alterar suas configurações.');
      return;
    }

    if (!templateText.includes('{link}')) {
      setValidationError('O template precisa conter a variável {link} para publicar as ofertas.');
      return;
    }

    if (!is24Hours && (!startTime || !endTime)) {
      setValidationError('Preencha os horários de início e término da janela de envio.');
      return;
    }

    setSaving(true);
    setValidationError(null);

    try {
      await onSave({
        customDelaySeconds: delaySeconds,
        is24Hours,
        startTime: is24Hours ? '00:00' : startTime,
        endTime: is24Hours ? '00:00' : endTime,
        dispatchOrder,
        templateText,
        templateName: selectedTemplateId === 'custom' ? customTemplateName : BUILTIN_TEMPLATES[selectedTemplateId]?.name || 'Template',
        customTemplates: savedCustomTemplates,
        imageMode,
        imageFailureFallback,
        brandWatermarkHandle: watermarkHandle.trim() || '@radar.ofertas.br1',
        brandWatermarkEnabled: watermarkEnabled,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar as configurações.';
      setValidationError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="csm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="csm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="csm-modal">
        {/* Cabeçalho */}
        <header className="csm-header">
          <div className="csm-header-info">
            <div className="csm-header-icon" aria-hidden="true">
              <Settings size={20} />
            </div>
            <div>
              <h2 id="csm-title" className="csm-header-title">
                Configurações da Automação
                <span
                  className={`rp-tag ${isRuleActive ? 'rp-good' : 'rp-warn'}`}
                  style={{ fontSize: 10, padding: '2px 8px' }}
                >
                  {isRuleActive ? 'Copiador Ativo' : 'Copiador Pausado'}
                </span>
              </h2>
              <p className="csm-header-sub">
                {rule?.name || 'Nova Configuração'} · Intervalo, janela de funcionamento, ordem e templates
              </p>
            </div>
          </div>

          <button
            type="button"
            className="csm-close-btn"
            onClick={onClose}
            aria-label="Fechar configurações"
            disabled={saving}
          >
            <X size={18} />
          </button>
        </header>

        {/* Corpo com Scroll */}
        <div className="csm-body">
          {/* BANNER DE ESTADO E BLOQUEIO DE EDIÇÃO */}
          {isRuleActive ? (
            <div className="csm-banner csm-banner-active">
              <Lock size={18} style={{ flexShrink: 0, marginTop: 2, color: '#f59e0b' }} />
              <div>
                <strong>Modo de Leitura (Copiador Ativo)</strong>
                <p style={{ margin: '4px 0 0' }}>
                  O copiador está ativo no momento. As configurações estão disponíveis para consulta.
                  Para alterar o intervalo entre envios, horários de funcionamento, ordem de publicação ou templates,
                  é necessário <strong>pausar o copiador</strong> primeiro.
                </p>
                {onPauseRule && (
                  <button
                    type="button"
                    className="csm-banner-action-btn"
                    onClick={async () => {
                      setPausing(true);
                      try {
                        await onPauseRule();
                      } finally {
                        setPausing(false);
                      }
                    }}
                    disabled={pausing}
                  >
                    <Pause size={14} />
                    {pausing ? 'Pausando copiador...' : 'Pausar Copiador para Editar'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="csm-banner csm-banner-paused">
              <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2, color: '#10b981' }} />
              <div>
                <strong>Modo de Edição Liberado (Copiador Pausado)</strong>
                <p style={{ margin: '3px 0 0' }}>
                  Você pode alterar qualquer configuração abaixo. As alterações permanecerão como rascunho até que você clique em <strong>Salvar configurações</strong>.
                </p>
              </div>
            </div>
          )}

          {validationError && (
            <div
              style={{
                background: '#2b1c1c',
                border: '1px solid #752d2d',
                color: '#fca5a5',
                padding: '12px 16px',
                borderRadius: 10,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertTriangle size={16} />
              <span>{validationError}</span>
            </div>
          )}

          {/* SEÇÃO 1: INTERVALO ENTRE PUBLICAÇÕES */}
          <section className="csm-section">
            <div className="csm-section-head">
              <div>
                <span className="csm-section-label">Configuração 01</span>
                <h3 className="csm-section-title">Intervalo entre publicações</h3>
                <p className="csm-section-desc">
                  Tempo mínimo de espera entre envios no WhatsApp para proteger seu número contra bloqueios.
                </p>
              </div>
            </div>

            <div className="csm-segmented" role="radiogroup" aria-label="Intervalo entre mensagens">
              {PRESET_DELAYS.map((preset) => {
                const isSelected = delaySeconds === preset.seconds && customDelayInput === '';
                return (
                  <button
                    key={preset.seconds}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={isRuleActive}
                    className={`csm-seg-btn ${isSelected ? 'is-active' : ''}`}
                    onClick={() => {
                      setDelaySeconds(preset.seconds);
                      setCustomDelayInput('');
                    }}
                  >
                    <span>{preset.label}</span>
                    <small style={{ opacity: 0.7, fontSize: 10 }}>({preset.badge})</small>
                  </button>
                );
              })}

              <button
                type="button"
                role="radio"
                aria-checked={customDelayInput !== '' || !PRESET_DELAYS.some((p) => p.seconds === delaySeconds)}
                disabled={isRuleActive}
                className={`csm-seg-btn ${customDelayInput !== '' || !PRESET_DELAYS.some((p) => p.seconds === delaySeconds) ? 'is-active' : ''}`}
                onClick={() => {
                  setCustomDelayInput(String(delaySeconds));
                }}
              >
                <span>Outro</span>
              </button>
            </div>

            {(customDelayInput !== '' || !PRESET_DELAYS.some((p) => p.seconds === delaySeconds)) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <label style={{ fontSize: 12, color: '#9bb0be' }}>Intervalo personalizado (segundos):</label>
                <input
                  type="number"
                  min="5"
                  max="3600"
                  disabled={isRuleActive}
                  value={delaySeconds}
                  onChange={(e) => {
                    const val = Math.max(5, Number(e.target.value) || 5);
                    setDelaySeconds(val);
                    setCustomDelayInput(String(val));
                  }}
                  style={{
                    width: 100,
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: '#151b20',
                    border: '1px solid #374652',
                    color: '#edf2f5',
                    fontSize: 13,
                  }}
                />
                <span style={{ fontSize: 11, color: '#8fa2b1' }}>
                  (~{Math.round(delaySeconds / 60)} min)
                </span>
              </div>
            )}
          </section>

          {/* SEÇÃO 2: JANELA DE FUNCIONAMENTO (FUSO DE BRASÍLIA) */}
          <section className="csm-section">
            <div className="csm-section-head">
              <div>
                <span className="csm-section-label">Configuração 02</span>
                <h3 className="csm-section-title">Janela de funcionamento</h3>
                <p className="csm-section-desc">
                  Escolha se o Copiador funciona 24 horas ou apenas em um intervalo de horário (Fuso de Brasília).
                </p>
              </div>
            </div>

            <div className="csm-segmented" role="radiogroup" aria-label="Modo de horário">
              <button
                type="button"
                role="radio"
                aria-checked={is24Hours}
                disabled={isRuleActive}
                className={`csm-seg-btn ${is24Hours ? 'is-active' : ''}`}
                onClick={() => setIs24Hours(true)}
              >
                <Clock size={15} />
                <span>24 horas ininterruptas</span>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={!is24Hours}
                disabled={isRuleActive}
                className={`csm-seg-btn ${!is24Hours ? 'is-active' : ''}`}
                onClick={() => setIs24Hours(false)}
              >
                <Clock size={15} />
                <span>Janela com horário de início e término</span>
              </button>
            </div>

            {!is24Hours && (
              <div className="csm-time-row">
                <div className="csm-time-group">
                  <label htmlFor="csm-start-time">Início (Brasília):</label>
                  <input
                    id="csm-start-time"
                    type="time"
                    disabled={isRuleActive}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>

                <div className="csm-time-group">
                  <label htmlFor="csm-end-time">Término (Brasília):</label>
                  <input
                    id="csm-end-time"
                    type="time"
                    disabled={isRuleActive}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>

                <div
                  className={`csm-time-pill ${isInWindowNow ? 'csm-time-pill-in' : 'csm-time-pill-out'}`}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: isInWindowNow ? '#10b981' : '#f59e0b',
                    }}
                  />
                  <span>
                    {isInWindowNow ? 'Dentro da janela agora' : 'Fora da janela (envios pausarão)'}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* SEÇÃO 3: ORDEM DAS PUBLICAÇÕES (DOIS CARDS INTERATIVOS) */}
          <section className="csm-section">
            <div className="csm-section-head">
              <div>
                <span className="csm-section-label">Configuração 03</span>
                <h3 className="csm-section-title">Ordem das publicações</h3>
                <p className="csm-section-desc">
                  Como as ofertas pendentes e aprovadas desta regra serão ordenadas para publicação nos destinos.
                </p>
              </div>
            </div>

            <div className="csm-cards-grid" role="radiogroup" aria-label="Ordem das publicações">
              {/* Card 1: Em Sequência */}
              <div
                role="radio"
                tabIndex={isRuleActive ? -1 : 0}
                aria-checked={dispatchOrder === 'sequencial'}
                className={`csm-card ${dispatchOrder === 'sequencial' ? 'is-active' : ''} ${isRuleActive ? 'is-disabled' : ''}`}
                onClick={() => !isRuleActive && setDispatchOrder('sequencial')}
                onKeyDown={(e) => {
                  if ((e.key === ' ' || e.key === 'Enter') && !isRuleActive) setDispatchOrder('sequencial');
                }}
              >
                <div className="csm-card-top">
                  <div className="csm-card-icon">
                    <ListOrdered size={18} />
                  </div>
                  <span className="csm-card-badge">Padrão</span>
                </div>
                <h4 className="csm-card-title">Em sequência</h4>
                <p className="csm-card-desc">
                  Seguindo a ordem de recebimento da origem (primeiro a chegar, primeiro a sair).
                  Preserva a ordem cronológica exata das promoções.
                </p>
              </div>

              {/* Card 2: Aleatória */}
              <div
                role="radio"
                tabIndex={isRuleActive ? -1 : 0}
                aria-checked={dispatchOrder === 'aleatoria'}
                className={`csm-card ${dispatchOrder === 'aleatoria' ? 'is-active' : ''} ${isRuleActive ? 'is-disabled' : ''}`}
                onClick={() => !isRuleActive && setDispatchOrder('aleatoria')}
                onKeyDown={(e) => {
                  if ((e.key === ' ' || e.key === 'Enter') && !isRuleActive) setDispatchOrder('aleatoria');
                }}
              >
                <div className="csm-card-top">
                  <div className="csm-card-icon">
                    <Shuffle size={18} />
                  </div>
                  <span className="csm-card-badge">Variada</span>
                </div>
                <h4 className="csm-card-title">Aleatória</h4>
                <p className="csm-card-desc">
                  Escolhe entre as ofertas pendentes e aprovadas desta regra de forma aleatória.
                  Não repete ofertas já publicadas nem mistura contas, regras ou destinos.
                </p>
              </div>
            </div>
          </section>

          {/* SEÇÃO 4: IMAGEM DO PRODUTO */}
          <section className="csm-section">
            <div className="csm-section-head">
              <div>
                <span className="csm-section-label">Configuração 04</span>
                <h3 className="csm-section-title">Imagem da publicação</h3>
                <p className="csm-section-desc">
                  Configuração de formato e qualidade das fotos enviadas para os grupos de WhatsApp.
                </p>
              </div>
            </div>

            {/* Grid de Cards: Foto Oficial Otimizada vs Sem Imagem */}
            <div className="csm-cards-grid" role="radiogroup" aria-label="Modo de imagem do produto">
              {/* Card 1: Foto Oficial Otimizada */}
              <div
                className={`csm-card ${imageMode !== 'none' ? 'csm-card-active' : ''} ${isRuleActive ? 'csm-card-disabled' : ''}`}
                onClick={() => !isRuleActive && setImageMode('foto_oficial')}
                role="radio"
                aria-checked={imageMode !== 'none'}
                tabIndex={isRuleActive ? -1 : 0}
              >
                <div className="csm-card-top">
                  <div className="csm-card-icon" aria-hidden="true">
                    <Camera size={18} />
                  </div>
                  <span className="csm-card-badge" style={{ background: 'rgba(57, 190, 230, 0.15)', color: '#39bee6' }}>
                    Recomendado
                  </span>
                </div>
                <h4 className="csm-card-title">Foto oficial otimizada (Padrão WhatsApp 1:1)</h4>
                <p className="csm-card-desc">
                  Foto oficial da loja centralizada em formato quadrado (1:1) com alta qualidade e fundo limpo. O produto fica 100% visível na conversa sem cortes e sem precisar abrir a foto.
                </p>
              </div>

              {/* Card 2: Sem Imagem */}
              <div
                className={`csm-card ${imageMode === 'none' ? 'csm-card-active' : ''} ${isRuleActive ? 'csm-card-disabled' : ''}`}
                onClick={() => !isRuleActive && setImageMode('none')}
                role="radio"
                aria-checked={imageMode === 'none'}
                tabIndex={isRuleActive ? -1 : 0}
              >
                <div className="csm-card-top">
                  <div className="csm-card-icon" aria-hidden="true">
                    <FileText size={18} />
                  </div>
                  <span className="csm-card-badge">Texto</span>
                </div>
                <h4 className="csm-card-title">Apenas texto (sem foto)</h4>
                <p className="csm-card-desc">
                  Publica apenas o texto com as informações da oferta e o link de afiliado, sem enviar anexo de imagem.
                </p>
              </div>
            </div>
          </section>

          {/* SEÇÃO 5: SELEÇÃO E CRIAÇÃO DE TEMPLATES POR CARDS */}
          <section className="csm-section">
            <div className="csm-section-head">
              <div>
                <span className="csm-section-label">Configuração 05</span>
                <h3 className="csm-section-title">Modelo de mensagem (Template)</h3>
                <p className="csm-section-desc">
                  Selecione um dos modelos prontos ou crie um modelo personalizado com variáveis e prévia em tempo real.
                </p>
              </div>
            </div>

            {/* Grid de Cards de Templates */}
            <div className="csm-cards-grid" role="radiogroup" aria-label="Modelos de mensagem">
              {Object.values(BUILTIN_TEMPLATES).map((tpl) => {
                const isSelected = selectedTemplateId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    role="radio"
                    tabIndex={isRuleActive ? -1 : 0}
                    aria-checked={isSelected}
                    className={`csm-card ${isSelected ? 'is-active' : ''} ${isRuleActive ? 'is-disabled' : ''}`}
                    onClick={() => handleSelectTemplateCard(tpl.id)}
                    onKeyDown={(e) => {
                      if ((e.key === ' ' || e.key === 'Enter') && !isRuleActive) handleSelectTemplateCard(tpl.id);
                    }}
                  >
                    <div className="csm-card-top">
                      <div className="csm-card-icon">
                        <FileText size={16} />
                      </div>
                      <span className="csm-card-badge">Pronto</span>
                    </div>
                    <h4 className="csm-card-title">{tpl.name}</h4>
                    <p className="csm-card-desc">{tpl.description}</p>
                  </div>
                );
              })}

              {/* Templates Personalizados Salvos */}
              {savedCustomTemplates.map((custom) => {
                const isSelected = selectedTemplateId === custom.id;
                return (
                  <div
                    key={custom.id}
                    role="radio"
                    tabIndex={isRuleActive ? -1 : 0}
                    aria-checked={isSelected}
                    className={`csm-card ${isSelected ? 'is-active' : ''} ${isRuleActive ? 'is-disabled' : ''}`}
                    onClick={() => handleSelectTemplateCard(custom.id)}
                    onKeyDown={(e) => {
                      if ((e.key === ' ' || e.key === 'Enter') && !isRuleActive) handleSelectTemplateCard(custom.id);
                    }}
                  >
                    <div className="csm-card-top">
                      <div className="csm-card-icon">
                        <Sparkles size={16} />
                      </div>
                      <button
                        type="button"
                        aria-label="Excluir template"
                        disabled={isRuleActive}
                        onClick={(e) => handleDeleteCustomTemplate(custom.id, e)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: 2,
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <h4 className="csm-card-title">{custom.name}</h4>
                    <p className="csm-card-desc">Template personalizado salvo por você.</p>
                  </div>
                );
              })}

              {/* Card Criar meu template */}
              <div
                role="radio"
                tabIndex={isRuleActive ? -1 : 0}
                aria-checked={selectedTemplateId === 'custom'}
                className={`csm-card ${selectedTemplateId === 'custom' ? 'is-active' : ''} ${isRuleActive ? 'is-disabled' : ''}`}
                onClick={() => {
                  if (!isRuleActive) {
                    setSelectedTemplateId('custom');
                  }
                }}
                onKeyDown={(e) => {
                  if ((e.key === ' ' || e.key === 'Enter') && !isRuleActive) setSelectedTemplateId('custom');
                }}
              >
                <div className="csm-card-top">
                  <div className="csm-card-icon">
                    <Plus size={18} />
                  </div>
                  <span className="csm-card-badge" style={{ color: '#39bee6' }}>Personalizado</span>
                </div>
                <h4 className="csm-card-title">Criar meu template</h4>
                <p className="csm-card-desc">
                  Escreva seu próprio formato, use chips de variáveis dinâmicas e veja a prévia na hora.
                </p>
              </div>
            </div>

            {/* Editor de Template (aberto para custom ou edição de qualquer modelo) */}
            <div className="csm-editor-panel">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label htmlFor="csm-tpl-name" style={{ fontSize: 12, color: '#9bb0be', fontWeight: 600 }}>
                    Nome do modelo:
                  </label>
                  <input
                    id="csm-tpl-name"
                    type="text"
                    disabled={isRuleActive}
                    value={customTemplateName}
                    onChange={(e) => setCustomTemplateName(e.target.value)}
                    style={{
                      background: '#1d252c',
                      border: '1px solid #374652',
                      color: '#edf2f5',
                      padding: '5px 10px',
                      borderRadius: 8,
                      fontSize: 13,
                      minWidth: 220,
                    }}
                  />
                </div>

                {!isRuleActive && (
                  <button
                    type="button"
                    className="rp-btn rp-quiet"
                    style={{ fontSize: 11, padding: '4px 10px', minHeight: 30 }}
                    onClick={handleSaveCustomTemplate}
                    title="Salvar este formato para reutilizar em outras regras"
                  >
                    <Save size={12} />
                    Salvar na minha biblioteca de templates
                  </button>
                )}
              </div>

              {/* Barra de Chips Clicáveis de Variáveis */}
              <div>
                <span style={{ fontSize: 11, color: '#8fa2b1', display: 'block', marginBottom: 6 }}>
                  Variáveis suportadas (clique no chip para inserir no texto):
                </span>
                <div className="csm-chips-bar">
                  {VARIABLE_CHIPS.map((chip) => (
                    <button
                      key={chip.tag}
                      type="button"
                      disabled={isRuleActive}
                      className="csm-chip"
                      onClick={() => handleInsertVariable(chip.tag)}
                      title={`Inserir ${chip.label}`}
                    >
                      {chip.tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea do Template */}
              <textarea
                ref={textareaRef}
                className="csm-textarea"
                disabled={isRuleActive}
                value={templateText}
                onChange={(e) => {
                  setTemplateText(e.target.value);
                  if (selectedTemplateId !== 'custom') {
                    setSelectedTemplateId('custom');
                  }
                }}
                rows={7}
                placeholder="Ex: {gancho}\n\n*{titulo}*\n{preco_de}\nPor {preco_por}\n\nCompre: {link}"
              />

              {/* Prévia ao Vivo do WhatsApp */}
              <div className="csm-preview-box">
                <div className="csm-preview-head">
                  <span>Prévia do WhatsApp em tempo real</span>
                  <span style={{ fontSize: 10, color: '#39bee6' }}>Exemplo real com dados modelo</span>
                </div>
                <div className="csm-preview-bubble">
                  {livePreview}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Rodapé com Ações */}
        <footer className="csm-footer">
          <div className="csm-footer-msg">
            {isRuleActive ? (
              <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lock size={14} /> Pause o copiador para habilitar o salvamento de alterações.
              </span>
            ) : (
              <span>Todas as alterações são mantidas em rascunho até você salvar.</span>
            )}
          </div>

          <div className="csm-footer-actions">
            <button
              type="button"
              className="csm-btn csm-btn-quiet"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="csm-btn csm-btn-primary"
              onClick={handleSave}
              disabled={isRuleActive || saving}
              title={isRuleActive ? 'Pause o copiador antes de salvar alterações' : 'Salvar configurações da regra'}
            >
              <Save size={16} />
              {saving ? 'Salvando...' : 'Salvar configurações'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

