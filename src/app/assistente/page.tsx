'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bot, CheckCircle2, Link2, Loader2, MessageCircle, Power, XCircle } from 'lucide-react';

interface Connection { id: string; label: string; phoneNumber: string | null; status: string; enabled: boolean }
interface Recent { id: string; connectionId: string; status: string; kind: string | null; linksTotal: number; linksOk: number; error: string | null; at: string }
interface Data { mlApi?: { connected: boolean; configured: boolean }; connections: Connection[]; today: { conversations: number; links: number; failures: number }; recent: Recent[] }

const time = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const phone = (n: string | null) => (n ? `+${n.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, '$1 ($2) $3-$4')}` : 'Sem número');

function describe(r: Recent): string {
  if (r.kind === 'conversa') return 'Mandou mensagem sem link: o bot respondeu e pediu o link';
  if (r.kind === 'pediu_link') return 'Escolheu 1 (converter link)';
  if (r.kind === 'pediu_busca') return 'Escolheu 4 (buscar nas lojas)';
  if (r.kind === 'ofertas') return 'Escolheu 2 (ofertas de hoje)';
  if (r.kind === 'cupons') return 'Escolheu 3 (cupons de hoje)';
  if (r.kind === 'busca') return `Buscou nas lojas: ${r.linksOk} ${r.linksOk === 1 ? 'opção confiável' : 'opções confiáveis'}`;
  if (r.kind === 'ajuda') return 'Recebeu o menu';
  if (r.kind === 'sem_link') return 'Muitas mensagens sem link em 1 hora: o bot pausou com esta pessoa';
  if (r.kind === 'limite') return 'Atingiu o limite diário de links';
  if (r.status === 'failed') return `Não respondido: ${r.error || 'falha'}`;
  if (r.status === 'pending' || r.status === 'processing') return 'Respondendo…';
  return `${r.linksOk} de ${r.linksTotal} ${r.linksTotal === 1 ? 'link convertido' : 'links convertidos'}${r.error && r.linksOk < r.linksTotal ? ` · ${r.error}` : ''}`;
}

