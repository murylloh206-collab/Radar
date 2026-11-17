'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const KEY = 'radar-consentimento-v1';
const VERSION = '2026-11-17';
export const OPEN_COOKIE_PREFS = 'radar-abrir-cookies';

interface Escolha { analise: boolean; marketing: boolean; versao: string; em: string; anonId: string }

function ler(): Escolha | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Escolha) : null;
    return parsed && parsed.versao === VERSION ? parsed : null;
  } catch {
    return null;
  }
}

const novoId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Aviso de cookies com recusa tão fácil quanto aceite. Hoje o Radar só usa cookies essenciais;
 * as categorias opcionais ficam desligadas até o aceite e a escolha é registrada no servidor.
 */
export function CookieConsent() {
  const [aberto, setAberto] = useState(false);
  const [detalhes, setDetalhes] = useState(false);
  const [analise, setAnalise] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const atual = ler();
    if (!atual) setAberto(true);
    else { setAnalise(atual.analise); setMarketing(atual.marketing); }
    const abrir = () => { setAberto(true); setDetalhes(true); };
    window.addEventListener(OPEN_COOKIE_PREFS, abrir);
    return () => window.removeEventListener(OPEN_COOKIE_PREFS, abrir);
  }, []);

  const salvar = (escolha: { analise: boolean; marketing: boolean }) => {
    const anterior = ler();
    const registro: Escolha = { ...escolha, versao: VERSION, em: new Date().toISOString(), anonId: anterior?.anonId || novoId() };
    try { window.localStorage.setItem(KEY, JSON.stringify(registro)); } catch { /* sem armazenamento: vale só nesta visita */ }
    void fetch('/api/legal/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: VERSION, choices: escolha, anonId: registro.anonId }),
      keepalive: true,
    }).catch(() => undefined);
    setAnalise(escolha.analise);
    setMarketing(escolha.marketing);
    setAberto(false);
    setDetalhes(false);
  };

  if (!aberto) return null;

  return (
    <div className="rck" role="dialog" aria-modal="false" aria-labelledby="rck-t" aria-describedby="rck-d">
      <p id="rck-t" className="rck-t">Sua privacidade</p>
      <p id="rck-d">
        Usamos só cookies essenciais para você entrar e usar o painel. Cookies opcionais (análise e marketing) ficam
        desligados até você aceitar. Hoje não usamos nenhum. <Link href="/legal/cookies">Política de Cookies</Link>
      </p>

      {detalhes && (
        <fieldset className="rck-opts">
          <legend className="sr-only">Categorias de cookies</legend>
          <label><input type="checkbox" checked disabled /> <span><strong>Essenciais</strong> · sempre ativos, necessários para o login</span></label>
          <label><input type="checkbox" checked={analise} onChange={e => setAnalise(e.target.checked)} /> <span><strong>Análise</strong> · medir uso para melhorar o produto</span></label>
          <label><input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} /> <span><strong>Marketing</strong> · medir campanhas e anúncios</span></label>
        </fieldset>
      )}

      <div className="rck-actions">
        <button type="button" className="rck-btn" onClick={() => salvar({ analise: false, marketing: false })}>Recusar opcionais</button>
        <button type="button" className="rck-btn" onClick={() => salvar({ analise: true, marketing: true })}>Aceitar opcionais</button>
        {detalhes
          ? <button type="button" className="rck-link" onClick={() => salvar({ analise, marketing })}>Salvar minha escolha</button>
          : <button type="button" className="rck-link" onClick={() => setDetalhes(true)}>Personalizar</button>}
      </div>
    </div>
  );
}

/** Link para reabrir as preferências (usar em rodapés). */
export function CookiePrefsLink({ className }: { className?: string }) {
  return (
    <button type="button" className={className || 'rck-reopen'} onClick={() => window.dispatchEvent(new CustomEvent(OPEN_COOKIE_PREFS))}>
      Preferências de cookies
    </button>
  );
}
