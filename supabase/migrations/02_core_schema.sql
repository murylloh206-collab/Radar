-- ==============================================================================
-- ETAPA 2: EXTENSÕES E SCHEMA CORE DO RADAR DE OFERTAS
-- Ordem de dependências estritamente validada. 100% aditivo (IF NOT EXISTS).
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Configurações gerais
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

-- Conexão WhatsApp (Evolution API)
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

-- Modelos de Mensagem (Templates)
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

-- Regras de Qualidade por Loja
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

-- Ganchos e Cupons
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

-- Grupos e Copiador
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
