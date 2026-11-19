-- 17 · Assistente WhatsApp v1: a pessoa manda links no privado e recebe os links de afiliado do dono da conta.
-- Só acrescenta tabelas novas; o Copiador e as filas dos grupos não mudam.
-- O número de quem conversa é guardado só enquanto a resposta não sai (depois fica apenas um código embaralhado
-- para o limite diário). Só o servidor (service role) lê e grava: RLS ligado e nenhuma política para usuários.

create table if not exists public.assistant_settings (
  connection_id text primary key,
  user_id uuid not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists assistant_settings_user_idx on public.assistant_settings (user_id);
alter table public.assistant_settings enable row level security;

create table if not exists public.assistant_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  connection_id text not null,
  message_id text not null,
  contact_hash text not null,
  remote_jid text,
  message_text text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed', 'ignored')),
  kind text,
  attempts integer not null default 0,
  links_total integer not null default 0,
  links_ok integer not null default 0,
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (connection_id, message_id)
);
create index if not exists assistant_inbox_pending_idx on public.assistant_inbox (status, received_at);
create index if not exists assistant_inbox_contact_idx on public.assistant_inbox (connection_id, contact_hash, received_at desc);
create index if not exists assistant_inbox_user_idx on public.assistant_inbox (user_id, received_at desc);
alter table public.assistant_inbox enable row level security;

-- Descarte dos registros do assistente após 90 dias (Política de Retenção).
create or replace function public.purge_old_assistant_inbox() returns integer
language sql security definer set search_path = public as $$
  with apagados as (
    delete from public.assistant_inbox where received_at < now() - interval '90 days' returning 1
  )
  select count(*)::integer from apagados;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'radar_purge_assistant_inbox';
    perform cron.schedule('radar_purge_assistant_inbox', '20 4 * * *', 'select public.purge_old_assistant_inbox()');
  end if;
end $$;
