-- ==============================================================================
-- RADAR DE OFERTAS: TABELAS DO COFRE DE CREDENCIAIS E INTEGRAÇÃO META
-- Execute este script no SQL Editor do Supabase (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Habilitar extensões necessárias para UUID e Criptografia
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabela: store_credentials_vault (Cofre Seguro de Credenciais Multi-tenant)
CREATE TABLE IF NOT EXISTS public.store_credentials_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL,
    app_id TEXT,
    affiliate_tag TEXT,
    encrypted_app_secret TEXT,
    encrypted_user_token TEXT,
    encrypted_session_data TEXT,
    auth_type TEXT NOT NULL DEFAULT 'credentials',
    connection_status TEXT NOT NULL DEFAULT 'conectado',
    tag_identified TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_verified_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_vault_user_store UNIQUE(user_id, store_name)
);

-- Garantir que as colunas essenciais existem caso a tabela já tenha sido criada antes
ALTER TABLE public.store_credentials_vault ADD COLUMN IF NOT EXISTS auth_type TEXT NOT NULL DEFAULT 'credentials';
ALTER TABLE public.store_credentials_vault ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'conectado';
ALTER TABLE public.store_credentials_vault ADD COLUMN IF NOT EXISTS tag_identified TEXT;
ALTER TABLE public.store_credentials_vault ADD COLUMN IF NOT EXISTS encrypted_session_data TEXT;
ALTER TABLE public.store_credentials_vault ADD COLUMN IF NOT EXISTS encrypted_user_token TEXT;
ALTER TABLE public.store_credentials_vault ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.store_credentials_vault ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ DEFAULT NOW();

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_vault_user_store ON public.store_credentials_vault(user_id, store_name);

-- 3. Tabela: story_publications (Histórico de publicações de Stories)
CREATE TABLE IF NOT EXISTS public.story_publications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    job_id UUID REFERENCES public.publication_jobs(id) ON DELETE SET NULL,
    story_image_url TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'instagram',
    meta_media_id TEXT,
    meta_creation_id TEXT,
    call_to_action TEXT,
    status TEXT NOT NULL DEFAULT 'published',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_story_publications_user_id ON public.story_publications(user_id);
CREATE INDEX IF NOT EXISTS idx_story_publications_job_id ON public.story_publications(job_id);

-- 4. Permissões de Segurança (Row Level Security - RLS)
ALTER TABLE public.store_credentials_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_publications ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso para store_credentials_vault
DO $$
BEGIN
    DROP POLICY IF EXISTS "p_vault_access" ON public.store_credentials_vault;
    DROP POLICY IF EXISTS "p_vault_user_isolation" ON public.store_credentials_vault;
    
    CREATE POLICY "p_vault_access"
        ON public.store_credentials_vault
        FOR ALL
        USING (
            auth.uid() = user_id 
            OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
            OR auth.role() = 'service_role'
        );
END $$;

-- Políticas de acesso para story_publications
DO $$
BEGIN
    DROP POLICY IF EXISTS "p_story_publications_access" ON public.story_publications;
    
    CREATE POLICY "p_story_publications_access"
        ON public.story_publications
        FOR ALL
        USING (
            auth.uid() = user_id 
            OR user_id = '00000000-0000-0000-0000-000000000001'::uuid
            OR auth.role() = 'service_role'
        );
END $$;

-- 5. Conceder permissões para os papéis de conexão da API
GRANT ALL ON public.store_credentials_vault TO authenticated, service_role, anon;
GRANT ALL ON public.story_publications TO authenticated, service_role, anon;

-- 6. Recarregar o cache do PostgREST imediatamente (evita erro de coluna não encontrada)
NOTIFY pgrst, 'reload schema';

