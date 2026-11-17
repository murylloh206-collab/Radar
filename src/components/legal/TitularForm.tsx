'use client';

import React, { useState } from 'react';

const TIPOS: { id: string; label: string }[] = [
  { id: 'acesso', label: 'Ver quais dados vocês têm sobre mim' },
  { id: 'correcao', label: 'Corrigir dados' },
  { id: 'portabilidade', label: 'Receber uma cópia dos meus dados' },
  { id: 'exclusao', label: 'Encerrar minha conta e apagar meus dados' },
  { id: 'revogacao', label: 'Revogar um consentimento' },
  { id: 'informacao', label: 'Saber com quem meus dados são compartilhados' },
  { id: 'oposicao', label: 'Me opor a um tratamento' },
  { id: 'outro', label: 'Outro assunto de privacidade' },
];

/** Formulário de pedido do titular (LGPD, art. 18). Gera protocolo e avisa o Encarregado. */
export function TitularForm() {
  const [kind, setKind] = useState('acesso');
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'ok' | 'erro'; text?: string }>({ status: 'idle' });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState({ status: 'sending' });
    try {
      const res = await fetch('/api/legal/titular', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, email, details }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) setState({ status: 'ok', text: data.protocol });
      else setState({ status: 'erro', text: data?.error || 'Não consegui registrar agora. Tente de novo.' });
    } catch {
      setState({ status: 'erro', text: 'Sem conexão. Tente de novo.' });
    }
  };

  if (state.status === 'ok') {
    return (
      <div className="lg-ok" role="status">
        <strong>Pedido registrado.</strong>
        <p>Protocolo <b>{state.text}</b>. Guarde este número. Respondemos no e-mail informado, com a resposta completa em até 15 dias (LGPD, art. 19). Podemos pedir uma confirmação de identidade antes de agir.</p>
      </div>
    );
  }

  return (
    <form className="lg-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="lg-kind">O que você quer pedir?</label>
        <select id="lg-kind" value={kind} onChange={e => setKind(e.target.value)}>
          {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="lg-email">E-mail para a resposta (o mesmo da conta, se tiver)</label>
        <input id="lg-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
      </div>
      <div className="field">
        <label htmlFor="lg-details">Detalhes (opcional)</label>
        <textarea id="lg-details" rows={4} maxLength={2000} value={details} onChange={e => setDetails(e.target.value)} placeholder="Conte o que precisa. Não escreva senhas nem dados de cartão." />
      </div>
      {state.status === 'erro' && <p className="form-message warn" role="alert">{state.text}</p>}
      <button type="submit" className="action primary wide-button" disabled={state.status === 'sending'}>
        {state.status === 'sending' ? 'Enviando…' : 'Enviar pedido'}
      </button>
    </form>
  );
}
