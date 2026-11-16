-- Limite diário conta OFERTAS (posts), não mensagens: as cópias da mesma oferta para vários grupos contam 1.
-- Oferta = coalesce(runtime_inbox_id, incoming_message_id, id). Uma oferta que já começou a sair hoje
-- termina em todos os grupos mesmo que o limite seja atingido no meio.
CREATE OR REPLACE FUNCTION public.copier_claim_job()
RETURNS SETOF public.publication_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE selected_id uuid;
BEGIN
  -- An expired sending lease is ambiguous: never resend it automatically.
  UPDATE publication_jobs SET status='falha',runtime_delivery='uncertain',
    error_details='Resultado do envio desconhecido após interrupção. Reconciliar antes de repetir.',updated_at=now()
    WHERE runtime_payload IS NOT NULL AND status='enviando' AND locked_at < now()-interval '5 minutes';
  UPDATE publication_jobs j SET status='falha',error_details='Conexão ou regra removida/inativa',updated_at=now()
    WHERE j.runtime_payload IS NOT NULL AND j.status='agendado' AND NOT EXISTS
      (SELECT 1 FROM whatsapp_connections c JOIN copy_sources s ON s.connection_id=c.id
       WHERE c.id=j.connection_id AND c.user_id=j.user_id AND s.id=j.source_id AND s.user_id=j.user_id AND s.is_active);
  SELECT j.id INTO selected_id FROM publication_jobs j
    JOIN whatsapp_connections c ON c.id=j.connection_id AND c.user_id=j.user_id
    JOIN copy_sources s ON s.id=j.source_id AND s.user_id=j.user_id AND s.connection_id=c.id
    JOIN user_settings u ON u.user_id=j.user_id
    WHERE j.runtime_payload IS NOT NULL AND j.status='agendado' AND s.is_active
      AND j.scheduled_for<=now() AND j.attempts<j.max_attempts
      AND NOT EXISTS (SELECT 1 FROM publication_jobs busy WHERE busy.connection_id=c.id AND busy.status='enviando')
      AND NOT EXISTS (SELECT 1 FROM publication_jobs recent WHERE recent.connection_id=c.id
        AND recent.sent_at>now()-make_interval(secs=>greatest(coalesce(u.min_send_interval_seconds,60),1)))
      AND (
        -- oferta já iniciada hoje: completa os grupos que faltam
        EXISTS (SELECT 1 FROM publication_jobs same WHERE same.user_id=j.user_id
          AND coalesce(same.runtime_inbox_id::text, same.incoming_message_id::text, same.id::text)
            = coalesce(j.runtime_inbox_id::text, j.incoming_message_id::text, j.id::text)
          AND (same.status='enviando' OR same.sent_at >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))
        OR
        (SELECT count(DISTINCT coalesce(daily.runtime_inbox_id::text, daily.incoming_message_id::text, daily.id::text))
          FROM publication_jobs daily WHERE daily.user_id=j.user_id
          AND (daily.sent_at >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
            OR daily.status='enviando')) < u.max_daily_messages
      )
    ORDER BY j.scheduled_for FOR UPDATE OF j,c,u SKIP LOCKED LIMIT 1;
  RETURN QUERY UPDATE publication_jobs SET status='enviando',runtime_token=gen_random_uuid(),
    locked_at=now(),runtime_delivery='reserved',attempts=attempts+1,updated_at=now()
    WHERE id=selected_id RETURNING *;
END $$;
