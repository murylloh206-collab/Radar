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
