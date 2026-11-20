-- 19: destrava a fila do copiador (20/11).
-- A fila acumulou 900+ envios antigos e a função que escolhe o próximo envio passou a estourar
-- o tempo do banco ("Reserva de publicação falhou"), parando envios e a leitura de mensagens novas.
-- 1) Ofertas paradas há mais de 3 h viram 'cancelado' (não apaga nada; ficam no histórico).
-- 2) A função passa a fazer essa limpeza sozinha a cada ciclo.
-- 3) Índices para as contagens do dia ficarem rápidas.

UPDATE public.publication_jobs SET status='cancelado',
  error_details='Oferta vencida: ficou mais de 3 h na fila sem envio.', updated_at=now()
  WHERE runtime_payload IS NOT NULL AND status='agendado' AND scheduled_for < now()-interval '3 hours';

CREATE INDEX IF NOT EXISTS idx_publication_jobs_user_sent ON public.publication_jobs(user_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_publication_jobs_offer_key ON public.publication_jobs
  (user_id, (coalesce(runtime_inbox_id::text, incoming_message_id::text, id::text)));
CREATE INDEX IF NOT EXISTS idx_publication_jobs_conn_status ON public.publication_jobs(connection_id, status);

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
  -- Oferta parada na fila há mais de 3 h já venceu (o copiador também descarta mensagens com mais de 2 h).
  -- Sem isso a fila cresce sem parar e a escolha da próxima oferta passa do tempo limite do banco.
  UPDATE publication_jobs SET status='cancelado',
    error_details='Oferta vencida: ficou mais de 3 h na fila sem envio.',updated_at=now()
    WHERE runtime_payload IS NOT NULL AND status='agendado' AND scheduled_for < now()-interval '3 hours';
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
