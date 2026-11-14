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

-- Parte 2: teste diário das lojas às 08:00 (Brasília) ------------------------------
select cron.unschedule(jobname) from cron.job where jobname = 'radar-lojas-saude';
select cron.schedule('radar-lojas-saude', '0 11 * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'radar_app_url') || '/api/cron/store-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'radar_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);

-- Parte 3: vínculo extensão ↔ conta (só hashes) -----------------------------------
create table if not exists public.extension_pairing_codes (
  code_hash text primary key,
  user_id uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.extension_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists extension_tokens_user_idx on public.extension_tokens (user_id);
alter table public.extension_pairing_codes enable row level security;
alter table public.extension_tokens enable row level security;
