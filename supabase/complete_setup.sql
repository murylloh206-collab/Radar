-- ==============================================================================
-- RADAR DE OFERTAS — SCHEMA CONSOLIDADO E IDEMPOTENTE (SUPABASE POSTGRES)
-- Sequência Completa de Inicialização e Migração Aditiva SaaS
-- NENHUM dado existente é apagado (tudo usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- Dependências ordenadas estritamente na sequência correta
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- FASE 1: EXTENSÕES ESSENCIAIS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- FASE 2: CONFIGURAÇÕES E INFRAESTRUTURA BÁSICA
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    user_email TEXT,
    system_name TEXT NOT NULL DEFAULT 'Radar de Ofertas',
    night_pause_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    night_pause_start TIME NOT NULL DEFAULT '22:30:00',
    night_pause_end TIME NOT NULL DEFAULT '07:30:00',
    min_send_interval_seconds INT NOT NULL DEFAULT 60,
    max_daily_messages INT NOT NULL DEFAULT 150,
    watermark_text TEXT DEFAULT '🎯 *Radar de Ofertas* — Os melhores achadinhos',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.integrations_whatsapp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    instance_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'disconnected',
    phone_number TEXT,
    profile_name TEXT,
    battery_level INT,
    qr_code_base64 TEXT,
    webhook_secret TEXT,
    last_ping_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- FASE 3: COFRE DE CREDENCIAIS SAAS CRIPTOGRAFADAS (AES-256-GCM)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_credentials_vault (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL, -- 'mercadolivre', 'shopee', 'netshoes', 'amazon', 'magalu'
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

-- Tabela de compatibilidade para metadados públicos de lojas
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

-- ------------------------------------------------------------------------------
-- FASE 4: REGRAS DE QUALIDADE, TEMPLATES E CUPONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quality_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL,
    min_rating NUMERIC(3, 2) NOT NULL DEFAULT 4.5,
    min_reviews_count INT NOT NULL DEFAULT 10,
    min_sales_count INT NOT NULL DEFAULT 5,
    min_discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 10.0,
    min_commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 1.0,
    require_social_proof BOOLEAN NOT NULL DEFAULT TRUE,
    require_in_stock BOOLEAN NOT NULL DEFAULT TRUE,
    blocked_keywords TEXT[] DEFAULT ARRAY['réplica', 'falso', 'pirata', 'amostra', 'sorteio', 'defeito']::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_quality_user_store UNIQUE(user_id, store_name)
);

CREATE TABLE IF NOT EXISTS public.message_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    template_text TEXT NOT NULL,
    include_image BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.engagement_hooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    hook_text TEXT NOT NULL,
    category TEXT DEFAULT 'geral',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL,
    coupon_code TEXT NOT NULL,
    discount_description TEXT NOT NULL,
    min_purchase_amount NUMERIC(10, 2),
    rules_link TEXT,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- FASE 5: GRUPOS WHATSAPP E COPIADOR DE CANAIS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    group_jid TEXT NOT NULL,
    name TEXT NOT NULL,
    participant_count INT DEFAULT 0,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    can_post BOOLEAN NOT NULL DEFAULT FALSE,
    permission_status TEXT NOT NULL DEFAULT 'unverified',
    is_origin BOOLEAN NOT NULL DEFAULT FALSE,
    is_destination BOOLEAN NOT NULL DEFAULT FALSE,
    is_test_group BOOLEAN NOT NULL DEFAULT FALSE,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_group_user UNIQUE(user_id, group_jid)
);

CREATE TABLE IF NOT EXISTS public.copy_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    source_jid TEXT NOT NULL,
    source_name TEXT NOT NULL,
    template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
    min_discount_pct NUMERIC(5, 2) DEFAULT 10.0,
    auto_approve BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_source_user UNIQUE(user_id, source_jid)
);

CREATE TABLE IF NOT EXISTS public.copy_destinations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES public.copy_sources(id) ON DELETE CASCADE,
    target_jid TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.incoming_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    instance_name TEXT NOT NULL,
    message_id TEXT NOT NULL,
    sender_jid TEXT NOT NULL,
    source_group_jid TEXT,
    content_text TEXT,
    media_type TEXT DEFAULT 'none',
    media_url TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'received',
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- FASE 6: CATÁLOGO, OFERTAS E FILA DE PUBLICAÇÃO
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL,
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    current_price NUMERIC(10, 2) NOT NULL,
    original_price NUMERIC(10, 2),
    discount_pct NUMERIC(5, 2),
    affiliate_url TEXT NOT NULL,
    image_url TEXT,
    rating NUMERIC(3, 2),
    reviews_count INT,
    sales_count INT,
    in_stock BOOLEAN NOT NULL DEFAULT TRUE,
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_catalog_prod UNIQUE(user_id, store_name, external_id)
);

