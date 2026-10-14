-- ============================================================================
-- MIGRATION: ENFORCEMENT DE QUALIDADE DA FILA (RADAR DE OFERTAS)
-- Data: 2026-10-14
-- Objetivo:
--   1. Configurações separadas e explícitas de score:
--      - min_pending_score (default 75)
--      - min_auto_publish_score (default 75)
--      - min_manual_publish_score (default 75)
--      - require_verifiable_discount (default true)
--   2. Atualizar claim_next_scheduled_offer() para filtrar rigidamente score >= min_auto_publish_score
--   3. Script idempotente de saneamento de dados para ofertas pendentes e aprovadas existentes
-- ============================================================================

-- 1. Adiciona colunas explícitas na tabela scheduler_settings se não existirem
alter table public.scheduler_settings
  add column if not exists min_pending_score integer not null default 75,
  add column if not exists min_auto_publish_score integer not null default 75,
  add column if not exists min_manual_publish_score integer not null default 75,
  add column if not exists require_verifiable_discount boolean not null default true;

-- Garante que valores nulos sejam atualizados para o padrão 75
update public.scheduler_settings
set
  min_pending_score = coalesce(min_pending_score, 75),
  min_auto_publish_score = coalesce(min_auto_publish_score, min_score, 75),
  min_manual_publish_score = coalesce(min_manual_publish_score, 75),
  require_verifiable_discount = coalesce(require_verifiable_discount, true)
where id = 1;

-- 2. Atualiza a função atômica claim_next_scheduled_offer() com proteção estrita de score
create or replace function public.claim_next_scheduled_offer(lock_timeout_seconds integer default 120)
returns setof public.offers as $$
declare
  target_id text;
  v_min_auto_score integer;
begin
  -- Obtém o score mínimo configurado para despacho automático (padrão 75)
  select coalesce(min_auto_publish_score, min_score, 75)
  into v_min_auto_score
  from public.scheduler_settings
  where id = 1;

  if v_min_auto_score is null then
    v_min_auto_score := 75;
  end if;

  -- 1. Localiza atomicamente a melhor oferta agendada vencida (scheduled_for <= now())
  -- Exige status 'aprovado' e score >= v_min_auto_score
  select id into target_id
  from public.offers
  where status = 'aprovado'
    and coalesce(opportunity_score, 0) >= v_min_auto_score
    and (
      (whatsapp_status = 'agendado' and (scheduled_for is null or scheduled_for <= now()))
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

-- 3. Rotina de Saneamento Idempotente no Banco de Dados
-- Move ofertas pendentes ou aprovadas com score < 75 ou sem desconto verificável para 'rejeitado'
-- Preserva ofertas publicadas e histórico
update public.offers
set
  status = 'rejeitado',
  whatsapp_status = 'falhou',
  rejection_detail = jsonb_build_object(
    'reason', case
      when coalesce(opportunity_score, 0) < 75 then 'Score ' || coalesce(opportunity_score, 0)::text || '/100 abaixo do mínimo permitido (75/100).'
      when original_price is null or original_price <= price then 'Desconto não verificável: preço de referência indisponível.'
      else 'Critérios mínimos de qualidade não atendidos.'
    end,
    'failedFilters', jsonb_build_array('sanitized_low_score_or_unverifiable_discount'),
    'rejectedAt', now(),
    'previousStatus', status
  ),
  status_changed_at = now(),
  updated_at = now()
where status in ('pendente', 'aprovado')
  and (
    coalesce(opportunity_score, 0) < 75
    or (
      (original_price is null or original_price <= price)
      and (coupon is null or trim(coupon) = '')
    )
  );
