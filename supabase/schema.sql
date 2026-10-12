-- ============================================================================
-- RADAR DE OFERTAS AFILIADAS — SCHEMA DO SUPABASE POSTGRESQL
-- ============================================================================
-- Armazenamento persistente compartilhado entre os dois administradores.
-- Inclui tabelas para ofertas, histórico de preços, configurações do agendador
-- e funções atômicas para prevenção de concorrência e publicações duplicadas.
-- ============================================================================

-- Extensões úteis
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. Tabela: offers
-- ----------------------------------------------------------------------------
create table if not exists public.offers (
  id text primary key,
  source text not null default 'mercadolivre',
  external_id text not null,
  title text not null,
  thumbnail text,
  price numeric not null,
  original_price numeric,
  discount_percent integer,
  currency text not null default 'BRL',
  original_url text not null,
  free_shipping boolean not null default false,
  search_term text,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'rejeitado', 'publicado')),
  affiliate_url text,
  short_url text,
  short_url_status text default 'pendente' check (short_url_status in ('pendente', 'gerando', 'pronto', 'falhou')),
  short_url_generated_at timestamptz,
  short_url_attempts integer default 0,
  short_url_error text,
  coupon text,
  coupon_description text,
  rating numeric,
  reviews_count integer,
  seller_reputation text,
  commission jsonb,
  opportunity_score numeric default 0,
  opportunity_reason text,
  price_history jsonb default '[]'::jsonb,
  whatsapp_status text default 'rascunho' check (whatsapp_status in ('rascunho', 'pronto', 'agendado', 'enviando', 'enviado', 'falhou')),
  whatsapp_message text,
  whatsapp_queued_at timestamptz,
  whatsapp_sent_at timestamptz,
  whatsapp_error text,
  scheduled_for timestamptz,
  scheduled_window_date text,
  send_attempts integer default 0,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status_changed_at timestamptz
);

-- Índices otimizados para concorrência e filtros rápidos
create index if not exists idx_offers_status on public.offers (status);
create index if not exists idx_offers_whatsapp_status on public.offers (whatsapp_status);
create index if not exists idx_offers_scheduled_for on public.offers (scheduled_for) where whatsapp_status = 'agendado';
create index if not exists idx_offers_external_id on public.offers (external_id);

-- ----------------------------------------------------------------------------
-- 2. Tabela: scheduler_settings (Configurações Singleton do Agendador)
-- ----------------------------------------------------------------------------
create table if not exists public.scheduler_settings (
  id integer primary key default 1 check (id = 1),
  state text not null default 'ativo' check (state in ('ativo', 'pausado', 'interrompido_erro')),
  start_hour text not null default '07:00',
  end_hour text not null default '00:00',
  daily_target integer not null default 60 check (daily_target between 10 and 150),
  max_per_hour integer not null default 5 check (max_per_hour between 1 and 30),
  timezone text not null default 'America/Sao_Paulo',
  channel_destination text not null default 'Grupo VIP de Ofertas',
  consecutive_failures integer not null default 0,
  max_consecutive_failures integer not null default 3,
  last_dispatched_at timestamptz,
  last_dispatched_title text,
  last_error text,
  updated_at timestamptz not null default now()
);

-- Insere o registro padrão se não existir
insert into public.scheduler_settings (id, state, start_hour, end_hour, daily_target, max_per_hour, timezone, channel_destination)
values (1, 'ativo', '07:00', '00:00', 60, 5, 'America/Sao_Paulo', 'Grupo VIP de Ofertas')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Tabela: app_metadata (Tokens do ML, Busca Recente, etc.)
-- ----------------------------------------------------------------------------
create table if not exists public.app_metadata (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. Função Atômica: claim_next_scheduled_offer()
-- ----------------------------------------------------------------------------
-- Impede corrida concorrente entre duas instâncias do cron ou usuários simultâneos.
-- Utiliza "FOR UPDATE SKIP LOCKED" para reservar atomicamente uma única oferta agendada vencida.
create or replace function public.claim_next_scheduled_offer(lock_timeout_seconds integer default 120)
returns setof public.offers as $$
declare
  target_id text;
begin
  -- 1. Localiza e bloqueia a oferta agendada mais antiga com scheduled_for <= now()
  -- ou que estava travada mas cujo lock expirou (recuperação de tarefas interrompidas)
  select id into target_id
  from public.offers
  where (
    (whatsapp_status = 'agendado' and scheduled_for <= now())
    or
    (whatsapp_status = 'enviando' and locked_at < now() - (lock_timeout_seconds || ' seconds')::interval)
  )
  order by coalesce(scheduled_for, status_changed_at, created_at) asc
  limit 1
  for update skip locked;

  if target_id is null then
    return;
  end if;

  -- 2. Atualiza atomicamente para 'enviando', carimba locked_at e incrementa tentativas
  return query
  update public.offers
  set whatsapp_status = 'enviando',
      locked_at = now(),
      send_attempts = send_attempts + 1,
      updated_at = now()
  where id = target_id
  returning *;
end;
$$ language plpgsql security definer;
