'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  CopySource,
  CopyDestination,
  IncomingMessage,
  PublicationJob,
  WhatsAppGroup,
} from '@/lib/types';
import { BrandLogo } from '@/components/BrandLogo';

interface CopierStatusData {
  connection: {
    state: 'connected_now' | 'last_known_connection' | 'unreachable' | 'disconnected';
    label: string;
    status: string;
    lastPingAt: string | null;
    instanceName?: string;
    phoneNumber?: string;
    profileName?: string;
  };
  receiving: {
    status: 'ativo' | 'aguardando' | 'inativo';
    lastMessageReceivedAt: string | null;
    todayCount: number;
    totalCount: number;
  };
  summary?: {
    hasRule: boolean;
    ruleId?: string;
    originJid?: string;
    originName: string;
    destinationNames: string[];
    destinationJids: string[];
    operationMode: 'revisao_manual' | 'automatico';
    state: 'ativo' | 'pausado' | 'aguardando_mensagens' | 'erro';
    stateLabel: string;
    isActive: boolean;
  };
}

export default function CopierPage() {
  const [sources, setSources] = useState<CopySource[]>([]);
  const [destinations, setDestinations] = useState<CopyDestination[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [messages, setMessages] = useState<IncomingMessage[]>([]);
  const [jobs, setJobs] = useState<PublicationJob[]>([]);
  const [copierStatus, setCopierStatus] = useState<CopierStatusData | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Estados principais
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);
  const [selectedOriginJid, setSelectedOriginJid] = useState('');
  const [selectedDestJids, setSelectedDestJids] = useState<string[]>([]);
  const [operationMode, setOperationMode] = useState<'revisao_manual' | 'automatico'>('revisao_manual');
  const [selectedTemplate, setSelectedTemplate] = useState('Oferta essencial');
  const [allowedStores, setAllowedStores] = useState<string[]>([
    'shopee',
    'mercadolivre',
    'netshoes',
    'amazon',
  ]);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('22:00');
  const [isActiveRule, setIsActiveRule] = useState(false);
  const [showMessages, setShowMessages] = useState(false);

  // Carregar dados reais
  const loadData = useCallback(async () => {
    try {
      const [resSrc, resMsg, resJobs, resGroups, resStatus] = await Promise.all([
        fetch('/api/copier/sources'),
        fetch('/api/copier/messages?realOnly=true'),
        fetch('/api/copier/jobs'),
        fetch('/api/whatsapp/groups'),
        fetch('/api/copier/status'),
      ]);

      const dataSrc = await resSrc.json().catch(() => ({}));
      const dataMsg = await resMsg.json().catch(() => ({}));
      const dataJobs = await resJobs.json().catch(() => ({}));
      const dataGroups = await resGroups.json().catch(() => ({}));
      const dataStatus = await resStatus.json().catch(() => ({}));

      if (dataSrc.ok) {
        setSources(dataSrc.sources || []);
        setDestinations(dataSrc.destinations || []);

        const primary = (dataSrc.sources || []).find((s: CopySource) => s.isActive) || dataSrc.sources?.[0];
        if (primary) {
          setActiveRuleId(primary.id);
          setSelectedOriginJid(primary.groupJid);
          const linkedDests = (dataSrc.destinations || [])
            .filter((d: CopyDestination) => d.sourceId === primary.id && d.isActive)
            .map((d: CopyDestination) => d.groupJid);
          setSelectedDestJids(linkedDests);
          setOperationMode(primary.operationMode || 'revisao_manual');
          if (Array.isArray(primary.allowedStores) && primary.allowedStores.length > 0) {
            setAllowedStores(primary.allowedStores);
          }
          setIsActiveRule(Boolean(primary.isActive));
        }
      }

      if (dataGroups.ok && Array.isArray(dataGroups.groups)) {
        setGroups(dataGroups.groups);
      }
      if (dataMsg.ok && Array.isArray(dataMsg.messages)) {
        setMessages(dataMsg.messages);
      }
      if (dataJobs.ok && Array.isArray(dataJobs.jobs)) {
        setJobs(dataJobs.jobs);
      }
      if (dataStatus.ok) {
        setCopierStatus(dataStatus);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do Copiador:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Mapa de grupos
  const groupsMap = useMemo(() => {
    const map = new Map<string, WhatsAppGroup>();
    groups.forEach((g) => map.set(g.groupJid, g));
    return map;
  }, [groups]);

  // Nome do grupo de origem
  const originGroupName = useMemo(() => {
    if (!selectedOriginJid) return 'Selecione uma origem';
    return groupsMap.get(selectedOriginJid)?.name || selectedOriginJid;
  }, [selectedOriginJid, groupsMap]);

  // Nome dos grupos de destino
  const destinationGroupName = useMemo(() => {
    if (selectedDestJids.length === 0) return 'Selecione um destino';
    return selectedDestJids
      .map((jid) => groupsMap.get(jid)?.name || jid)
      .join(', ');
  }, [selectedDestJids, groupsMap]);

  // Grupos disponíveis para destino (onde a conta tem permissão de postar e não é a origem)
  const availableDestGroups = useMemo(() => {
    return groups.filter((g) => g.groupJid !== selectedOriginJid);
  }, [groups, selectedOriginJid]);

  // Salvar / alternar estado do copiador
  const handleToggleCopier = async () => {
    if (!selectedOriginJid) {
      setFeedback({ type: 'warning', message: 'Selecione o grupo de origem antes de ativar.' });
      return;
    }
    if (selectedDestJids.length === 0) {
      setFeedback({ type: 'warning', message: 'Selecione pelo menos um grupo de destino.' });
      return;
    }

    const nextState = !isActiveRule;
    setSaving(true);
    setFeedback(null);

    try {
      const originGroup = groupsMap.get(selectedOriginJid);
      const computedName = originGroup ? `Cópia: ${originGroup.name}` : 'Regra Copiador';

      const res = await fetch('/api/copier/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeRuleId || undefined,
          groupJid: selectedOriginJid,
          name: computedName,
          operationMode,
          allowedStores,
          stripThirdPartyLinks: true,
          stripExternalTags: true,
          destinationJids: selectedDestJids,
          isActive: nextState,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setIsActiveRule(nextState);
        if (data.source?.id) setActiveRuleId(data.source.id);
        setFeedback({
          type: 'success',
          message: nextState
            ? 'Copiador ativado com sucesso! Monitorando novas ofertas em tempo real.'
            : 'Copiador pausado. Novas ofertas não serão processadas.',
        });
        await loadData();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Falha ao atualizar o copiador.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro de rede ao salvar a configuração.' });
    } finally {
      setSaving(false);
    }
  };

  const isConnected = copierStatus?.connection?.state === 'connected_now';
  const instanceProfile = copierStatus?.connection?.profileName || 'Radar de Ofertas';

  return (
    <section className="rp-page" aria-label="Copiador">
      {/* Cabeçalho da página */}
      <div className="rp-head">
        <div>
          <span className="rp-step">Operação</span>
          <h1>Copiador de grupos</h1>
          <p>Escolha a origem, os destinos e como suas ofertas serão publicadas.</p>
        </div>
        <button
          className="rp-btn"
          type="button"
          onClick={() => setShowMessages(!showMessages)}
        >
          {showMessages ? 'Ocultar mensagens' : 'Últimas mensagens'}
          {messages.length > 0 && ` · ${messages.length}`}
        </button>
      </div>

      {/* Banner de status unificado do WhatsApp */}
      <div className="rp-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Suporte oficial de 48px com imagem autêntica de 32px */}
          <BrandLogo brand="whatsapp" variant="whatsapp-destaque" size={32} containerSize={48} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong>WhatsApp {isConnected ? 'Conectado' : 'Desconectado'}</strong>
              <span className={`rp-tag ${isConnected ? 'rp-good' : 'rp-warn'}`} style={{ fontSize: 10, padding: '2px 7px' }}>
                {isConnected ? 'Sessão Ativa' : 'Sem Conexão'}
              </span>
              <span className={`rp-tag ${isActiveRule ? 'rp-good' : 'rp-warn'}`} style={{ fontSize: 10, padding: '2px 7px' }}>
                {isActiveRule ? 'Regra Ativa' : 'Regra Pausada'}
              </span>
            </div>
            <p className="rp-sub" style={{ margin: 0, marginTop: 2, fontSize: 11 }}>
              Instância: <strong>{instanceProfile}</strong> ·{' '}
              {copierStatus?.receiving?.todayCount !== undefined
                ? `${copierStatus.receiving.todayCount} ofertas recebidas hoje`
                : 'Aguardando novas ofertas do webhook'}
            </p>
          </div>
        </div>
        <Link href="/conexoes?aba=whatsapp" className="rp-btn rp-quiet">
          Gerenciar conexão ↗
        </Link>
      </div>

      {feedback && (
        <div
          className={`rp-panel rp-section ${
            feedback.type === 'error'
              ? 'rp-warn'
              : feedback.type === 'warning'
              ? 'rp-warn'
              : ''
          }`}
          style={{
            borderColor:
              feedback.type === 'error'
                ? '#e05353'
                : feedback.type === 'warning'
                ? '#d97736'
                : '#56c288',
          }}
        >
          <p>{feedback.message}</p>
        </div>
      )}

      {/* Fluxo: De onde vem e para onde vai */}
      <div className="rp-flow">
        <div className="rp-flow-part">
          <small>Copiar de</small>
          <strong>{originGroupName}</strong>
        </div>
        <span className="rp-flow-arrow">→</span>
        <div className="rp-flow-part">
          <small>Publicar em</small>
          <strong>{destinationGroupName}</strong>
        </div>
      </div>

      {/* Grade principal dividida */}
      <div className="rp-split">
        {/* Coluna da esquerda: Bloco 01 e Bloco 02 */}
        <div className="rp-stack">
          {/* Bloco 01: Grupos */}
          <div className="rp-panel">
            <span className="rp-step">01 · Grupos</span>
            <h2>De onde vem e para onde vai</h2>

            <label className="rp-field">
              Grupo de origem
              <select
                id="rp-source"
                value={selectedOriginJid}
                onChange={(e) => setSelectedOriginJid(e.target.value)}
              >
                <option value="">Selecione o grupo para monitorar...</option>
                {groups.map((g) => (
                  <option key={g.groupJid} value={g.groupJid}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="rp-field">
              Grupo de destino
              <select
                id="rp-destination"
                value={selectedDestJids[0] || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedDestJids(val ? [val] : []);
                }}
              >
                <option value="">Selecione o grupo para publicar...</option>
                {availableDestGroups.map((g) => (
                  <option key={g.groupJid} value={g.groupJid}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>

            <p className="rp-sub">A conta conectada pode publicar neste destino.</p>
          </div>

          {/* Bloco 02: Publicação */}
          <div className="rp-panel">
            <span className="rp-step">02 · Publicação</span>
            <h2>Como tratar as ofertas</h2>

            <label className="rp-check">
              <input
                type="radio"
                name="rp-mode"
                checked={operationMode === 'revisao_manual'}
                onChange={() => setOperationMode('revisao_manual')}
              />
              Revisar antes de enviar
            </label>

            <label className="rp-check">
              <input
                type="radio"
                name="rp-mode"
                checked={operationMode === 'automatico'}
                onChange={() => setOperationMode('automatico')}
              />
              Enviar automaticamente após validar
            </label>

            <label className="rp-field">
              Template
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
              >
                <option value="Oferta essencial">Oferta essencial</option>
                <option value="Oferta com cupom">Oferta com cupom</option>
                <option value="Texto curto">Texto curto</option>
              </select>
            </label>

            <div className="rp-actions rp-section">
              <Link href="/criar-conteudo?aba=templates" className="rp-btn rp-quiet">
                Editar templates ↗
              </Link>
              <Link href="/ofertas?aba=curadoria" className="rp-btn rp-quiet">
                Ajustar filtros ↗
              </Link>
            </div>

            <details className="rp-details">
              <summary>Lojas e horários</summary>
              <label className="rp-check">
                <input
                  type="checkbox"
                  checked={allowedStores.includes('shopee')}
                  onChange={(e) => {
                    setAllowedStores((prev) =>
                      e.target.checked
                        ? [...prev, 'shopee']
                        : prev.filter((s) => s !== 'shopee')
                    );
                  }}
                />
                Shopee
              </label>
              <label className="rp-check">
                <input
                  type="checkbox"
                  checked={allowedStores.includes('mercadolivre')}
                  onChange={(e) => {
                    setAllowedStores((prev) =>
                      e.target.checked
                        ? [...prev, 'mercadolivre']
                        : prev.filter((s) => s !== 'mercadolivre')
                    );
                  }}
                />
                Mercado Livre
              </label>
              <label className="rp-check">
                <input
                  type="checkbox"
                  checked={allowedStores.includes('amazon')}
                  onChange={(e) => {
                    setAllowedStores((prev) =>
                      e.target.checked
                        ? [...prev, 'amazon']
                        : prev.filter((s) => s !== 'amazon')
                    );
                  }}
                />
                Amazon
              </label>
              <label className="rp-check">
                <input
                  type="checkbox"
                  checked={allowedStores.includes('netshoes')}
                  onChange={(e) => {
                    setAllowedStores((prev) =>
                      e.target.checked
                        ? [...prev, 'netshoes']
                        : prev.filter((s) => s !== 'netshoes')
                    );
                  }}
                />
                Netshoes
              </label>
              <div className="rp-grid">
                <label className="rp-field">
                  Início
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </label>
                <label className="rp-field">
                  Fim
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </label>
              </div>
            </details>
          </div>
        </div>

        {/* Coluna da direita: Prévia e Estado */}
        <div className="rp-stack">
          {/* Prévia da mensagem */}
          <div className="rp-panel">
            <div className="rp-row">
              <h2>Prévia da mensagem</h2>
              <span className="rp-tag">Exemplo</span>
            </div>

            <div className="rp-message rp-section">
              <div
                className="rp-product-photo rp-p1"
                role="img"
                aria-label="Fone bege de exemplo"
              />
              <p>
                Um achado para o seu dia ✨<br />
                <strong>Fone sem fio · modelo exemplo</strong>
                <br />
                Por <strong>R$ 149,90</strong>
                <br />
                {selectedTemplate === 'Oferta com cupom' && (
                  <>
                    Cupom: RADAR10<br />
                  </>
                )}
                <span className="rp-link">Seu link de afiliado aparecerá aqui</span>
              </p>
            </div>

            <p className="rp-sub">
              A imagem, o preço e o link são conferidos antes da publicação.
            </p>
          </div>

          {/* Estado do copiador */}
          <div className="rp-panel">
            <div className="rp-row">
              <h2>Estado do copiador</h2>
              <span
                className={`rp-tag ${isActiveRule ? 'rp-good' : 'rp-warn'}`}
                id="rp-copier-status"
              >
                {isActiveRule ? 'Ativo' : 'Pausado'}
              </span>
            </div>

            <p className="rp-sub" id="rp-copier-description">
              {isActiveRule
                ? 'O Copiador está ativo e monitorando a origem escolhida em tempo real.'
                : 'Ative para acompanhar novas ofertas da origem escolhida.'}
            </p>

            <div className="rp-actions rp-section">
              <button
                className={`rp-btn ${isActiveRule ? '' : 'rp-primary'}`}
                id="rp-toggle-copier"
                type="button"
                onClick={handleToggleCopier}
                disabled={saving}
              >
                {saving
                  ? 'Salvando...'
                  : isActiveRule
                  ? 'Pausar Copiador'
                  : 'Ativar Copiador'}
              </button>
              <Link href="/envios?aba=revisao" className="rp-btn">
                Ver revisão
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Seção inferior retrátil: Últimas mensagens recebidas */}
      {showMessages && (
        <div className="rp-panel rp-section" id="rp-messages">
          <div className="rp-row">
            <h2>Últimas mensagens recebidas</h2>
            <span className="rp-tag">
              {messages.length} {messages.length === 1 ? 'mensagem' : 'mensagens'}
            </span>
          </div>

          {messages.length === 0 ? (
            <p className="rp-sub">Nenhuma mensagem recente capturada ainda.</p>
          ) : (
            <div className="rp-list">
              {messages.slice(0, 10).map((msg) => (
                <div key={msg.id} className="rp-list-item">
                  <div className="rp-list-copy">
                    <strong>
                      {msg.cleanText || msg.rawText.slice(0, 60) || 'Mensagem recebida'}
                    </strong>
                    <p>
                      {msg.originGroupName || 'Grupo'} ·{' '}
                      {new Date(msg.receivedAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span
                    className={`rp-tag ${
                      msg.status === 'recebida'
                        ? ''
                        : msg.status === 'descartada'
                        ? 'rp-warn'
                        : msg.status === 'erro'
                        ? 'rp-warn'
                        : 'rp-good'
                    }`}
                  >
                    {msg.status === 'recebida'
                      ? 'Em revisão'
                      : msg.status === 'descartada'
                      ? msg.discardReason || 'Descartada'
                      : msg.status === 'erro'
                      ? 'Erro'
                      : 'Processada'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
