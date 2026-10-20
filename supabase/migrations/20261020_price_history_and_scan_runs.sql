-- ============================================================================
-- MIGRATION: HISTÓRICO DE PREÇOS RELACIONAL E AUDITORIA DE EXECUÇÕES (SCAN RUNS)
-- Data: 2026-10-20
-- Objetivo:
--   1. Tabela offer_price_history: histórico relacional de preços de cada oferta
--      para permitir cálculo de menor preço histórico, médias e gráficos temporais.
--   2. Tabela scan_runs: auditoria por execução com contadores de produtos encontrados,
--      inseridos, atualizados, rejeitados por motivo (preço, desconto, vendas, nota, blacklist)
--      e log de erros.
-- ============================================================================

-- 1. Criação da tabela offer_price_history
create table if not exists public.offer_price_history (
  id text primary key,
  offer_id text not null references public.offers(id) on delete cascade,
  external_id text not null,
  source text not null default 'shopee',
  price numeric not null,
  original_price numeric,
  discount_percent integer,
  recorded_at timestamptz not null default now()
);

-- Índices otimizados para cálculo de mínima histórica e consultas temporais
create index if not exists idx_price_history_offer_date
  on public.offer_price_history (offer_id, recorded_at desc);

create index if not exists idx_price_history_external_date
  on public.offer_price_history (external_id, recorded_at desc);

-- 2. Criação da tabela scan_runs
create table if not exists public.scan_runs (
  id text primary key,
  source text not null default 'shopee',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  items_found integer not null default 0,
  items_inserted integer not null default 0,
  items_updated integer not null default 0,
  items_rejected_price integer not null default 0,
  items_rejected_discount integer not null default 0,
  items_rejected_blacklist integer not null default 0,
  items_rejected_sales integer not null default 0,
  items_rejected_rating integer not null default 0,
  approval_rate_brain numeric,
  approval_rate_exploration numeric,
  status text not null default 'sucesso' check (status in ('sucesso', 'falha', 'parcial', 'em_execucao')),
  error_message text,
  errors_log jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Garantia de idempotência se a tabela já existir previamente:
alter table public.scan_runs add column if not exists approval_rate_brain numeric;
alter table public.scan_runs add column if not exists approval_rate_exploration numeric;
alter table public.scan_runs add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_scan_runs_started_at
  on public.scan_runs (started_at desc);
create index if not exists idx_scan_runs_status
  on public.scan_runs (status);
