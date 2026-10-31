'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, RefreshCw, Search, Users, X } from 'lucide-react';
import type { WhatsAppGroup } from '@/lib/types';
import WhatsAppAvatar from '@/components/WhatsAppAvatar';
import './copier-group-picker.css';

export function CopierGroupPhoto({
  group,
  connectionId,
  ownerJid,
}: {
  group: WhatsAppGroup;
  connectionId: string;
  ownerJid?: string;
}) {
  return (
    <WhatsAppAvatar
      connectionId={connectionId}
      ownerJid={ownerJid}
      groupJid={group.groupJid}
      name={group.name}
      initialUrl={group.pictureUrl}
      className="cgp-avatar"
      size={22}
    />
  );
}

export default function CopierGroupPicker({
  mode,
  groups,
  selected,
  excludedJid,
  connectionId,
  ownerJid,
  accountLabel,
  loading,
  error,
  onRefresh,
  onClose,
  onConfirm,
}: {
  mode: 'origin' | 'destinations';
  groups: WhatsAppGroup[];
  selected: string[];
  excludedJid?: string;
  connectionId: string;
  ownerJid?: string;
  accountLabel: string;
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  onClose: () => void;
  onConfirm: (selection: string[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(20);
  const [draft, setDraft] = useState(() => [...selected]);
  const origin = mode === 'origin';

  const filtered = useMemo(() => {
    const normalize = (text: string) =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR');
    return groups.filter((group) => normalize(group.name).includes(normalize(search)));
  }, [groups, search]);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus();
    };
  }, []);

  const allowed = (group: WhatsAppGroup) =>
    origin || (group.groupJid !== excludedJid && group.canPost !== false);

  const validDraft = draft.filter((jid) =>
    groups.some((group) => group.groupJid === jid && allowed(group))
  );

  return createPortal(
    <dialog
      ref={dialog}
      className="cgp-dialog"
      aria-labelledby="cgp-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="cgp-surface">
        <header className="cgp-header">
          <div>
            <span className="cgp-eyebrow">
              {origin ? 'ORIGEM DAS OFERTAS' : 'DESTINOS DAS OFERTAS'}
            </span>
            <h2 id="cgp-title">{origin ? 'De qual grupo copiar?' : 'Para quais grupos enviar?'}</h2>
            <p>
              {accountLabel} · {groups.length} grupos
            </p>
          </div>
          <button
            className="cgp-icon"
            type="button"
            onClick={onClose}
            aria-label="Fechar seleção"
          >
            <X size={21} />
          </button>
        </header>

        <div className="cgp-toolbar">
          <label className="cgp-search">
            <Search size={18} />
            <input
              autoFocus
              type="search"
              aria-label="Buscar grupo"
              placeholder="Buscar pelo nome do grupo"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLimit(20);
              }}
            />
          </label>
          <button
            type="button"
            className="cgp-icon"
            disabled={loading}
            onClick={onRefresh}
            aria-label="Atualizar grupos"
          >
            <RefreshCw size={18} className={loading ? 'cgp-spin' : ''} />
          </button>
        </div>

        {error && (
          <p className="cgp-notice" role="status">
            {error}
          </p>
        )}

        <div className="cgp-scroll" aria-busy={loading}>
          {loading && groups.length === 0 ? (
            <p className="cgp-empty" role="status">
              Consultando os grupos deste WhatsApp…
            </p>
          ) : filtered.length === 0 ? (
            <div className="cgp-empty">
              <Users size={30} />
              <p>
                {groups.length
                  ? 'Nenhum grupo com esse nome.'
                  : 'Nenhum grupo disponível nesta conexão.'}
              </p>
              <button
                type="button"
                className="cgp-button"
                onClick={onRefresh}
                disabled={loading}
              >
                Buscar grupos no WhatsApp
              </button>
            </div>
          ) : (
            <div className="cgp-grid">
              {filtered.slice(0, limit).map((group) => {
                const disabled = !allowed(group);
                const checked = draft.includes(group.groupJid);
                return (
                  <label
                    key={`${connectionId}:${group.groupJid}`}
                    className={`cgp-option ${checked ? 'is-selected' : ''} ${
                      disabled ? 'is-disabled' : ''
                    }`}
                  >
                    <input
                      type={origin ? 'radio' : 'checkbox'}
                      name="cgp-selection"
                      disabled={disabled}
                      checked={checked}
                      onChange={() =>
                        setDraft((previous) =>
                          origin
                            ? [group.groupJid]
                            : checked
                            ? previous.filter((jid) => jid !== group.groupJid)
                            : [...previous, group.groupJid]
                        )
                      }
                    />
                    <CopierGroupPhoto
                      group={group}
                      connectionId={connectionId}
                      ownerJid={ownerJid}
                    />
                    <span className="cgp-option-copy">
                      <strong>{group.name}</strong>
                      <small>
                        {group.groupJid === excludedJid
                          ? 'Já escolhido como origem'
                          : group.canPost === false
                          ? 'Somente leitura'
                          : group.isAdmin
                          ? 'Você é administrador'
                          : group.canPost === true
                          ? 'Envio permitido'
                          : 'Permissão a confirmar ao salvar'}
                      </small>
                      {group.participantCount > 0 && (
                        <small>{group.participantCount} participantes</small>
                      )}
                    </span>
                    <span className="cgp-check" aria-hidden="true">
                      {checked && <Check size={15} />}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {filtered.length > limit && (
            <button
              type="button"
              className="cgp-more"
              onClick={() => setLimit((previous) => previous + 20)}
            >
              Mostrar mais grupos
            </button>
          )}
        </div>

        <footer className="cgp-footer">
          <span>
            {validDraft.length}{' '}
            {validDraft.length === 1 ? 'grupo selecionado' : 'grupos selecionados'}
          </span>
          <div>
            <button type="button" className="cgp-button" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="cgp-button cgp-primary"
              disabled={validDraft.length === 0 || loading}
              onClick={() => onConfirm(validDraft)}
            >
              Confirmar {origin ? 'origem' : 'destinos'}
            </button>
          </div>
        </footer>
      </div>
    </dialog>,
    document.body
  );
}
