'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, QrCode, Unplug, Users } from 'lucide-react';

type StatusGroup = { jid: string; name: string; participantCount: number | null };
type GatewayState = { status: string; phone: string | null; lastError: string | null; groups: StatusGroup[] | null };

/**
 * Status nos grupos: mostra se o conector está pareado, faz o pareamento por QR (transmitido ao vivo)
 * e lista os grupos que vão receber o status — os mesmos grupos de destino ativos do Copiador.
 */
export function GroupStatusPicker({ onReadyChange }: { onReadyChange: (ready: boolean, groupCount: number) => void }) {
  const [gateway, setGateway] = useState<GatewayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<{ qr: string | null; message: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status-grupo', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível consultar o conector.');
      setGateway({ status: data.status, phone: data.phone, lastError: data.lastError, groups: data.groups ?? null });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível consultar o conector.');
    }
  }, []);

  useEffect(() => { void loadStatus(); return () => abortRef.current?.abort(); }, [loadStatus]);

  const connected = gateway?.status === 'conectado';
  const groups = gateway?.groups || [];
  useEffect(() => { onReadyChange(connected && groups.length > 0, groups.length); }, [connected, groups.length, onReadyChange]);

  const startPairing = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
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
          if (event === 'qr') setPairing({ qr: data.image, message: 'No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho, e aponte para este código.' });
          if (event === 'ok') { setPairing(null); await loadStatus(); return; }
          if (event === 'erro') throw new Error(data.message);
        }
      }
      throw new Error('O pareamento terminou sem confirmação. Tente de novo.');
    } catch (e) {
      if (controller.signal.aborted) return;
      setPairing(null);
      setError(e instanceof Error ? e.message : 'Falha no pareamento.');
      await loadStatus();
    }
  };

  const disconnect = async () => {
    setError(null);
    await fetch('/api/whatsapp/status-grupo', { method: 'DELETE' }).catch(() => undefined);
    await loadStatus();
  };

  if (pairing) {
    return (
      <div className="rgs-pair">
        {pairing.qr
          ? <img src={pairing.qr} alt="QR code para conectar o WhatsApp" width={220} height={220} />
          : <div className="rgs-qr-wait"><Loader2 className="w-6 h-6 animate-spin" /></div>}
        <p>{pairing.message}</p>
        <p className="rgs-small">O código muda sozinho a cada poucos segundos. Entra como mais um aparelho do seu número; a conexão que já envia as ofertas continua funcionando.</p>
        <button type="button" className="rp-btn" onClick={() => { abortRef.current?.abort(); setPairing(null); }}>Cancelar</button>
      </div>
    );
  }

  if (!gateway && !error) {
    return <div className="rgs"><p className="rgs-small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Loader2 className="w-4 h-4 animate-spin" /> Conferindo a conexão…</p></div>;
  }

  return (
    <div className="rgs">
      <div className="rgs-head">
        {connected
          ? <span className="rp-tag rp-good"><CheckCircle2 className="w-3.5 h-3.5" /> WhatsApp conectado{gateway?.phone ? ` · +${gateway.phone}` : ''}</span>
          : <span className="rp-tag rp-warn">Status nos grupos não conectado</span>}
        {connected && <button type="button" className="rgs-link" onClick={disconnect}><Unplug className="w-3.5 h-3.5" /> Desconectar</button>}
      </div>

      {error && <p className="rgs-error" role="alert">{error}</p>}

      {!connected ? (
        <div className="rgs-empty">
          <QrCode className="w-7 h-7" />
          <p>Conecte seu WhatsApp uma vez pelo QR code. O status aparece dentro dos grupos para todos os participantes, mesmo sem ter seu número salvo.</p>
          <button type="button" className="rp-btn rp-primary" onClick={startPairing}>Conectar com QR code</button>
        </div>
      ) : (
        <>
          <div className="rgs-list-head">
            <span><Users className="w-4 h-4" /> Vai para os grupos do Copiador ({groups.length})</span>
            <Link href="/copiador" className="rgs-link">Alterar no Copiador</Link>
          </div>
          {groups.length === 0
            ? <p className="rgs-small">Nenhum grupo de destino ativo no Copiador. Ative pelo menos um grupo de destino lá para publicar o status.</p>
            : (
              <ul className="rgs-chips">
                {groups.map(group => (
                  <li key={group.jid} title={group.participantCount ? `${group.participantCount.toLocaleString('pt-BR')} participantes` : undefined}>{group.name}</li>
                ))}
              </ul>
            )}
          <p className="rgs-small">Recurso não oficial do WhatsApp: pode parar de funcionar se o WhatsApp mudar. A primeira publicação em grupos grandes demora um pouco mais.</p>
        </>
      )}
    </div>
  );
}
