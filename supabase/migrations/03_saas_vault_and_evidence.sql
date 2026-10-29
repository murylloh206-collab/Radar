-- ==============================================================================
-- ETAPA 3: COFRE DE CREDENCIAIS SAAS, AUDITORIA E REGISTROS DE EVIDÊNCIA
-- Tabelas multi-tenant criptografadas em repouso (AES-256-GCM)
-- ==============================================================================

-- 1. Cofre Criptografado Multi-tenant
CREATE TABLE IF NOT EXISTS public.store_credentials_vault (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL,
    app_id TEXT,
    affiliate_tag TEXT,
    encrypted_app_secret TEXT,
    encrypted_user_token TEXT,
    encrypted_session_data TEXT,
    auth_type TEXT NOT NULL DEFAULT 'credentials',
    connection_status TEXT NOT NULL DEFAULT 'desconectado',
    tag_identified TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_vault_user_store UNIQUE(user_id, store_name)
);

-- 2. Tabela de Auditoria de Conexões e Operações Críticas
CREATE TABLE IF NOT EXISTS public.connection_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL,
    action TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Registros de Evidência Auditável por Link Gerado
CREATE TABLE IF NOT EXISTS public.link_evidence_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL,
    product_id TEXT,
    product_title TEXT,
    original_url TEXT NOT NULL,
    clean_url TEXT NOT NULL,
    final_affiliate_url TEXT NOT NULL,
    confirmation_source TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'nao_verificado',
    is_auto_dispatch_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    manual_approval_user_id UUID,
    manual_approval_url TEXT,
    manual_approval_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabela de Metadados Públicos de Lojas (compatibilidade aditiva)
CREATE TABLE IF NOT EXISTS public.store_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL,
    app_id TEXT,
    affiliate_tag TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_store_user UNIQUE(user_id, store_name)
);
