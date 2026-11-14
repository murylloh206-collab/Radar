-- 10 — Conector de lojas: saúde real por loja, pareamento da extensão e checagem diária.
-- Colar inteiro no SQL Editor do Supabase. Idempotente.

-- Parte 1: saúde por loja ------------------------------------------------------
create table if not exists public.store_health (
  user_id uuid not null,
  store_name text not null,
  status text not null check (status in ('ok', 'falhou', 'sem_teste', 'nao_configurado')),
  reason text,
  last_checked_at timestamptz,
  last_ok_at timestamptz,
  primary key (user_id, store_name)
);
alter table public.store_health enable row level security;
