-- ==============================================================================
-- RADAR DE OFERTAS — SCHEMA COMPLETO DO BANCO DE DADOS (SUPABASE POSTGRES)
-- Identidade: Fundo #061225 | Cartões #0D1B31 | Acentos #1CCAF2, #0879DF
-- ==============================================================================

-- Habilitar extensões úteis
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. CONFIGURAÇÕES GERAIS E PERFIL DO USUÁRIO
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
    watermark_text TEXT DEFAULT '🎯 Radar de Ofertas',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. INTEGRAÇÃO WHATSAPP (EVOLUTION API)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integrations_whatsapp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    instance_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'disconnected', -- 'connected', 'connecting', 'disconnected', 'qrcode'
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
-- 3. CREDENCIAIS DE AFILIADOS POR LOJA
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL, -- 'shopee', 'mercadolivre', 'amazon', 'magalu', etc.
    app_id TEXT,
    app_secret TEXT,
    affiliate_tag TEXT, -- ex: tracking_id, sub_id ou associate tag
    user_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    extra_params JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_store_user UNIQUE(user_id, store_name)
);

-- ------------------------------------------------------------------------------
-- 4. REGRAS DE QUALIDADE POR LOJA
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
    require_social_proof BOOLEAN NOT NULL DEFAULT TRUE, -- Jamais aprovar sem avaliação/vendas
    require_in_stock BOOLEAN NOT NULL DEFAULT TRUE,
    blocked_keywords TEXT[] DEFAULT ARRAY['réplica', 'falso', 'pirata', 'amostra', 'sorteio']::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_quality_user_store UNIQUE(user_id, store_name)
);

-- ------------------------------------------------------------------------------
-- 5. MODELOS DE MENSAGEM (TEMPLATES)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    template_text TEXT NOT NULL, -- {gancho}, {titulo}, {preco_de}, {preco_por}, {desconto}, {cupom}, {link}
    include_image BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. GANCHOS DE ENGAJAMENTO E CUPONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.engagement_hooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    hook_text TEXT NOT NULL,
    category TEXT DEFAULT 'geral',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
-- 7. GRUPOS WHATSAPP DESCOBERTOS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    group_jid TEXT NOT NULL,
    name TEXT NOT NULL,
    participant_count INT DEFAULT 0,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_origin BOOLEAN NOT NULL DEFAULT FALSE,
    is_destination BOOLEAN NOT NULL DEFAULT FALSE,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_group_user_jid UNIQUE(user_id, group_jid)
);

-- ------------------------------------------------------------------------------
-- 8. MODO COPIADOR: ORIGENS E DESTINOS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.copy_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    group_jid TEXT NOT NULL,
    name TEXT NOT NULL,
    operation_mode TEXT NOT NULL DEFAULT 'revisao_manual', -- 'revisao_manual', 'automatico'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    allowed_stores TEXT[] DEFAULT ARRAY['shopee', 'mercadolivre', 'amazon', 'magalu']::TEXT[],
    strip_third_party_links BOOLEAN NOT NULL DEFAULT TRUE,
    strip_external_tags BOOLEAN NOT NULL DEFAULT TRUE,
    custom_delay_seconds INT NOT NULL DEFAULT 120,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_source_user_jid UNIQUE(user_id, group_jid)
);

CREATE TABLE IF NOT EXISTS public.copy_destinations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES public.copy_sources(id) ON DELETE CASCADE,
    group_jid TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_dest_source_jid UNIQUE(source_id, group_jid)
);

-- ------------------------------------------------------------------------------
-- 9. MENSAGENS RECEBIDAS VIA WEBHOOK (COM IDEMPOTÊNCIA)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incoming_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    message_id TEXT NOT NULL, -- ID original do WhatsApp/Evolution
    instance_name TEXT NOT NULL,
    remote_jid TEXT NOT NULL, -- JID do grupo de origem
    sender_jid TEXT,
    sender_name TEXT,
    raw_text TEXT NOT NULL,
    extracted_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
    clean_text TEXT,
    extracted_store TEXT,
    resolved_destination_url TEXT,
    affiliate_url TEXT,
    status TEXT NOT NULL DEFAULT 'recebida', -- 'recebida', 'processada', 'descartada', 'erro'
    discard_reason TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_incoming_instance_msg UNIQUE(instance_name, message_id)
);

