-- ============================================================================
-- MIGRATION: EVOLUÇÃO DO AGENDADOR INTELIGENTE (SMART SCHEDULER EVOLUTION)
-- Data: 2026-10-14
-- Compatibilidade: Totalmente retrocompatível com a tabela scheduler_settings existente.
-- ============================================================================

-- 1. Adicionar colunas operacionais dos 3 modos e distribuição
alter table if exists public.scheduler_settings
  add column if not exists mode text not null default 'interval_minutes'
    check (mode in ('daily_target', 'posts_per_hour', 'interval_minutes')),
  add column if not exists distribution text not null default 'fixed'
    check (distribution in ('fixed', 'randomized')),
  add column if not exists interval_minutes integer not null default 20
    check (interval_minutes between 5 and 360),
  add column if not exists posts_per_hour integer not null default 3
    check (posts_per_hour between 1 and 30),
  add column if not exists min_score integer not null default 75
    check (min_score between 0 and 100);

-- 2. Garantir registro padrão singleton inicializado
insert into public.scheduler_settings (
  id,
  state,
  start_hour,
  end_hour,
  daily_target,
  max_per_hour,
  timezone,
  channel_destination,
  mode,
  distribution,
  interval_minutes,
  posts_per_hour,
  min_score
)
values (
  1,
  'ativo',
  '07:00',
  '00:00',
  51,
  5,
  'America/Sao_Paulo',
  'Radar de Ofertas',
  'interval_minutes',
  'fixed',
  20,
  3,
  75
)
on conflict (id) do update set
  mode = coalesce(excluded.mode, public.scheduler_settings.mode),
  distribution = coalesce(excluded.distribution, public.scheduler_settings.distribution),
  interval_minutes = coalesce(excluded.interval_minutes, public.scheduler_settings.interval_minutes),
  posts_per_hour = coalesce(excluded.posts_per_hour, public.scheduler_settings.posts_per_hour),
  min_score = coalesce(excluded.min_score, public.scheduler_settings.min_score);

-- 3. Função atômica aprimorada: claim_next_scheduled_offer() com proteção de score
create or replace function public.claim_next_scheduled_offer(lock_timeout_seconds integer default 120)
returns setof public.offers as $$
declare
  target_id text;
begin
  -- 1. Localiza atomicamente a oferta agendada vencida (scheduled_for <= now())
  -- Prioriza ofertas de maior oportunidade (score >= 75) e mais antigas na fila
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
