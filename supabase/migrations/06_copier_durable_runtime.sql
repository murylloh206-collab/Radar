BEGIN;
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  instance_name text NOT NULL, label text NOT NULL, status text NOT NULL DEFAULT 'disconnected',
  phone_number text, profile_name text, profile_pic_url text, owner_jid text,
  last_ping_at timestamptz, last_verification_status text, last_verification_error text,
  webhook_url text, webhook_secret text, is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, instance_name)
);
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS runtime_webhook_version integer NOT NULL DEFAULT 0;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS runtime_webhook_error text;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS runtime_webhook_next_at timestamptz NOT NULL DEFAULT now();
-- Import only columns present in the legacy schema, preserving the registered UUID.
INSERT INTO public.whatsapp_connections(id,user_id,instance_name,label,status,phone_number,profile_name,
  webhook_secret,last_ping_at,is_default,created_at,updated_at)
SELECT id,user_id,instance_name,coalesce(profile_name,'Meu WhatsApp'),status,phone_number,profile_name,
  webhook_secret,last_ping_at,true,created_at,updated_at FROM public.integrations_whatsapp
ON CONFLICT DO NOTHING;
ALTER TABLE public.copy_sources ADD COLUMN IF NOT EXISTS connection_id uuid;
ALTER TABLE public.copy_sources ADD COLUMN IF NOT EXISTS configuration jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS connection_id uuid;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS runtime_owner_jid text;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS runtime_group jsonb;
DO $$ DECLARE constraint_name text; BEGIN
  FOR constraint_name IN SELECT c.conname FROM pg_constraint c
    WHERE c.conrelid='public.whatsapp_groups'::regclass AND c.contype='u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM unnest(c.conkey) k
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k) = ARRAY['group_jid','user_id']::text[]
  LOOP EXECUTE format('ALTER TABLE public.whatsapp_groups DROP CONSTRAINT %I',constraint_name); END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_groups_per_connection ON public.whatsapp_groups(user_id,connection_id,group_jid);
ALTER TABLE public.publication_jobs ADD COLUMN IF NOT EXISTS connection_id uuid;
ALTER TABLE public.publication_jobs ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE public.publication_jobs ADD COLUMN IF NOT EXISTS runtime_payload jsonb;
ALTER TABLE public.publication_jobs ADD COLUMN IF NOT EXISTS runtime_inbox_id uuid;
ALTER TABLE public.publication_jobs ADD COLUMN IF NOT EXISTS runtime_token uuid;
ALTER TABLE public.publication_jobs ADD COLUMN IF NOT EXISTS runtime_delivery text;
ALTER TABLE public.publication_jobs ADD COLUMN IF NOT EXISTS runtime_verified_url text;

CREATE TABLE IF NOT EXISTS public.copier_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, connection_id uuid NOT NULL,
  message_id text NOT NULL, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','processing','processed','failed')),
  attempts integer NOT NULL DEFAULT 0, lease_token uuid, lease_until timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(), received_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz, result jsonb, last_error text,
  UNIQUE(user_id, connection_id, message_id)
);
CREATE INDEX IF NOT EXISTS copier_inbox_pending ON public.copier_inbox(status, available_at);
CREATE UNIQUE INDEX IF NOT EXISTS copier_job_event_target ON public.publication_jobs(runtime_inbox_id, target_jid)
  WHERE runtime_inbox_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS copier_jobs_due ON public.publication_jobs(status,scheduled_for,connection_id)
  WHERE runtime_payload IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.copier_worker_heartbeat (
  id text PRIMARY KEY, last_seen_at timestamptz NOT NULL DEFAULT now(), last_error text
);
CREATE INDEX IF NOT EXISTS copier_latest_heartbeat ON public.copier_worker_heartbeat(last_seen_at DESC);
ALTER TABLE public.copier_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copier_worker_heartbeat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.copier_inbox, public.copier_worker_heartbeat FROM anon, authenticated;
GRANT ALL ON public.copier_inbox, public.copier_worker_heartbeat TO service_role;

CREATE OR REPLACE FUNCTION public.copier_claim_inbox()
RETURNS SETOF public.copier_inbox LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE selected_id uuid;
BEGIN
  UPDATE copier_inbox SET status='failed', last_error='Limite de processamento atingido'
    WHERE status='processing' AND lease_until < now() AND attempts >= 3;
  SELECT id INTO selected_id FROM copier_inbox
    WHERE attempts < 3 AND available_at <= now()
      AND (status='pending' OR (status='processing' AND lease_until < now()))
    ORDER BY received_at FOR UPDATE SKIP LOCKED LIMIT 1;
  RETURN QUERY UPDATE copier_inbox SET status='processing', attempts=attempts+1,
    lease_token=gen_random_uuid(), lease_until=now()+interval '5 minutes'
    WHERE id=selected_id RETURNING *;
END $$;