-- ------------------------------------------------------------------------------
-- 10. CATÁLOGO DE PRODUTOS GARIMPADOS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL,
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    original_price NUMERIC(10, 2),
    current_price NUMERIC(10, 2) NOT NULL,
    discount_pct NUMERIC(5, 2) DEFAULT 0,
    rating NUMERIC(3, 2),
    reviews_count INT DEFAULT 0,
    sales_count INT DEFAULT 0,
    commission_rate NUMERIC(5, 2),
    estimated_commission NUMERIC(10, 2),
    image_url TEXT,
    product_url TEXT NOT NULL,
    affiliate_url TEXT NOT NULL,
    category TEXT,
    in_stock BOOLEAN NOT NULL DEFAULT TRUE,
    last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_catalog_user_ext UNIQUE(user_id, store_name, external_id)
);

-- ------------------------------------------------------------------------------
-- 11. AVALIAÇÕES DE QUALIDADE AUDITÁVEIS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offer_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    incoming_message_id UUID REFERENCES public.incoming_messages(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products_catalog(id) ON DELETE SET NULL,
    score INT NOT NULL DEFAULT 0,
    decision TEXT NOT NULL, -- 'aprovado', 'rejeitado', 'pendente'
    reason TEXT NOT NULL,
    criteria_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidences JSONB NOT NULL DEFAULT '{}'::jsonb,
    failures TEXT[] DEFAULT ARRAY[]::TEXT[],
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 12. DEDUPLICAÇÃO DE OFERTAS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offer_deduplication (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    canonical_url_hash TEXT NOT NULL,
    store_name TEXT NOT NULL,
    external_id TEXT,
    target_jid TEXT NOT NULL,
    last_published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    times_published INT NOT NULL DEFAULT 1,
    CONSTRAINT uk_dedup_user_hash_dest UNIQUE(user_id, canonical_url_hash, target_jid)
);

-- ------------------------------------------------------------------------------
-- 13. FILA DE PUBLICAÇÃO (JOBS EXECUTADOS PELO WORKER)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.publication_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    origin_type TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'copiador', 'fila', 'lista', 'curador'
    source_id UUID REFERENCES public.copy_sources(id) ON DELETE SET NULL,
    incoming_message_id UUID REFERENCES public.incoming_messages(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products_catalog(id) ON DELETE SET NULL,
    evaluation_id UUID REFERENCES public.offer_evaluations(id) ON DELETE SET NULL,
    target_jid TEXT NOT NULL,
    target_name TEXT,
    message_text TEXT NOT NULL,
    media_url TEXT,
    media_type TEXT DEFAULT 'image', -- 'image', 'none', 'video'
    affiliate_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'rascunho', -- 'rascunho', 'aguardando_aprovacao', 'agendado', 'enviando', 'enviado', 'falha', 'cancelado'
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    error_details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 14. AUTOMAÇÃO: FILA (GARIMPO CONTÍNUO)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.queue_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    store_name TEXT NOT NULL,
    niches TEXT[] DEFAULT ARRAY[]::TEXT[],
    target_jids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    min_price NUMERIC(10, 2),
    max_price NUMERIC(10, 2),
    min_rating NUMERIC(3, 2) DEFAULT 4.5,
    min_reviews INT DEFAULT 10,
    min_sales INT DEFAULT 5,
    min_commission NUMERIC(5, 2) DEFAULT 2.0,
    send_interval_minutes INT NOT NULL DEFAULT 45,
    window_start TIME NOT NULL DEFAULT '08:00:00',
    window_end TIME NOT NULL DEFAULT '22:00:00',
    night_pause BOOLEAN NOT NULL DEFAULT TRUE,
    diversity_mode TEXT NOT NULL DEFAULT 'moderate', -- 'off', 'moderate', 'high'
    repeat_after_days INT NOT NULL DEFAULT 15,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 15. AUTOMAÇÃO: LISTA (CAMPANHAS MANUAIS EM LOTE)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.list_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    target_jids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    interval_minutes INT NOT NULL DEFAULT 30,
    scheduled_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scheduled_end TIMESTAMPTZ,
    items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Lista de URLs ou produtos ordenados
    total_items INT NOT NULL DEFAULT 0,
    sent_items INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ativa', -- 'ativa', 'pausada', 'concluida'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 16. AUTOMAÇÃO: CURADOR INTELIGENTE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curator_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    audience_profile TEXT NOT NULL,
    criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
    selected_stores TEXT[] NOT NULL DEFAULT ARRAY['shopee', 'mercadolivre', 'amazon']::TEXT[],
    target_jids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    daily_offers_limit INT NOT NULL DEFAULT 10,
    schedule_mode TEXT NOT NULL DEFAULT 'ia', -- 'ia', 'fixo'
    timeslots TIME[] DEFAULT ARRAY['09:00:00', '12:00:00', '15:00:00', '18:00:00', '21:00:00']::TIME[],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 17. ANALYTICS DE GRUPOS WHATSAPP
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    group_jid TEXT NOT NULL,
    date DATE NOT NULL,
    member_count INT NOT NULL DEFAULT 0,
    joins_count INT NOT NULL DEFAULT 0,
    leaves_count INT NOT NULL DEFAULT 0,
    messages_count INT NOT NULL DEFAULT 0,
    peak_hour INT DEFAULT 19,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_group_analytics_daily UNIQUE(user_id, group_jid, date)
);

-- ------------------------------------------------------------------------------
-- 18. BIO LINK PÚBLICO
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bio_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT 'Radar de Ofertas',
    bio_text TEXT,
    avatar_url TEXT,
    theme_config JSONB NOT NULL DEFAULT '{"primaryColor": "#1CCAF2", "backgroundColor": "#061225", "cardColor": "#0D1B31"}'::jsonb,
    blocks JSONB NOT NULL DEFAULT '[]'::jsonb, -- links rápidos, ofertas em destaque, grupos VIP
    views_count INT NOT NULL DEFAULT 0,
    clicks_count INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 19. RELATÓRIOS CONSOLIDADOS DE AFILIADOS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL,
    report_date DATE NOT NULL,
    clicks_count INT NOT NULL DEFAULT 0,
    orders_count INT NOT NULL DEFAULT 0,
    sales_volume NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
    estimated_commission NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_report_user_store_date UNIQUE(user_id, store_name, report_date)
);

