-- 14 · Conformidade LGPD / Marco Civil
-- Cria três tabelas novas (não altera nem apaga nada que já existe):
--   access_logs       registros de acesso (Marco Civil, art. 15) e trilha de auditoria; apagados após 6 meses
--   consent_records   prova de consentimento (cookies) e de aceite dos termos (LGPD, art. 8º, §2º)
--   titular_requests  pedidos dos titulares e registro de atendimentos do Encarregado (LGPD, arts. 18, 19 e 41)
-- Só o servidor (service role) lê e grava: RLS ligado e nenhuma política para usuários.

create table if not exists public.access_logs (
  id bigserial primary key,
  user_id text,
  event text not null,
  ip text,
  user_agent text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists access_logs_user_idx on public.access_logs (user_id, created_at desc);
create index if not exists access_logs_created_idx on public.access_logs (created_at);
alter table public.access_logs enable row level security;

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  anon_id text,
  kind text not null check (kind in ('cookies', 'termos')),
  version text not null,
  choices jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists consent_records_subject_idx on public.consent_records (coalesce(user_id, anon_id), created_at desc);
alter table public.consent_records enable row level security;

create table if not exists public.titular_requests (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique,
  user_id text,
  email text not null,
  kind text not null check (kind in ('acesso', 'correcao', 'exclusao', 'portabilidade', 'revogacao', 'informacao', 'oposicao', 'outro')),
  details text,
  status text not null default 'aberto' check (status in ('aberto', 'em_andamento', 'respondido', 'recusado')),
  response text,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists titular_requests_status_idx on public.titular_requests (status, created_at);
alter table public.titular_requests enable row level security;

-- Descarte automático dos registros de acesso após 6 meses (Política de Retenção).
create or replace function public.purge_old_access_logs() returns integer
language sql security definer set search_path = public as $$
  with apagados as (
    delete from public.access_logs where created_at < now() - interval '6 months' returning 1
  )
  select count(*)::integer from apagados;
$$;

-- Agenda diária às 04:10 (UTC) se o pg_cron estiver ativo no projeto.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'radar_purge_access_logs';
    perform cron.schedule('radar_purge_access_logs', '10 4 * * *', 'select public.purge_old_access_logs()');
  end if;
end $$;
