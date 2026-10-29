-- ==============================================================================
-- RADAR DE OFERTAS — MIGRAÇÃO VERSIONADA INICIAL (20261026000000)
-- Identidade: Fundo #061225 | Cartões #0D1B31 | Bordas #18334D | Ciano #1CCAF2 | Azul #0879DF
-- Lojas Suportadas: Shopee, Mercado Livre, Netshoes, Amazon, Magalu
-- ==============================================================================

-- 1. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Configurações gerais de usuário
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

-- 3. Integração WhatsApp Evolution API
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

-- 4. Credenciais de Afiliados por Loja
CREATE TABLE IF NOT EXISTS public.store_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL, -- 'shopee', 'mercadolivre', 'netshoes', 'amazon', 'magalu'
    app_id TEXT,
    app_secret TEXT,
    affiliate_tag TEXT,
    user_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    extra_params JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_store_user UNIQUE(user_id, store_name)
);

-- 5. Regras de Qualidade por Loja
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

-- 6. Modelos de Mensagem (Templates)
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

-- 7. Ganchos de Engajamento
CREATE TABLE IF NOT EXISTS public.engagement_hooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    hook_text TEXT NOT NULL,
    category TEXT DEFAULT 'geral',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Cupons de Loja
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

-- 9. Grupos WhatsApp
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

-- 10. Modo Copiador: Origens e Destinos
CREATE TABLE IF NOT EXISTS public.copy_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    group_jid TEXT NOT NULL,
    name TEXT NOT NULL,
    operation_mode TEXT NOT NULL DEFAULT 'revisao_manual',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    allowed_stores TEXT[] DEFAULT ARRAY['shopee', 'mercadolivre', 'netshoes']::TEXT[],
    strip_third_party_links BOOLEAN NOT NULL DEFAULT TRUE,
    strip_external_tags BOOLEAN NOT NULL DEFAULT TRUE,
    custom_delay_seconds INT NOT NULL DEFAULT 60,
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

-- 11. Mensagens Recebidas com Idempotência
CREATE TABLE IF NOT EXISTS public.incoming_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    message_id TEXT NOT NULL,
    instance_name TEXT NOT NULL,
    remote_jid TEXT NOT NULL,
    sender_jid TEXT,
    sender_name TEXT,
    raw_text TEXT NOT NULL,
    extracted_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
    clean_text TEXT,
    extracted_store TEXT,
    resolved_destination_url TEXT,
    affiliate_url TEXT,
    status TEXT NOT NULL DEFAULT 'recebida',
    discard_reason TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_incoming_instance_msg UNIQUE(instance_name, message_id)
);

-- 12. Catálogo Real de Produtos
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

-- 13. Avaliações de Qualidade Auditáveis
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

-- 14. Deduplicação de Ofertas
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

-- 15. Jobs de Publicação
CREATE TABLE IF NOT EXISTS public.publication_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    origin_type TEXT NOT NULL DEFAULT 'copiador',
    source_id UUID REFERENCES public.copy_sources(id) ON DELETE SET NULL,
    incoming_message_id UUID REFERENCES public.incoming_messages(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products_catalog(id) ON DELETE SET NULL,
    evaluation_id UUID REFERENCES public.offer_evaluations(id) ON DELETE SET NULL,
    target_jid TEXT NOT NULL,
    target_name TEXT,
    message_text TEXT NOT NULL,
    media_url TEXT,
    media_type TEXT DEFAULT 'image',
    affiliate_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'rascunho',
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    error_details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Campanhas de Automação: Fila, Lista e Curador
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
    diversity_mode TEXT NOT NULL DEFAULT 'moderate',
    repeat_after_days INT NOT NULL DEFAULT 15,
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

-- 17. HABILITAR ROW LEVEL SECURITY (RLS) EM TODAS AS TABELAS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations_whatsapp ENABLE ROW LEVEL SECURITY;
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

-- 18. POLÍTICAS RLS (Garantir que cada usuário acesse apenas seus dados ou service_role)
DO $$ 
DECLARE
    t text;
    tables text[] := ARRAY[
        'user_settings', 'integrations_whatsapp', 'store_credentials', 'quality_rules',
        'message_templates', 'engagement_hooks', 'store_coupons', 'whatsapp_groups',
        'copy_sources', 'incoming_messages', 'products_catalog',
        'offer_evaluations', 'offer_deduplication', 'publication_jobs',
        'queue_campaigns', 'list_campaigns', 'curator_plans'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS p_user_isolation_%s ON public.%I', t, t);
        EXECUTE format('CREATE POLICY p_user_isolation_%s ON public.%I FOR ALL USING (auth.uid() = user_id OR auth.role() = ''service_role'')', t, t);
    END LOOP;
END $$;

-- Política para copy_destinations (via source_id)
DROP POLICY IF EXISTS p_dest_isolation ON public.copy_destinations;
CREATE POLICY p_dest_isolation ON public.copy_destinations FOR ALL USING (
    EXISTS (SELECT 1 FROM public.copy_sources WHERE copy_sources.id = copy_destinations.source_id AND (copy_sources.user_id = auth.uid() OR auth.role() = 'service_role'))
);

-- 19. ÍNDICES DE DESEMPENHO
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON public.publication_jobs(status, scheduled_for) WHERE status IN ('agendado', 'aguardando_aprovacao');
CREATE INDEX IF NOT EXISTS idx_incoming_instance ON public.incoming_messages(instance_name, message_id);
CREATE INDEX IF NOT EXISTS idx_catalog_ext ON public.products_catalog(user_id, store_name, external_id);
CREATE INDEX IF NOT EXISTS idx_dedup_hash ON public.offer_deduplication(canonical_url_hash, target_jid);
