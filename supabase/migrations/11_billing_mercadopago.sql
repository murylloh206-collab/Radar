-- 11 — Assinaturas do Mercado Pago (incremental; não altera nem apaga dados existentes).
-- Colar inteiro no SQL Editor do Supabase. Idempotente.

create table if not exists public.billing_subscriptions (
  id uuid primary key,                      -- também é o external_reference enviado ao Mercado Pago
  user_id uuid not null,
  environment text not null check (environment in ('test', 'production')),
  plan_id text not null check (plan_id in ('impulse', 'plus', 'ultimate')),
  amount numeric(10, 2) not null,
  preapproval_id text unique,
  status text not null default 'pending',   -- pending | authorized | paused | cancelled
  next_payment_date timestamptz,
  paid_until timestamptz,
  last_payment_status text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists billing_subscriptions_user_idx on public.billing_subscriptions (user_id, environment, created_at desc);

create table if not exists public.billing_payments (
  mp_payment_id text primary key,           -- único: notificação repetida não duplica pagamento nem aviso
  subscription_id uuid not null references public.billing_subscriptions (id),
  authorized_payment_id text,
  status text not null,
  amount numeric(10, 2) not null,
  approved_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists billing_payments_sub_idx on public.billing_payments (subscription_id);

alter table public.billing_subscriptions enable row level security;
alter table public.billing_payments enable row level security;

-- Reconciliação: confere no Mercado Pago a cada hora (caso alguma notificação não chegue).
select cron.unschedule(jobname) from cron.job where jobname = 'radar-billing-reconcile';
select cron.schedule('radar-billing-reconcile', '17 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'radar_app_url') || '/api/cron/billing-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'radar_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);
