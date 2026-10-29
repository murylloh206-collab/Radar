-- ==============================================================================
-- RADAR DE OFERTAS — MIGRAÇÃO ADITIVA SAAS
-- Tabelas de Cofre Criptografado, Auditoria e Registros de Evidência de Links
-- ==============================================================================

-- 1. COFRE DE CREDENCIAIS CRIPTOGRAFADAS COM ISOLAMENTO MULTI-TENANT
CREATE TABLE IF NOT EXISTS public.store_credentials_vault (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL, -- 'mercadolivre', 'shopee', 'netshoes', 'amazon', 'magalu'
    app_id TEXT,
    affiliate_tag TEXT,
    encrypted_app_secret TEXT,     -- AES-256-GCM
    encrypted_user_token TEXT,      -- AES-256-GCM
    encrypted_session_data TEXT,    -- AES-256-GCM (sessão da extensão Chrome)
    auth_type TEXT NOT NULL DEFAULT 'credentials', -- 'credentials', 'api_hmac', 'rakuten_token', 'extension_session'
    connection_status TEXT NOT NULL DEFAULT 'desconectado', -- 'conectado', 'desconectado', 'sessao_expirada', 'revisao_manual'
    tag_identified TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_vault_user_store UNIQUE(user_id, store_name)
);

-- Índices para busca rápida isolada por usuário
CREATE INDEX IF NOT EXISTS idx_vault_user_store ON public.store_credentials_vault(user_id, store_name);

-- 2. REGISTROS DE AUDITORIA DE CONEXÕES, RECONEXÕES E REVOGAÇÃO
CREATE TABLE IF NOT EXISTS public.connection_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL,
    action TEXT NOT NULL, -- 'connect', 'reconnect', 'generate_link', 'revoke', 'verify', 'disconnect', 'expire'
    ip_address TEXT,
    user_agent TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_store ON public.connection_audit_logs(user_id, store_name, created_at DESC);

-- 3. REGISTROS DE EVIDÊNCIA POR LINK
CREATE TABLE IF NOT EXISTS public.link_evidence_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL,
    product_id TEXT,
    product_title TEXT,
    original_url TEXT NOT NULL,
    clean_url TEXT NOT NULL,
    final_affiliate_url TEXT NOT NULL,
    confirmation_source TEXT NOT NULL, -- 'shopee_graphql_hmac', 'mercadolivre_extension_session', 'rakuten_deeplink_api', 'manual_review_approved', 'parameter_assembled_unverified'
    verification_status TEXT NOT NULL DEFAULT 'nao_verificado', -- 'verificado', 'nao_verificado', 'rejeitado'
    is_auto_dispatch_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    manual_approval_user_id UUID,
    manual_approval_url TEXT,
    manual_approval_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_user_url ON public.link_evidence_records(user_id, final_affiliate_url);
CREATE INDEX IF NOT EXISTS idx_evidence_user_prod ON public.link_evidence_records(user_id, store_name, product_id);

-- 4. POLÍTICAS DE ROW LEVEL SECURITY (RLS) PARA FUTURO SAAS MULTI-TENANT
ALTER TABLE public.store_credentials_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_evidence_records ENABLE ROW LEVEL SECURITY;

-- Políticas para usuários acessarem apenas seus próprios registros
CREATE POLICY p_vault_user_isolation ON public.store_credentials_vault
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY p_audit_user_isolation ON public.connection_audit_logs
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY p_evidence_user_isolation ON public.link_evidence_records
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
