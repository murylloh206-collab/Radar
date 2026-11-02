'use client';
import { useEffect, useState } from 'react';
import { serialPoll } from '@/lib/client/serial-poll';

type Health = { ok: boolean; workerActive?: boolean; error?: string;
  webhook?: { runtime_webhook_version: number; runtime_webhook_error?: string };
  inbox?: { id: string; status: string; receivedAt: string; reason?: string }[];
  jobs?: { id: string; status: string; error_details?: string; target_name?: string; runtime_delivery?: string }[] };
export default function CopierRuntimeStatus({ connectionId, workerActive }: { connectionId: string; workerActive?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    setHealth(null);
    if (!connectionId || !expanded) return;
    return serialPoll(async signal => {
      try {
        const response = await fetch('/api/copier/runtime?connectionId=' + encodeURIComponent(connectionId), { signal, cache: 'no-store' });
        const next = await response.json();
        if (!signal.aborted) setHealth(next);
      } catch { if (!signal.aborted) setHealth({ ok: false, error: 'Não foi possível consultar o processamento.' }); }
      return false;
    }, 15000);
  }, [connectionId, expanded]);
  return <details onToggle={event => setExpanded(event.currentTarget.open)} className="rp-panel" style={{ marginBottom: 18 }}>
    <summary style={{ cursor: 'pointer', padding: 8 }}>Processamento real · {!health ? workerActive === undefined ? 'Ver diagnóstico' : workerActive ? 'Worker em execução' : 'Worker sem sinal recente' : !health.ok ? 'Verificação indisponível' : health.workerActive ? 'Worker em execução' : 'Worker sem sinal recente'}</summary>
    {!health?.ok ? <p role="status">{health?.error || 'Consultando a fila persistida…'}</p> : <>
      {!health.workerActive && <p role="status">O processador está parado. As mensagens recebidas estão salvas. Inicie o serviço do Copiador para retomar os envios.</p>}
      {(health.webhook?.runtime_webhook_version ?? 0) < 1 && <p role="status">{health.webhook?.runtime_webhook_error || 'Aguardando configuração do recebimento pelo worker.'}</p>}
      <p>Último evento: {health.inbox?.[0] ? new Date(health.inbox[0].receivedAt).toLocaleString('pt-BR') : 'Nenhum evento recebido nesta conexão.'}</p>
      {health.inbox?.slice(0, 3).map(entry => <p key={entry.id}>{entry.status} · {entry.reason || 'Aguardando processamento.'}</p>)}
      {health.jobs?.slice(0, 3).map(job => <p key={job.id}>{job.target_name} · {job.status}{job.error_details ? ' · ' + job.error_details : ''}</p>)}
    </>}
  </details>;
}
