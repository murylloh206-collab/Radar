'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ArrowLeftRight, PenTool, Send, Tag, Store, Users, MousePointerClick, CheckCircle2 } from 'lucide-react';
import { OverlappingStoreLogos } from '@/components/BrandLogo';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { CountUp } from '@/components/CountUp';

interface DashboardData {
  summary: { totalMembers: number; destinationGroupsCount: number; totalSent: number; totalFailed: number; successRate: number;
    sentToday: number; sentWeek: number; sentMonth: number; totalClicks: number; whatsappClicks7d: number; dailyAverageClicks: number };
  groups: { name: string; jid: string; participants: number }[];
  timeline: { date: string; label: string; sent: number; clicks: number }[];
  topProducts: { title: string; clicks: number; store: string }[];
}

const GROUP_CAPACITY = 1024;
const number = (value: number) => value.toLocaleString('pt-BR');

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}

export default function PainelPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('modal') === 'lojas') {
      setTimeout(() => window.dispatchEvent(new CustomEvent('open-stores-dialog')), 150);
    }
    fetch('/api/analytics/dashboard', { cache: 'no-store' })
      .then(res => res.json())
      .then(json => (json?.ok ? setData(json) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  const openStoresDialog = () => window.dispatchEvent(new CustomEvent('open-stores-dialog'));
  const summary = data?.summary;
  const timeline = data?.timeline || [];
  const peak = Math.max(1, ...timeline.map(day => Math.max(day.sent, day.clicks)));
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="rp-page rv5-home">
      <header className="rv5-hello">
        <div>
          <p className="rv5-date">{today}</p>
          <h1>{greeting()}. Seu radar está ligado.</h1>
        </div>
        <div className="rp-actions">
          <Link href="/criar-conteudo" className="rp-btn">Criar conteúdo</Link>
          <Link href="/copiador" className="rp-btn rp-primary">Abrir Copiador <ArrowUpRight className="w-4 h-4" /></Link>
        </div>
      </header>

      <section className="rv5-stage" aria-label="Resumo de hoje">
        <div className="rv5-scope" aria-hidden="true">
          <span className="rv5-scope-sweep" />
          {(data?.groups || []).slice(0, 5).map((group, index) => (
            <i key={group.jid} style={{ ['--a' as string]: `${index * 67 + 20}deg`, ['--r' as string]: `${38 + (index % 3) * 24}px` }} />
          ))}
        </div>
        <div className="rv5-stage-copy">
          <p className="rv5-kicker">Hoje</p>
          <p className="rv5-big">
            {summary ? <CountUp value={summary.sentToday} /> : <span className="rv4-skeleton" style={{ display: 'inline-block', width: 90, height: 56 }} />}
            <small>{summary?.sentToday === 1 ? 'oferta publicada' : 'ofertas publicadas'}</small>
          </p>
          <p className="rv5-stage-note">
            {failed
              ? 'Não consegui carregar os números agora. As outras áreas do painel funcionam normalmente.'
              : summary
                ? `${number(summary.sentWeek)} nesta semana em ${number(summary.destinationGroupsCount)} ${summary.destinationGroupsCount === 1 ? 'grupo' : 'grupos'}, com ${summary.successRate}% de entrega.`
                : 'Carregando os números do seu radar…'}
          </p>
        </div>
        <dl className="rv5-figures">
          <div>
            <dt><Users className="w-4 h-4" /> Pessoas nos grupos</dt>
            <dd>{summary ? <CountUp value={summary.totalMembers} /> : '–'}</dd>
          </div>
          <div>
            <dt><MousePointerClick className="w-4 h-4" /> Cliques em 7 dias</dt>
            <dd>{summary ? <CountUp value={summary.totalClicks} /> : '–'}</dd>
          </div>
          <div>
            <dt><CheckCircle2 className="w-4 h-4" /> Entrega</dt>
            <dd>{summary ? <CountUp value={summary.successRate} suffix="%" /> : '–'}</dd>
          </div>
        </dl>
      </section>

      <div className="rv5-columns">
        <section className="rp-panel rv5-week">
          <div className="rp-row">
            <h2>Últimos 7 dias</h2>
            <div className="rv5-legend"><span data-k="sent" /> Publicadas <span data-k="clicks" /> Cliques</div>
          </div>
          <div className="rv5-bars" role="img" aria-label="Ofertas publicadas e cliques por dia nos últimos 7 dias">
            {timeline.length === 0 && <p className="rp-sub">Sem dados ainda.</p>}
            {timeline.map(day => (
              <div key={day.date} className="rv5-bar-day" title={`${day.label}: ${day.sent} publicadas, ${day.clicks} cliques`}>
                <div className="rv5-bar-pair">
                  <span data-k="sent" style={{ height: `${Math.max(3, (day.sent / peak) * 100)}%` }} />
                  <span data-k="clicks" style={{ height: `${Math.max(3, (day.clicks / peak) * 100)}%` }} />
                </div>
                <small>{day.label.split(',')[0].replace('.', '')}</small>
              </div>
            ))}
          </div>
          <Link href="/estatisticas" className="rv5-more">Ver estatísticas completas <ArrowUpRight className="w-3.5 h-3.5" /></Link>
        </section>

        <section className="rp-panel rv5-groups">
          <div className="rp-row">
            <h2>Seus grupos</h2>
            <Link href="/conexoes" className="rv5-more" style={{ margin: 0 }}>Gerenciar <ArrowUpRight className="w-3.5 h-3.5" /></Link>
          </div>
          {data && data.groups.length === 0 && (
            <p className="rp-sub">Nenhum grupo de destino ainda. Escolha os grupos no Copiador para começar a publicar.</p>
          )}
          <ul>
            {(data?.groups || []).slice(0, 6).map(group => (
              <li key={group.jid}>
                <div className="rp-row" style={{ flexWrap: 'nowrap' }}>
                  <strong>{group.name}</strong>
                  <span><CountUp value={group.participants} /></span>
                </div>
                <div className="rv5-meter"><span style={{ width: `${Math.min(100, (group.participants / GROUP_CAPACITY) * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <OnboardingChecklist />

      <section aria-label="Atalhos">
        <h2 className="rv5-section-title">Ir direto ao trabalho</h2>
        <div className="rv5-shortcuts">
          <Link href="/copiador"><ArrowLeftRight /><span><strong>Copiador</strong><small>Copiar de um grupo e publicar nos seus</small></span><ArrowUpRight className="rv5-go" /></Link>
          <Link href="/criar-conteudo"><PenTool /><span><strong>Criar conteúdo</strong><small>Oferta, mensagem livre ou story</small></span><ArrowUpRight className="rv5-go" /></Link>
          <Link href="/envios"><Send /><span><strong>Envios</strong><small>Revisar, agendar e ver o histórico</small></span><ArrowUpRight className="rv5-go" /></Link>
          <Link href="/ofertas"><Tag /><span><strong>Ofertas</strong><small>Catálogo e busca automática</small></span><ArrowUpRight className="rv5-go" /></Link>
          <button type="button" onClick={openStoresDialog}>
            <Store /><span><strong>Suas lojas</strong><small>Shopee, Netshoes, Amazon e Mercado Livre</small></span>
            <span className="rv5-stores"><OverlappingStoreLogos /></span>
          </button>
        </div>
      </section>

      {data && data.topProducts.length > 0 && (
        <section className="rp-panel rv5-top">
          <h2>Mais clicados</h2>
          <ol>
            {data.topProducts.slice(0, 5).map((product, index) => (
              <li key={`${product.title}-${index}`}>
                <span className="rv5-rank">{index + 1}</span>
                <span className="rv5-top-title">{product.title}<small>{product.store}</small></span>
                <strong>{number(product.clicks)} <small>cliques</small></strong>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