CREATE OR REPLACE FUNCTION public.copier_complete_inbox(p_id uuid, p_token uuid, p_result jsonb, p_jobs jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE entry copier_inbox; job jsonb; inserted integer := 0; affected integer;
BEGIN
  SELECT * INTO entry FROM copier_inbox WHERE id=p_id AND lease_token=p_token
    AND status='processing' AND lease_until > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  FOR job IN SELECT * FROM jsonb_array_elements(p_jobs) LOOP
    IF job->>'userId' <> entry.user_id::text OR job->>'connectionId' <> entry.connection_id::text
      THEN RAISE EXCEPTION 'Job ownership mismatch'; END IF;
    IF NOT EXISTS (SELECT 1 FROM copy_sources s WHERE s.id=(job->>'sourceId')::uuid
       AND s.user_id=entry.user_id AND s.connection_id=entry.connection_id AND s.is_active)
      THEN CONTINUE; END IF;
    INSERT INTO publication_jobs(id,user_id,connection_id,origin_type,source_id,target_jid,target_name,
      message_text,media_url,media_type,affiliate_url,status,scheduled_for,attempts,max_attempts,
      error_details,runtime_payload,runtime_inbox_id,runtime_verified_url,created_at,updated_at)
    VALUES((job->>'id')::uuid,entry.user_id,entry.connection_id,'copiador',(job->>'sourceId')::uuid,
      job->>'targetJid',job->>'targetName',job->>'messageText',job->>'mediaUrl',job->>'mediaType',
      job->>'affiliateUrl',job->>'status',(job->>'scheduledFor')::timestamptz,0,3,job->>'errorDetails',
      job,entry.id,CASE WHEN job->>'status'='agendado' THEN job->>'affiliateUrl' ELSE NULL END,now(),now())
    ON CONFLICT (runtime_inbox_id,target_jid) WHERE runtime_inbox_id IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS affected = ROW_COUNT;
    inserted := inserted + affected;
  END LOOP;
  IF inserted=0 AND jsonb_array_length(p_jobs)>0 THEN
    p_result := p_result || jsonb_build_object('reason','Nenhum envio criado: a regra mudou, foi pausada ou o evento já foi processado.');
  END IF;
  p_result := p_result || jsonb_build_object('persistedJobs',inserted);
  UPDATE copier_inbox SET status='processed',completed_at=now(),result=p_result,payload='{}',lease_until=NULL
    WHERE id=p_id;
  RETURN true;
END $$;

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
      AND (SELECT count(*) FROM publication_jobs daily WHERE daily.user_id=j.user_id
        AND (daily.sent_at >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
          OR daily.status='enviando')) < u.max_daily_messages
    ORDER BY j.scheduled_for FOR UPDATE OF j,c,u SKIP LOCKED LIMIT 1;
  RETURN QUERY UPDATE publication_jobs SET status='enviando',runtime_token=gen_random_uuid(),
    locked_at=now(),runtime_delivery='reserved',attempts=attempts+1,updated_at=now()
    WHERE id=selected_id RETURNING *;
END $$;

CREATE OR REPLACE FUNCTION public.copier_begin_send(p_id uuid,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE publication_jobs j SET runtime_delivery='sending' WHERE j.id=p_id AND j.runtime_token=p_token
    AND j.status='enviando' AND j.runtime_delivery='reserved' AND j.locked_at>now()-interval '5 minutes'
    AND EXISTS(SELECT 1 FROM whatsapp_connections c JOIN copy_sources s ON s.connection_id=c.id
      WHERE c.id=j.connection_id AND c.user_id=j.user_id AND s.id=j.source_id AND s.user_id=j.user_id AND s.is_active);
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.copier_cache_photo(p_user uuid,p_connection uuid,p_owner text,p_group text,p_picture text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM whatsapp_connections WHERE id=p_connection AND user_id=p_user AND owner_jid=p_owner) THEN RETURN false; END IF;
  IF p_group IS NULL THEN
    UPDATE whatsapp_connections SET profile_pic_url=p_picture WHERE id=p_connection AND user_id=p_user;
  ELSE
    UPDATE whatsapp_groups SET runtime_group=jsonb_set(coalesce(runtime_group,'{}'),'{pictureUrl}',to_jsonb(p_picture))
      WHERE user_id=p_user AND connection_id=p_connection AND runtime_owner_jid=p_owner AND group_jid=p_group;
  END IF;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.copier_claim_inbox(),public.copier_complete_inbox(uuid,uuid,jsonb,jsonb),
  public.copier_claim_job(),public.copier_begin_send(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.copier_cache_photo(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.copier_claim_inbox(),public.copier_complete_inbox(uuid,uuid,jsonb,jsonb),
  public.copier_claim_job(),public.copier_begin_send(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.copier_cache_photo(uuid,uuid,text,text,text) TO service_role;
COMMIT;
