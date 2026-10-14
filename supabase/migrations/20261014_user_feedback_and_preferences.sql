-- ============================================================================
-- MIGRATION: APRENDIZADO DE PREFERÊNCIAS E FEEDBACKS DE OFERTAS
-- Data: 2026-10-14
-- Objetivo:
--   1. Tabela offer_feedbacks: armazena aprovações, rejeições e motivos detalhados.
--   2. Tabela learned_preferences: singleton para marcas, vendedores, palavras-chave bloqueadas e pesos do modelo.
--   3. Novos campos na tabela offers: brand, seller_name, preference_score, recommendation_reason, is_exploration.
-- ============================================================================

-- 1. Cria a tabela de feedbacks das ofertas
create table if not exists public.offer_feedbacks (
  id text primary key,
  offer_id text not null,
  external_id text not null,
  action text not null check (action in ('aprovar', 'rejeitar', 'bloquear_marca', 'bloquear_vendedor')),
  reason text,
  category text,
  brand text,
  title text not null,
  price numeric not null,
  discount_percent numeric,
  rating numeric,
  reviews_count integer,
  free_shipping boolean not null default false,
  seller text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Índices de consulta rápida
create index if not exists idx_offer_feedbacks_offer_id on public.offer_feedbacks(offer_id);
create index if not exists idx_offer_feedbacks_external_id on public.offer_feedbacks(external_id);
create index if not exists idx_offer_feedbacks_action on public.offer_feedbacks(action);
create index if not exists idx_offer_feedbacks_created_at on public.offer_feedbacks(created_at desc);

-- 2. Cria a tabela de preferências aprendidas (Singleton)
create table if not exists public.learned_preferences (
  id integer primary key default 1 check (id = 1),
  blocked_brands jsonb not null default '[]'::jsonb,
  blocked_sellers jsonb not null default '[]'::jsonb,
  blocked_keywords jsonb not null default '[]'::jsonb,
  blocked_categories jsonb not null default '[]'::jsonb,
  feature_weights jsonb not null default '{}'::jsonb,
  total_approvals integer not null default 0,
  total_rejections integer not null default 0,
  last_trained_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Garante que o registro singleton exista
insert into public.learned_preferences (
  id,
  blocked_brands,
  blocked_sellers,
  blocked_keywords,
  blocked_categories,
  feature_weights,
  total_approvals,
  total_rejections,
  updated_at
)
values (
  1,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  0,
  0,
  now()
)
on conflict (id) do nothing;

-- 3. Adiciona colunas para recomendação inteligente na tabela offers
alter table if exists public.offers
  add column if not exists brand text,
  add column if not exists seller_name text,
  add column if not exists preference_score numeric default 0.5,
  add column if not exists recommendation_reason text,
  add column if not exists is_exploration boolean not null default false;

create index if not exists idx_offers_preference_score on public.offers(preference_score desc);
create index if not exists idx_offers_brand on public.offers(brand);