export default function AssistentePage() {
  const [data, setData] = useState<Data | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mlNotice, setMlNotice] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('ml');
    if (!status) return;
    const texts: Record<string, string> = {
      ok: 'API do Mercado Livre conectada. As fotos do Mercado Livre já vão no assistente.',
      erro: 'O Mercado Livre recusou a autorização. Tente de novo; se repetir, me avise.',
      expirado: 'A autorização demorou ou foi interrompida. Clique em Conectar de novo.',
      negado: 'Só a conta dona pode conectar a API do Mercado Livre.',
    };
    setMlNotice({ ok: status === 'ok', text: texts[status] || 'Autorização concluída.' });
    window.history.replaceState(null, '', '/assistente');
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/assistant', { cache: 'no-store' });
      const json = await res.json();
      if (json.locked) { setLocked(true); return; }
      if (!res.ok) throw new Error(json.error || 'Não foi possível carregar.');
      setData(json); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar.'); }
  }, []);

  useEffect(() => { void load(); const t = setInterval(() => void load(), 15000); return () => clearInterval(t); }, [load]);

  const toggle = async (c: Connection) => {
    setBusy(c.id);
    try {
      const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId: c.id, enabled: !c.enabled }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Não foi possível salvar.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { setBusy(null); }
  };

  return (
    <section className="rp-page" aria-label="Assistente WhatsApp">
      <header className="rv6-head">
        <div>
          <h1>Assistente</h1>
          <p>Quem chamar o seu WhatsApp no privado e mandar o link de um produto recebe na hora o mesmo produto com o <strong>seu link de afiliado</strong>. Funciona com Mercado Livre, Shopee, Amazon e Netshoes.</p>
        </div>
      </header>

      {locked ? (
        <div className="rp-panel">Página não encontrada.</div>
      ) : !data ? (
        <div className="rp-panel" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {error ? <><XCircle className="w-4 h-4" /> {error}</> : <><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</>}
        </div>
      ) : (
        <>
          {error && <p className="rgs-error" role="alert">{error}</p>}

          <div className="rast-figures">
            <div><MessageCircle className="w-4 h-4" /><strong>{data.today.conversations}</strong><span>pessoas atendidas hoje</span></div>
            <div><Link2 className="w-4 h-4" /><strong>{data.today.links}</strong><span>links convertidos hoje</span></div>
            <div><XCircle className="w-4 h-4" /><strong>{data.today.failures}</strong><span>links que não deu para converter</span></div>
          </div>

          {mlNotice && <p className={mlNotice.ok ? 'rp-tag rp-good' : 'rgs-error'} role="status" style={{ display: 'block', padding: '10px 14px', marginBottom: 14 }}>{mlNotice.text}</p>}

          <section className="rp-panel" aria-labelledby="rast-ml">
            <h2 id="rast-ml">Fotos do Mercado Livre</h2>
            <p className="rp-sub">Para mandar a foto dos produtos do Mercado Livre que ainda não saíram nos grupos, o assistente usa a API oficial do Mercado Livre (só leitura). Conecte uma vez; o acesso é renovado sozinho.</p>
            {data.mlApi?.connected
              ? <span className="rp-tag rp-good"><CheckCircle2 className="w-3.5 h-3.5" /> API do Mercado Livre conectada</span>
              : <a className="rp-btn rp-primary" href="/api/integrations/mercadolivre/oauth/start" style={{ display: 'inline-flex', marginTop: 8 }}>Conectar API do Mercado Livre</a>}
            {data.mlApi && !data.mlApi.configured && <p className="rgs-error" style={{ marginTop: 10 }}>As chaves do aplicativo do Mercado Livre não estão configuradas no servidor.</p>}
          </section>

          <section className="rp-panel" aria-labelledby="rast-numeros">
            <h2 id="rast-numeros">Números</h2>
            <p className="rp-sub">Ligue o assistente só no número que vai atender. Ele nunca responde dentro dos grupos.</p>
            <ul className="rast-list">
              {data.connections.map(c => (
                <li key={c.id}>
                  <Bot className="w-5 h-5" />
                  <span><strong>{c.label}</strong><small>{phone(c.phoneNumber)} · {c.status === 'connected' ? 'conectado' : 'desconectado'}</small></span>
                  <button type="button" className={`rp-btn${c.enabled ? '' : ' rp-primary'}`} disabled={busy === c.id} onClick={() => toggle(c)} aria-pressed={c.enabled}>
                    {busy === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                    {c.enabled ? 'Desligar' : 'Ligar assistente'}
                  </button>
                  {c.enabled && <span className="rp-tag rp-good"><CheckCircle2 className="w-3.5 h-3.5" /> Atendendo</span>}
                </li>
              ))}
              {!data.connections.length && <li><span>Conecte um WhatsApp em Conexões para usar o assistente.</span></li>}
            </ul>
          </section>

          <section className="rp-panel" aria-labelledby="rast-ultimas">
            <h2 id="rast-ultimas">Últimas conversas</h2>
            <p className="rp-sub">Sem o telefone de ninguém: guardamos só o resultado de cada mensagem.</p>
            {data.recent.length === 0 ? <p className="rp-sub">Nenhuma conversa ainda.</p> : (
              <ul className="rast-recent">
                {data.recent.map(r => (
                  <li key={r.id} data-status={r.status}>
                    <time>{time(r.at)}</time>
                    <span>{describe(r)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="rp-panel" style={{ fontSize: 12.5, opacity: 0.85 }}>
            <strong>Como funciona:</strong> a pessoa manda um ou vários links (até 10 por mensagem, 40 por dia). O assistente usa as mesmas contas de afiliado do Copiador e só devolve links confirmados da sua conta; se não conseguir, avisa em vez de mandar o link original. Mensagens sem link recebem uma resposta curta pedindo o link (a explicação completa vai na primeira conversa); com mais de 8 mensagens sem link em 1 hora, ele pausa com aquela pessoa para não entrar em loop. A conexão de WhatsApp não é oficial: responder muitas mensagens aumenta o risco de restrição do número.
          </div>
        </>
      )}
    </section>
  );
}
