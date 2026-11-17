-- 15 · Status de grupo do WhatsApp (conector próprio, sob demanda)
-- Só acrescenta: uma tabela nova para a sessão do conector e um canal novo em social_posts.
-- A sessão (chaves do WhatsApp) fica cifrada pelo servidor; RLS ligado e nenhuma política para usuários.

create table if not exists public.wa_gateway_auth (
  session_id text not null,
  kind text not null,
  key_id text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (session_id, kind, key_id)
);
alter table public.wa_gateway_auth enable row level security;

create table if not exists public.wa_gateway_sessions (
  session_id text primary key,
  user_id uuid not null,
  phone text,
  status text not null default 'desconectado' check (status in ('desconectado', 'pareando', 'conectado', 'expirado')),
  last_error text,
  paired_at timestamptz,
  last_used_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists wa_gateway_sessions_user_idx on public.wa_gateway_sessions (user_id);
alter table public.wa_gateway_sessions enable row level security;

alter table public.social_posts drop constraint if exists social_posts_channel_check;
alter table public.social_posts add constraint social_posts_channel_check
  check (channel in ('instagram_story', 'instagram_feed', 'whatsapp_status', 'whatsapp_group_status'));
