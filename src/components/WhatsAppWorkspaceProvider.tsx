'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { serialPoll } from '@/lib/client/serial-poll';
import type { PublicWhatsAppConnection, WhatsAppWorkspace } from '@/lib/whatsapp-workspace-types';

type CachedWorkspace = { workspace: WhatsAppWorkspace; receivedAt: number };
type WorkspaceContext = {
  workspace: WhatsAppWorkspace | null;
  loading: boolean;
  error: string | null;
  selectedId: string;
  select: (id: string) => void;
  reload: () => Promise<WhatsAppWorkspace | null>;
  refreshGroups: () => Promise<void>;
  observe: (connection: PublicWhatsAppConnection) => void;
  clear: () => void;
};
const Context = createContext<WorkspaceContext | null>(null);

export function WhatsAppWorkspaceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [records, setRecords] = useState<Record<string, CachedWorkspace>>({});
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useRef('');
  const cache = useRef<Record<string, CachedWorkspace>>({});
  const pending = useRef(new Map<string, Promise<WhatsAppWorkspace | null>>());
  const epoch = useRef(0);
  const user = useRef('');

  const clear = useCallback(() => {
    epoch.current++; user.current = ''; selected.current = ''; cache.current = {};
    pending.current.clear(); setRecords({}); setSelectedId(''); setError(null); setLoading(false);
  }, []);

  const store = useCallback((workspace: WhatsAppWorkspace, receivedAt: number) => {
    if (user.current && user.current !== workspace.userId) { cache.current = {}; epoch.current++; }
    user.current = workspace.userId;
    const key = workspace.connection?.id || '';
    const saved = { workspace, receivedAt };
    cache.current = { ...cache.current, [key]: saved };
    setRecords(cache.current);
  }, []);

  const load = useCallback((id: string): Promise<WhatsAppWorkspace | null> => {
    const active = pending.current.get(id);
    if (active) return active;
    const generation = epoch.current;
    setLoading(true); setError(null);
    let task!: Promise<WhatsAppWorkspace | null>;
    task = (async () => {
      try {
        const response = await fetch('/api/whatsapp/workspace' + (id ? '?connectionId=' + encodeURIComponent(id) : ''),
          { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        const payload = await response.json();
        if (generation !== epoch.current) return null;
        if (response.status === 401) { clear(); return null; }
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'Não foi possível atualizar suas conexões.');
        store(payload, Date.now());
        if (!selected.current && payload.connection) {
          selected.current = payload.connection.id; setSelectedId(payload.connection.id);
        }
        return payload as WhatsAppWorkspace;
      } catch (failure) {
        if (generation === epoch.current) setError(failure instanceof Error ? failure.message : 'Não foi possível atualizar suas conexões.');
        return null;
      } finally {
        if (pending.current.get(id) === task) pending.current.delete(id);
        if (generation === epoch.current) setLoading(false);
      }
    })();
    pending.current.set(id, task);
    return task;
  }, [clear, store]);

  const select = useCallback((id: string) => {
    selected.current = id; setSelectedId(id); setError(null);
    const saved = cache.current[id];
    if (!saved || Date.now() - saved.receivedAt > 30000) void load(id);
  }, [load]);

  const reload = useCallback(() => load(selected.current), [load]);

  const observe = useCallback((observation: PublicWhatsAppConnection) => {
    const connection: PublicWhatsAppConnection = { ...observation,
      state: observation.state || (observation.status === 'connected' ? 'connected_now' : 'disconnected'),
      statusLabel: observation.statusLabel || (observation.status === 'connected' ? 'Conectado' : 'Aguardando pareamento') };
    const saved = cache.current[connection.id]?.workspace;
    const sameOwner = saved?.connection?.ownerJid === connection.ownerJid;
    const connections = (saved?.connections || Object.values(cache.current)[0]?.workspace.connections || [])
      .filter(account => account.id !== connection.id).concat(connection);
    store({ ok: true, userId: user.current, connections, connection,
      groups: sameOwner ? saved?.groups || [] : [], sources: sameOwner ? saved?.sources || [] : [],
      destinations: sameOwner ? saved?.destinations || [] : [], syncedAt: sameOwner ? saved?.syncedAt || null : null },
      cache.current[connection.id]?.receivedAt || 0);
  }, [store]);

  const refreshGroups = useCallback(async () => {
    const id = selected.current;
    if (!id) return;
    try {
      const response = await fetch('/api/whatsapp/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: id }), signal: AbortSignal.timeout(20000) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Não foi possível sincronizar os grupos.');
      if (payload.warning) setError(payload.warning);
      await load(id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível sincronizar os grupos.'); }
  }, [load]);

  useEffect(() => {
    if (pathname === '/' || ['/login', '/cadastro', '/grupo', '/termos', '/privacidade', '/ajuda'].some(route => pathname?.startsWith(route))) { clear(); return; }
    const saved = cache.current[selected.current];
    if (!saved || Date.now() - saved.receivedAt > 30000) void load(selected.current);
  }, [pathname, load, clear]);

  useEffect(() => {
    if (!selectedId) return;
    return serialPoll(async signal => {
      if (document.visibilityState === 'hidden') return false;
      const current = cache.current[selectedId]?.workspace.connection;
      if (!current || (current.lastPingAt && Date.now() - Date.parse(current.lastPingAt) < 12000)) return false;
      try {
        const response = await fetch('/api/whatsapp/connections?verify=true&connectionId=' + encodeURIComponent(selectedId), { cache: 'no-store', signal });
        const payload = await response.json();
        if (!signal.aborted && response.ok && payload.ok) {
          const connection = payload.connections.find((account: PublicWhatsAppConnection) => account.id === selectedId);
          if (connection) observe(connection);
        }
      } catch { /* A verification failure preserves the saved account and its groups. */ }
      return false;
    }, 15000);
  }, [selectedId, observe]);

  useEffect(() => {
    if (!selectedId) return;
    if (pathname === '/' || ['/login', '/cadastro', '/grupo', '/termos', '/privacidade', '/ajuda'].some(route => pathname?.startsWith(route))) return;
    return serialPoll(async signal => {
      try {
        await fetch('/api/copier/watchdog', { cache: 'no-store', signal });
      } catch {
        // Ignora falha de rede transitória
      }
      return false;
    }, 90000);
  }, [selectedId, pathname]);

  const workspace = records[selectedId]?.workspace || (!selectedId ? records['']?.workspace : null) || null;
  return <Context.Provider value={{ workspace, loading, error, selectedId, select, reload, refreshGroups, observe, clear }}>{children}</Context.Provider>;
}

export function useWhatsAppWorkspace() {
  const workspace = useContext(Context);
  if (!workspace) throw new Error('A conexão compartilhada precisa do WhatsAppWorkspaceProvider.');
  return workspace;
}
