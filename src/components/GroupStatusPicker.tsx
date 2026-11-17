'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, QrCode, RefreshCw, Unplug, Users } from 'lucide-react';
import { useWhatsAppWorkspace } from '@/components/WhatsAppWorkspaceProvider';

type GatewayState = { status: string; phone: string | null; lastError: string | null };

/**
 * Status nos grupos: mostra se o conector próprio está pareado, faz o pareamento por QR
 * (transmitido ao vivo pelo servidor) e deixa escolher os grupos que recebem o status.
 */
export function GroupStatusPicker({ selected, onChange, onReadyChange }: {
  selected: string[];
  onChange: (jids: string[]) => void;
  onReadyChange: (ready: boolean) => void;
}) {
  const { workspace, refreshGroups } = useWhatsAppWorkspace();
  const [gateway, setGateway] = useState<GatewayState | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<{ qr: string | null; message: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const groups = useMemo(() => (workspace?.groups || [])
    .filter(group => group.isAdmin || group.canPost !== false)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [workspace?.groups]);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status-grupo', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível consultar o conector.');
      setGateway({ status: data.status, phone: data.phone, lastError: data.lastError });
      setGatewayError(null);
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : 'Não foi possível consultar o conector.');
    }
  }, []);

  useEffect(() => { void loadStatus(); return () => abortRef.current?.abort(); }, [loadStatus]);

  const connected = gateway?.status === 'conectado';
  useEffect(() => { onReadyChange(connected && selected.length > 0); }, [connected, selected.length, onReadyChange]);

  // Primeira abertura: já sugere os grupos de destino do Copiador.
  const suggested = useRef(false);
  useEffect(() => {
    if (suggested.current || selected.length || !workspace?.destinations?.length) return;
    suggested.current = true;
    const known = new Set(groups.map(group => group.groupJid));
    onChange([...new Set(workspace.destinations.filter(d => d.isActive && known.has(d.groupJid)).map(d => d.groupJid))].slice(0, 10));
  }, [workspace?.destinations, groups, selected.length, onChange]);

  const startPairing = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPairing({ qr: null, message: 'Preparando o QR code…' });
    try {
      const res = await fetch('/api/whatsapp/status-grupo/parear', { method: 'POST', signal: controller.signal });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Não foi possível iniciar o pareamento.');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const raw of events) {
          const event = /^event: (.+)$/m.exec(raw)?.[1];
          const data = JSON.parse(/^data: (.+)$/m.exec(raw)?.[1] || '{}');
          if (event === 'qr') setPairing({ qr: data.image, message: 'Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho, e aponte para este código.' });
          if (event === 'ok') { setPairing(null); await loadStatus(); return; }
          if (event === 'erro') throw new Error(data.message);
        }
      }
      throw new Error('O pareamento terminou sem confirmação. Tente de novo.');
    } catch (error) {
      if (controller.signal.aborted) return;
      setPairing(null);
      setGatewayError(error instanceof Error ? error.message : 'Falha no pareamento.');
      await loadStatus();
    }
  };

  const disconnect = async () => {
    setGatewayError(null);
    await fetch('/api/whatsapp/status-grupo', { method: 'DELETE' }).catch(() => undefined);
    await loadStatus();
  };

  const toggle = (jid: string) => {
    if (selected.includes(jid)) onChange(selected.filter(item => item !== jid));
    else if (selected.length < 10) onChange([...selected, jid]);
  };

  if (pairing) {
    return (
      <div className="rgs-pair">
        {pairing.qr
          ? <img src={pairing.qr} alt="QR code para conectar o WhatsApp" width={240} height={240} />
          : <div className="rgs-qr-wait"><Loader2 className="w-6 h-6 animate-spin" /></div>}
        <p>{pairing.message}</p>
        <p className="rgs-small">O código muda sozinho a cada poucos segundos. Ele entra como mais um aparelho do seu número; a conexão que já envia as ofertas continua funcionando.</p>
        <button type="button" className="rp-btn" onClick={() => { abortRef.current?.abort(); setPairing(null); }}>Cancelar</button>
      </div>
    );
  }

  return (
    <div className="rgs">
      <div className="rgs-head">
        {connected
          ? <span className="rp-tag rp-good"><CheckCircle2 className="w-3.5 h-3.5" /> Conectado{gateway?.phone ? ` · +${gateway.phone}` : ''}</span>
          : <span className="rp-tag rp-warn">Status nos grupos ainda não conectado</span>}
        {connected && <button type="button" className="rgs-link" onClick={disconnect}><Unplug className="w-3.5 h-3.5" /> Desconectar</button>}
      </div>

      {gatewayError && <p className="rgs-error" role="alert">{gatewayError}</p>}

      {!connected ? (
        <div className="rgs-empty">
          <QrCode className="w-7 h-7" />
          <p>Para publicar o status dentro dos grupos, conecte seu WhatsApp uma vez pelo QR code. Todos os participantes veem, mesmo sem ter seu número salvo.</p>
          <button type="button" className="rp-btn rp-primary" onClick={startPairing}>Conectar com QR code</button>
        </div>
      ) : (
        <>
          <div className="rgs-list-head">
            <span><Users className="w-4 h-4" /> Grupos ({selected.length}/10)</span>
            <button type="button" className="rgs-link" onClick={() => void refreshGroups()}><RefreshCw className="w-3.5 h-3.5" /> Atualizar</button>
          </div>
          {groups.length === 0 && <p className="rgs-small">Nenhum grupo seu encontrado. Atualize a lista ou confira a conexão em Conexões.</p>}
          <ul className="rgs-list">
            {groups.map(group => (
              <li key={group.groupJid}>
                <label>
                  <input type="checkbox" checked={selected.includes(group.groupJid)} onChange={() => toggle(group.groupJid)}
                    disabled={!selected.includes(group.groupJid) && selected.length >= 10} />
                  <span><strong>{group.name}</strong><small>{group.participantCount.toLocaleString('pt-BR')} participantes{group.isAdmin ? ' · você é admin' : ''}</small></span>
                </label>
              </li>
            ))}
          </ul>
          <p className="rgs-small">Recurso não oficial do WhatsApp: pode parar de funcionar se o WhatsApp mudar. A primeira publicação em um grupo grande demora mais.</p>
        </>
      )}
    </div>
  );
}
