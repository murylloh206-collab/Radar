-- 08 · Agendador do copiador (Supabase pg_cron + pg_net)
-- Mantém o gateway do WhatsApp acordado e processa a fila sem depender de nenhum computador ligado.
-- Pré-requisito: três segredos no Vault (ver docs/superpowers/runbooks/2026-11-12-ativar-agendador.md):
--   radar_app_url      → endereço público do painel na Vercel (sem barra no final)
--   radar_gateway_url  → endereço do gateway Evolution (sem barra no final)
--   radar_cron_secret  → mesmo valor da variável CRON_SECRET na Vercel
-- Pode ser executada mais de uma vez: remove e recria os agendamentos.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove agendamentos anteriores com os mesmos nomes (idempotente)
select cron.unschedule(jobname) from cron.job
  where jobname in ('radar-fila', 'radar-gateway-acordar', 'radar-watchdog');

-- A cada minuto: processa a fila de publicações e a caixa de entrada do copiador
select cron.schedule('radar-fila', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'radar_app_url') || '/api/worker/poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'radar_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);

-- A cada 5 minutos: acessa o gateway para que o Render não o coloque para dormir
select cron.schedule('radar-gateway-acordar', '*/5 * * * *', $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'radar_gateway_url') || '/',
    timeout_milliseconds := 30000
  );
$job$);

-- A cada 5 minutos: watchdog (verifica conexões, reconecta, recupera mensagens perdidas e drena a fila)
select cron.schedule('radar-watchdog', '*/5 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'radar_app_url') || '/api/cron/process-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'radar_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);
