-- ==============================================================================
-- ETAPA 5: MULTI-WHATSAPP SAAS, CONEXÕES ISOLADAS E ATOMIC JOB RESERVATION
-- Permite N instâncias de WhatsApp por usuário, grupos por conexão e filas atômicas.
-- ==============================================================================

-- 1. Criar tabela de conexões múltiplas do WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    instance_name TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'disconnected',
    phone_number TEXT,
    profile_name TEXT,
    profile_pic_url TEXT,
    owner_jid TEXT,
    last_ping_at TIMESTAMPTZ,
    last_verification_status TEXT,
    last_verification_error TEXT,
    webhook_url TEXT,
    webhook_secret TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_whatsapp_connections_user_instance UNIQUE (user_id, instance_name)
);

-- 2. Adicionar colunas aditivas nas tabelas relacionadas
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE;
ALTER TABLE public.copy_sources ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;
ALTER TABLE public.incoming_messages ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;
ALTER TABLE public.publication_jobs ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;
ALTER TABLE public.publication_jobs ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- 3. Índices para performance em produção e isolamento
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_user_id ON public.whatsapp_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_connection_id ON public.whatsapp_groups(connection_id);
CREATE INDEX IF NOT EXISTS idx_copy_sources_connection_id ON public.copy_sources(connection_id);
CREATE INDEX IF NOT EXISTS idx_incoming_messages_connection_id ON public.incoming_messages(connection_id);
CREATE INDEX IF NOT EXISTS idx_publication_jobs_connection_id ON public.publication_jobs(connection_id);
CREATE INDEX IF NOT EXISTS idx_publication_jobs_locked_at ON public.publication_jobs(locked_at);

-- 4. Habilitar RLS em whatsapp_connections
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_user_isolation_whatsapp_connections ON public.whatsapp_connections;
CREATE POLICY p_user_isolation_whatsapp_connections ON public.whatsapp_connections
    FOR ALL
    USING (auth.uid() = user_id OR auth.role() = 'service_role')
    WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

-- 5. Migração transparente de dados legados de integrations_whatsapp (se existirem)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'integrations_whatsapp') THEN
        INSERT INTO public.whatsapp_connections (
            user_id,
            instance_name,
            label,
            status,
            phone_number,
            profile_name,
            profile_pic_url,
            owner_jid,
            last_ping_at,
            last_verification_status,
            last_verification_error,
            webhook_url,
            webhook_secret,
            is_default,
            created_at,
            updated_at
        )
        SELECT
            user_id,
            COALESCE(instance_name, 'radar_default_' || substr(user_id::text, 1, 8)),
            'WhatsApp Principal',
            COALESCE(status, 'disconnected'),
            phone_number,
            profile_name,
            profile_pic_url,
            owner_jid,
            last_ping_at,
            last_verification_status,
            last_verification_error,
            webhook_url,
            webhook_secret,
            true,
            COALESCE(created_at, now()),
            COALESCE(updated_at, now())
        FROM public.integrations_whatsapp iw
        ON CONFLICT (user_id, instance_name) DO UPDATE
        SET
            phone_number = EXCLUDED.phone_number,
            profile_name = EXCLUDED.profile_name,
            status = EXCLUDED.status,
            owner_jid = EXCLUDED.owner_jid,
            last_ping_at = EXCLUDED.last_ping_at;
    END IF;
END $$;