CREATE TABLE IF NOT EXISTS public.offer_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    product_id UUID REFERENCES public.products_catalog(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL,
    score NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    rejection_reason TEXT,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.offer_deduplication (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    canonical_url_hash TEXT NOT NULL,
    target_jid TEXT NOT NULL,
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.publication_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    origin_type TEXT NOT NULL,
    source_id UUID,
    incoming_message_id UUID REFERENCES public.incoming_messages(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products_catalog(id) ON DELETE SET NULL,
    evaluation_id UUID REFERENCES public.offer_evaluations(id) ON DELETE SET NULL,
    target_jid TEXT NOT NULL,
    target_name TEXT,
    message_text TEXT NOT NULL,
    media_url TEXT,
    media_type TEXT NOT NULL DEFAULT 'none',
    original_url TEXT,
    clean_url TEXT,
    affiliate_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'agendado',
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    error_details TEXT,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- FASE 7: CAMPANHAS DE FILA, LISTAS E CURADORIA
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.queue_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    store_name TEXT NOT NULL,
    niches TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    target_jids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    min_price NUMERIC(10, 2),
    max_price NUMERIC(10, 2),
    min_rating NUMERIC(3, 2) DEFAULT 4.5,
    min_reviews INT DEFAULT 10,
    min_sales INT DEFAULT 5,
    min_commission NUMERIC(5, 2) DEFAULT 1.0,
    send_interval_minutes INT NOT NULL DEFAULT 60,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.list_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    target_jids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    interval_minutes INT NOT NULL DEFAULT 30,
    scheduled_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scheduled_end TIMESTAMPTZ,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_items INT NOT NULL DEFAULT 0,
    sent_items INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ativa',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.curator_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    audience_profile TEXT NOT NULL,
    criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
    selected_stores TEXT[] NOT NULL DEFAULT ARRAY['shopee', 'mercadolivre', 'netshoes']::TEXT[],
    target_jids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    daily_offers_limit INT NOT NULL DEFAULT 10,
    schedule_mode TEXT NOT NULL DEFAULT 'ia',
    timeslots TIME[] DEFAULT ARRAY['09:00:00', '12:00:00', '15:00:00', '18:00:00', '21:00:00']::TIME[],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- FASE 8: HABILITAR ROW LEVEL SECURITY (RLS) EM TODAS AS TABELAS
-- ------------------------------------------------------------------------------
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_credentials_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_hooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incoming_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_deduplication ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_plans ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- FASE 9: POLÍTICAS RLS IDEMPOTENTES (ISOLAMENTO MULTI-TENANT POR AUTH.UID)
-- ------------------------------------------------------------------------------
DO $$ 
DECLARE
    t text;
    tables text[] := ARRAY[
        'user_settings', 'integrations_whatsapp', 'store_credentials_vault',
        'connection_audit_logs', 'link_evidence_records', 'store_credentials',
        'quality_rules', 'message_templates', 'engagement_hooks', 'store_coupons',
        'whatsapp_groups', 'copy_sources', 'incoming_messages', 'products_catalog',
        'offer_evaluations', 'offer_deduplication', 'publication_jobs',
        'queue_campaigns', 'list_campaigns', 'curator_plans'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS p_user_isolation_%s ON public.%I', t, t);
        EXECUTE format(
            'CREATE POLICY p_user_isolation_%s ON public.%I FOR ALL USING (auth.uid() = user_id OR auth.role() = ''service_role'') WITH CHECK (auth.uid() = user_id OR auth.role() = ''service_role'')',
            t, t
        );
    END LOOP;
END $$;

-- Política de RLS para copy_destinations (vinculada à posse da source)
DROP POLICY IF EXISTS p_dest_isolation ON public.copy_destinations;
CREATE POLICY p_dest_isolation ON public.copy_destinations FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.copy_sources 
        WHERE copy_sources.id = copy_destinations.source_id 
          AND (copy_sources.user_id = auth.uid() OR auth.role() = 'service_role')
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.copy_sources 
        WHERE copy_sources.id = copy_destinations.source_id 
          AND (copy_sources.user_id = auth.uid() OR auth.role() = 'service_role')
    )
);

-- ------------------------------------------------------------------------------
-- FASE 10: ÍNDICES DE PERFORMANCE E PESQUISA RÁPIDA
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vault_user_store ON public.store_credentials_vault(user_id, store_name);
CREATE INDEX IF NOT EXISTS idx_audit_user_store ON public.connection_audit_logs(user_id, store_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_user_url ON public.link_evidence_records(user_id, final_affiliate_url);
CREATE INDEX IF NOT EXISTS idx_evidence_user_prod ON public.link_evidence_records(user_id, store_name, product_id);
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON public.publication_jobs(status, scheduled_for) WHERE status IN ('agendado', 'aguardando_aprovacao');
CREATE INDEX IF NOT EXISTS idx_incoming_instance ON public.incoming_messages(instance_name, message_id);
CREATE INDEX IF NOT EXISTS idx_catalog_ext ON public.products_catalog(user_id, store_name, external_id);
CREATE INDEX IF NOT EXISTS idx_dedup_hash ON public.offer_deduplication(canonical_url_hash, target_jid);