-- ------------------------------------------------------------------------------
-- 20. ÍNDICES DE PERFORMANCE E PESQUISA
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON public.publication_jobs(status, scheduled_for) WHERE status IN ('agendado', 'aguardando_aprovacao');
CREATE INDEX IF NOT EXISTS idx_incoming_created ON public.incoming_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_store ON public.products_catalog(user_id, store_name);
CREATE INDEX IF NOT EXISTS idx_dedup_hash ON public.offer_deduplication(canonical_url_hash);
CREATE INDEX IF NOT EXISTS idx_analytics_group ON public.group_analytics(user_id, group_jid, date DESC);

-- ------------------------------------------------------------------------------
-- 21. TRIGGER PARA ATUALIZAÇÃO AUTOMÁTICA DE updated_at
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_settings_updated') THEN
        CREATE TRIGGER trg_user_settings_updated BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_integrations_whatsapp_updated') THEN
        CREATE TRIGGER trg_integrations_whatsapp_updated BEFORE UPDATE ON public.integrations_whatsapp FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_copy_sources_updated') THEN
        CREATE TRIGGER trg_copy_sources_updated BEFORE UPDATE ON public.copy_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_publication_jobs_updated') THEN
        CREATE TRIGGER trg_publication_jobs_updated BEFORE UPDATE ON public.publication_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
