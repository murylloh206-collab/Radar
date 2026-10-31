'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, ChevronDown, CircleAlert, RefreshCw, Search, ShieldCheck, UserRound, Users } from 'lucide-react';
import type { WhatsAppGroup } from '@/lib/types';
import './whatsapp-groups.css';

interface Account {
  status: 'connected' | 'connecting' | 'disconnected' | 'qrcode';
  ownerJid?: string;
  profileName?: string;
  phoneNumber?: string;
  instanceName?: string;
  lastPingAt?: string;
  verificationStatus?: string;
  verificationMessage?: string;
}

function dateLabel(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Ainda não verificado';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function phoneLabel(value?: string) {
  if (!value) return 'Número não informado';
  const digits = value.replace(/\D/g, '');
  if (!digits) return 'Número não informado';
  if (digits.startsWith('55') && digits.length === 13) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return `+${digits}`;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function WhatsAppAvatar({ resource, ownerJid, accountKey, name, personal = false }: {
  resource: string; ownerJid: string; accountKey: string; name: string; personal?: boolean;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | undefined>();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let started = false;
    setPicture(null);
    setPhotoError(undefined);
    async function load() {
      if (started) return;
      started = true;
      try {
        const response = await fetch(`${resource}&ownerJid=${encodeURIComponent(ownerJid)}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) {
          if (active) setPhotoError(typeof data.error === 'string' ? data.error : 'Não foi possível consultar a foto.');
          return;
        }
        if (active && data.ok && typeof data.pictureUrl === 'string') setPicture(data.pictureUrl);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        // Photo failures are local: the group name and actions remain available.
      }
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { void load(); observer?.disconnect(); }
    }, { rootMargin: '120px' });
    if (observer && element.current) observer.observe(element.current);
    else void load();
    return () => { active = false; controller.abort(); observer?.disconnect(); };
  }, [resource, ownerJid, accountKey]);

  return <span ref={element} title={photoError} className={`wa-avatar ${personal ? 'wa-avatar--account' : ''}`}>
    {picture ? <img src={picture} alt={`Foto de ${name}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setPicture(null)} /> :
      personal ? <UserRound size={24} aria-hidden="true" /> : <Users size={21} aria-hidden="true" />}
  </span>;
}

export default function WhatsAppGroupsPanel() {
  const [account, setAccount] = useState<Account | null>(null);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(20);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const confirmedOwner = useRef<string | undefined>(undefined);

  const synchronize = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    setAccountError(null);
    setGroupsError(null);
    let nextGroups: WhatsAppGroup[] | null = null;
    let nextGroupsOwner: string | undefined;
    let nextSync: string | null = null;
    try {
      // A live response is required; seeded/cached examples never become group rows.
      const response = await fetch('/api/whatsapp/groups?refresh=true', { cache: 'no-store' });
      const data = await response.json();
      if (!mounted.current) return;
      if (response.ok && data.ok && data.isLive === true && Array.isArray(data.groups)) {
        nextGroups = data.groups;
        nextGroupsOwner = data.accountJid;
        nextSync = data.cachedAt || new Date().toISOString();
      } else {
        setGroupsError('Não foi possível consultar seus grupos no WhatsApp agora. Tente atualizar novamente.');
      }
    } catch {
      if (mounted.current) setGroupsError('Não foi possível carregar os grupos. Verifique a conexão e tente novamente.');
    }
    try {
      const response = await fetch('/api/whatsapp/connect?check=true', { cache: 'no-store' });
      const data = await response.json();
      if (!mounted.current) return;
      if (data.whatsapp) {
        setAccount(data.whatsapp);
        const owner = data.whatsapp.ownerJid;
        if (data.whatsapp.status !== 'connected' || !owner || owner !== confirmedOwner.current) {
          setGroups([]); setSyncedAt(null);
        }
        if (nextGroups && owner && data.whatsapp.status === 'connected') {
          if (nextGroupsOwner === owner) { setGroups(nextGroups); setSyncedAt(nextSync); }
          else setGroupsError('A lista não pôde ser vinculada à conta atual. Atualize novamente.');
        }
        confirmedOwner.current = owner;
      }
      if (!response.ok || !data.ok) setAccountError(data.error || 'Não foi possível verificar a conta agora.');
    } catch {
      if (mounted.current) setAccountError('Não foi possível verificar a conta agora.');
    } finally {
      busy.current = false;
      if (mounted.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void synchronize();
    return () => { mounted.current = false; };
  }, [synchronize]);

  const filtered = useMemo(() => groups.filter(group => normalize(group.name).includes(normalize(search))), [groups, search]);
  const connected = account?.status === 'connected';
  const confirmed = connected && !accountError && account?.verificationStatus === 'verified';
  const accountKey = `${account?.ownerJid || ''}:${syncedAt || ''}:${account?.lastPingAt || ''}`;
  const accountName = account?.profileName?.trim() || 'Sua conta WhatsApp';
  const stateLabel = loading ? 'Verificando' : confirmed ? 'Conectado' : connected ? 'Último estado conhecido' :
    account?.status === 'connecting' || account?.status === 'qrcode' ? 'Aguardando conexão' : account ? 'Desconectado' : 'Não verificado';

  return <div className="wa-connections">
    <section className="wa-account" aria-label="Conta WhatsApp">
      <div className="wa-account-top">
        <div className="wa-account-identity">
          {account?.ownerJid && connected ? <WhatsAppAvatar resource="/api/whatsapp/groups/photo?account=1" ownerJid={account.ownerJid} accountKey={accountKey} name={accountName} personal /> :
            <span className="wa-avatar wa-avatar--account"><UserRound size={24} aria-hidden="true" /></span>}
          <div className="wa-account-copy"><span className="wa-eyebrow"><img src="/brands/whatsapp-original.png" alt="" width={14} height={14} />WHATSAPP</span><h2>{loading ? 'Consultando sua conta…' : accountName}</h2><p>{loading ? 'Buscando a identificação real da conta.' : phoneLabel(account?.phoneNumber)}</p></div>
        </div>
        <span className={`wa-status ${confirmed ? 'wa-status--connected' : ''}`}><span aria-hidden="true" />{stateLabel}</span>
      </div>
      <div className="wa-account-bottom"><span className="wa-updated"><ShieldCheck size={15} aria-hidden="true" />Última verificação: {dateLabel(account?.lastPingAt)}</span>
        <button type="button" className="wa-button" onClick={() => void synchronize()} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'wa-spin' : ''} aria-hidden="true" />{refreshing ? 'Atualizando…' : 'Atualizar conexão e grupos'}</button>
      </div>
      {accountError && <p className="wa-warning" role="status"><CircleAlert size={15} aria-hidden="true" />{accountError}</p>}
    </section>

    <section className="wa-groups" aria-labelledby="wa-groups-heading">
      <header className="wa-groups-header"><div><div className="wa-heading-row"><h2 id="wa-groups-heading">Seus grupos</h2>{syncedAt && <span className="wa-count">{groups.length}</span>}</div><p>Encontre o grupo certo pela foto e pelo nome.</p></div>
        <label className="wa-search"><Search size={17} aria-hidden="true" /><span className="wa-sr-only">Buscar grupo pelo nome</span><input type="search" placeholder="Buscar grupo" value={search} onChange={event => { setSearch(event.target.value); setLimit(20); }} /></label>
      </header>
      {groupsError && <p className="wa-warning" role="status"><CircleAlert size={15} aria-hidden="true" />{syncedAt ? 'A atualização falhou. A lista abaixo é da última consulta confirmada nesta tela.' : groupsError}</p>}
      {loading ? <div className="wa-empty" role="status"><RefreshCw size={22} className="wa-spin" aria-hidden="true" /><h3>Buscando seus grupos</h3><p>A lista será preenchida com os dados da conta conectada.</p></div> :
        filtered.length === 0 ? <div className="wa-empty"><Users size={25} aria-hidden="true" /><h3>{search ? 'Nenhum grupo com esse nome' : groupsError ? 'Seus grupos ainda não foram carregados' : 'Nenhum grupo disponível'}</h3><p>{search ? 'Tente outro termo para encontrar o grupo.' : 'Atualize a conexão para consultar os grupos reais do WhatsApp.'}</p></div> :
        <ul className="wa-group-list">{filtered.slice(0, limit).map(group => <li key={group.groupJid} className="wa-group-row">
          <div className="wa-group-identity"><WhatsAppAvatar resource={`/api/whatsapp/groups/photo?groupJid=${encodeURIComponent(group.groupJid)}`} ownerJid={account?.ownerJid || ''} accountKey={accountKey} name={group.name} />
            <div className="wa-group-copy"><h3>{group.name}</h3><div className="wa-group-meta">{group.participantCount > 0 && <span>{group.participantCount} participantes</span>}
              <span>{group.permissionStatus === 'verified_admin' ? 'Você administra' : group.permissionStatus === 'restricted_readonly' ? 'Somente leitura' : group.permissionStatus === 'verified_member' ? 'Membro' : 'Permissão não verificada'}</span>
              {group.isOrigin && <span className="wa-role">Origem</span>}{group.isDestination && <span className="wa-role">Destino</span>}</div>
              <details className="wa-group-details"><summary>Detalhes do grupo</summary><code>{group.groupJid}</code></details>
            </div></div>
          <Link className="wa-group-link" href="/copiador">Usar no Copiador<ArrowUpRight size={14} aria-hidden="true" /></Link>
        </li>)}</ul>}
      {filtered.length > limit && <div className="wa-more"><button type="button" className="wa-button" onClick={() => setLimit(value => value + 20)}>Mostrar mais grupos<ChevronDown size={14} aria-hidden="true" /></button></div>}
      {syncedAt && <footer className="wa-list-footer"><Check size={13} aria-hidden="true" />Última sincronização confirmada: {dateLabel(syncedAt)}</footer>}
    </section>
    <details className="wa-diagnostics"><summary>Diagnóstico avançado</summary><dl><dt>Instância</dt><dd>{account?.instanceName || 'Não informada'}</dd><dt>Verificação</dt><dd>{dateLabel(account?.lastPingAt)}</dd></dl></details>
  </div>;
}
