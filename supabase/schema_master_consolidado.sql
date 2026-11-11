-- ==============================================================================
-- RADAR DE OFERTAS SaaS — SCHEMA MESTRE CONSOLIDADO & DEFINITIVO (FASES 1 A 5)
-- ==============================================================================
-- Instruções:
-- 1. Abra o painel do seu projeto no Supabase (https://supabase.com/dashboard)
-- 2. Vá em "SQL Editor" no menu lateral esquerdo
-- 3. Clique em "+ New query", cole TODO este script e clique em "Run" (Executar).
-- 
-- Características:
-- • Idempotente: pode ser executado múltiplas vezes sem apagar dados nem dar erro.
-- • Completo: contém todas as tabelas do sistema original + Fases 1, 2, 3, 4 e 5.
-- • Multi-tenant: todas as tabelas possuem user_id e isolamento via Row Level Security (RLS).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PARTE 1: EXTENSÕES ESSENCIAIS DO POSTGRES
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ------------------------------------------------------------------------------
-- PARTE 2: CONFIGURAÇÕES, MARCA E AUTENTICAÇÃO MULTIUSUÁRIO
-- ------------------------------------------------------------------------------

-- Configurações gerais de envio e limites do usuário
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

-- Assinaturas SaaS (Planos Impulse, Plus e Ultimate, testes e indicações)
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    user_id UUID PRIMARY KEY,
    plano TEXT NOT NULL DEFAULT 'plus' CHECK (plano IN ('impulse', 'plus', 'ultimate')),
    ciclo TEXT NOT NULL DEFAULT 'mensal' CHECK (ciclo IN ('mensal', 'anual')),
    status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
    expira_em TIMESTAMPTZ,
    trial_ate TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    referral_code TEXT UNIQUE,
    referred_by TEXT,
    referral_discount_pending BOOLEAN NOT NULL DEFAULT false,
    referrals_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Identidade Visual, Marca d'Água Personalizada e Envio Seguro (Fase 2)
CREATE TABLE IF NOT EXISTS public.brand_settings (
    user_id UUID PRIMARY KEY,
    panel_name TEXT NOT NULL DEFAULT 'Radar de Ofertas',
    panel_logo_url TEXT,
    accent_color TEXT NOT NULL DEFAULT '#1CCAF2',
    watermark_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    watermark_handle TEXT NOT NULL DEFAULT '@radar.ofertas.br1',
    watermark_logo_url TEXT,
    watermark_position TEXT NOT NULL DEFAULT 'bottom-right' CHECK (watermark_position IN ('bottom-right', 'bottom-left', 'top-right', 'top-left', 'center', 'custom')),
    watermark_custom_x NUMERIC(5,2) NOT NULL DEFAULT 82.00,
    watermark_custom_y NUMERIC(5,2) NOT NULL DEFAULT 90.00,
    watermark_opacity INT NOT NULL DEFAULT 95 CHECK (watermark_opacity BETWEEN 10 AND 100),
    watermark_scale INT NOT NULL DEFAULT 100 CHECK (watermark_scale BETWEEN 50 AND 160),
    safe_dispatch_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    safe_dispatch_delay_sec INT NOT NULL DEFAULT 45 CHECK (safe_dispatch_delay_sec BETWEEN 5 AND 600),
    safe_dispatch_hourly_limit INT NOT NULL DEFAULT 30 CHECK (safe_dispatch_hourly_limit BETWEEN 1 AND 500),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vitrine Pública / Página de Links (ex: /@slug ou /u/slug)
CREATE TABLE IF NOT EXISTS public.public_storefronts (
    user_id UUID PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT 'Radar de Ofertas',
    bio TEXT NOT NULL DEFAULT 'Ofertas verificadas que valem a pena. Promoções selecionadas todos os dias.',
    logo_url TEXT,
    accent_color TEXT NOT NULL DEFAULT '#1CCAF2',
    btn1_text TEXT NOT NULL DEFAULT 'Entrar no grupo VIP do WhatsApp',
    btn1_url TEXT NOT NULL DEFAULT '',
    btn2_text TEXT NOT NULL DEFAULT 'Canal no Telegram',
    btn2_url TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migração de dados legados do admin local para conta real criada no Supabase (Fase 5)
CREATE TABLE IF NOT EXISTS public.account_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_token TEXT NOT NULL UNIQUE,
    legacy_user_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- PARTE 3: CONEXÕES WHATSAPP E TELEGRAM MULTIUSUÁRIO
-- ------------------------------------------------------------------------------

-- Conexões de instâncias WhatsApp por usuário (Multi-WhatsApp SaaS)
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
    runtime_webhook_version INT NOT NULL DEFAULT 0,
    runtime_webhook_error TEXT,
    runtime_webhook_next_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_whatsapp_connections_user_instance UNIQUE (user_id, instance_name)
);

-- Compatibilidade legada WhatsApp (se aplicável)
CREATE TABLE IF NOT EXISTS public.integrations_whatsapp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    instance_name TEXT NOT NULL,
    base_url TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL DEFAULT '',
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

-- Conexão Oficial com Telegram (Bot API)
CREATE TABLE IF NOT EXISTS public.telegram_connections (
    user_id UUID PRIMARY KEY,
    bot_token TEXT NOT NULL DEFAULT '',
    bot_username TEXT,
    bot_name TEXT,
    chat_id TEXT NOT NULL DEFAULT '',
    chat_title TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
    last_verified_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grupos WhatsApp mapeados por conexão e usuário
CREATE TABLE IF NOT EXISTS public.whatsapp_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
    group_jid TEXT NOT NULL,
    name TEXT NOT NULL,
    participant_count INT DEFAULT 0,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    can_post BOOLEAN NOT NULL DEFAULT FALSE,
    permission_status TEXT NOT NULL DEFAULT 'unverified',
    is_origin BOOLEAN NOT NULL DEFAULT FALSE,
    is_destination BOOLEAN NOT NULL DEFAULT FALSE,
    is_test_group BOOLEAN NOT NULL DEFAULT FALSE,
    runtime_owner_jid TEXT,
    runtime_group JSONB,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- PARTE 4: COFRE DE CREDENCIAIS DE AFILIADOS CRIPTOGRAFADAS (AES-256-GCM)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_credentials_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    store_name TEXT NOT NULL, -- 'mercadolivre', 'shopee', 'netshoes', 'amazon', 'magalu'
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

-- ------------------------------------------------------------------------------
-- PARTE 5: REGRAS DE QUALIDADE, TEMPLATES E CUPONS
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
-- PARTE 6: COPIADOR DE CANAIS, MENSAGENS E FILA DO WORKER
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.copy_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
    source_jid TEXT NOT NULL,
    source_name TEXT NOT NULL,
    template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
    min_discount_pct NUMERIC(5, 2) DEFAULT 10.0,
    auto_approve BOOLEAN NOT NULL DEFAULT FALSE,
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS public.copier_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    connection_id UUID NOT NULL,
    message_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','processed','failed')),
    attempts INT NOT NULL DEFAULT 0,
    lease_token UUID,
    lease_until TIMESTAMPTZ,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    result JSONB,
    last_error TEXT,
    UNIQUE(user_id, connection_id, message_id)
);

CREATE TABLE IF NOT EXISTS public.copier_worker_heartbeat (
    id TEXT PRIMARY KEY,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT
);

-- ------------------------------------------------------------------------------
-- PARTE 7: CATÁLOGO DE PRODUTOS, OFERTAS, HISTÓRICO E DISPAROS
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

CREATE TABLE IF NOT EXISTS public.price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    product_external_id TEXT,
    product_title TEXT NOT NULL,
    product_url TEXT NOT NULL,
    store TEXT NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    original_price NUMERIC(12, 2),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
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
    locked_at TIMESTAMPTZ,
    runtime_payload JSONB,
    runtime_inbox_id UUID,
    runtime_token UUID,
    runtime_delivery TEXT,
    runtime_verified_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- ------------------------------------------------------------------------------
-- PARTE 8: MÉTRICAS, RASTREAMENTO DE CLIQUES E VENDAS CONVERTIDAS (FASES 3 E 4)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tracked_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    code TEXT NOT NULL UNIQUE,
    destination_url TEXT NOT NULL,
    store TEXT,
    product_title TEXT,
    clicks_count INT NOT NULL DEFAULT 0,
    origin_default TEXT DEFAULT 'whatsapp',
    is_test BOOLEAN NOT NULL DEFAULT false,
    last_clicked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.click_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    code TEXT NOT NULL,
    destination_url TEXT NOT NULL,
    store TEXT,
    product_title TEXT,
    origin TEXT NOT NULL DEFAULT 'outro',
    user_agent TEXT,
    referer TEXT,
    is_test BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.converted_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    external_order_id TEXT NOT NULL,
    store TEXT NOT NULL,
    product_title TEXT NOT NULL,
    order_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
    commission_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
    quantity INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'confirmada',
    data_source TEXT NOT NULL CHECK (data_source IN ('api_oficial_shopee', 'csv_importado')),
    is_test BOOLEAN NOT NULL DEFAULT false,
    sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, store, external_order_id)
);

-- Dicionário de termos de busca tolerante a erros ("bulsa" -> blusa) via pg_trgm
CREATE TABLE IF NOT EXISTS public.search_terms_dictionary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    term TEXT NOT NULL UNIQUE,
    normalized_term TEXT NOT NULL,
    category TEXT,
    popularity INT NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- PARTE 9: INTELIGÊNCIA, ALERTAS DE PREÇO E EQUIPE (FASE 4)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_drop_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    product_url TEXT NOT NULL,
    product_title TEXT NOT NULL,
    store TEXT NOT NULL DEFAULT 'mercadolivre',
    baseline_price NUMERIC(12, 2) NOT NULL,
    target_price NUMERIC(12, 2) NOT NULL,
    last_checked_price NUMERIC(12, 2),
    notify_channel TEXT NOT NULL CHECK (notify_channel IN ('whatsapp', 'telegram')),
    notify_destination TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'disparado', 'pausado')),
    triggered_at TIMESTAMPTZ,
    last_checked_at TIMESTAMPTZ,
    is_test BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.intelligence_settings (
    user_id UUID PRIMARY KEY,
    radar_enabled BOOLEAN NOT NULL DEFAULT true,
    radar_min_drop_pct INT NOT NULL DEFAULT 25,
    radar_detect_flash_deals BOOLEAN NOT NULL DEFAULT true,
    weekly_report_enabled BOOLEAN NOT NULL DEFAULT true,
    weekly_report_whatsapp_jid TEXT,
    weekly_report_email TEXT,
    last_weekly_report_sent_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL,
    member_name TEXT NOT NULL,
    member_email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'colaborador' CHECK (role IN ('dono', 'colaborador')),
    permissions TEXT[] NOT NULL DEFAULT ARRAY['criar_e_agendar', 'revisar_ofertas', 'visualizar_metricas'],
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'convite_pendente', 'revogado')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, member_email)
);

CREATE TABLE IF NOT EXISTS public.workspace_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL,
    channel_type TEXT NOT NULL CHECK (channel_type IN ('whatsapp', 'telegram')),
    channel_name TEXT NOT NULL,
    channel_identifier TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- PARTE 10: ATUALIZAÇÕES ADITIVAS (GARANTE COLUNAS MESMO EM TABELAS PRÉ-EXISTENTES)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- user_id em todas as tabelas
    ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.integrations_whatsapp ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.store_credentials ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.quality_rules ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.engagement_hooks ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.store_coupons ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.copy_sources ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.incoming_messages ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.products_catalog ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.offer_evaluations ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.offer_deduplication ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.publication_jobs ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.tracked_links ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.click_events ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.converted_sales ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.price_drop_alerts ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.store_credentials_vault ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.copier_inbox ADD COLUMN IF NOT EXISTS user_id UUID;

    -- Colunas de teste (is_test) para métricas limpas em produção
    ALTER TABLE public.tracked_links ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE public.click_events ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE public.converted_sales ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE public.price_drop_alerts ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

    -- Colunas de origem e produtos
    ALTER TABLE public.tracked_links ADD COLUMN IF NOT EXISTS origin_default TEXT DEFAULT 'whatsapp';
    ALTER TABLE public.click_events ADD COLUMN IF NOT EXISTS product_title TEXT;
    ALTER TABLE public.click_events ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'outro';
END $$;

-- ------------------------------------------------------------------------------
-- PARTE 11: ÍNDICES DE PERFORMANCE E PESQUISA RÁPIDA
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_public_storefronts_slug ON public.public_storefronts(slug);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_user_id ON public.whatsapp_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_connection_id ON public.whatsapp_groups(connection_id);
CREATE INDEX IF NOT EXISTS idx_vault_user_store ON public.store_credentials_vault(user_id, store_name);
CREATE INDEX IF NOT EXISTS idx_price_history_url_date ON public.price_history (product_url, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_ext_store_date ON public.price_history (store, product_external_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracked_links_code ON public.tracked_links(code);
CREATE INDEX IF NOT EXISTS idx_click_events_code ON public.click_events(code);
CREATE INDEX IF NOT EXISTS idx_click_events_date ON public.click_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_events_user_date ON public.click_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_events_origin_date ON public.click_events(origin, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_events_is_test ON public.click_events(is_test);
CREATE INDEX IF NOT EXISTS idx_converted_sales_user_date ON public.converted_sales(user_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_converted_sales_is_test ON public.converted_sales(is_test);
CREATE INDEX IF NOT EXISTS idx_price_drop_alerts_user_status ON public.price_drop_alerts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON public.publication_jobs(status, scheduled_for) WHERE status IN ('agendado', 'aguardando_aprovacao');
CREATE INDEX IF NOT EXISTS idx_copier_inbox_pending ON public.copier_inbox(status, available_at);

-- Índice GIN trigram para o buscador comparador (tolerante a erros de digitação)
CREATE INDEX IF NOT EXISTS idx_search_terms_trgm ON public.search_terms_dictionary USING gin (normalized_term gin_trgm_ops);

-- ------------------------------------------------------------------------------
-- PARTE 12: ROW LEVEL SECURITY (RLS) E POLÍTICAS DE ACESSO
-- ------------------------------------------------------------------------------
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_storefronts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_credentials_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_hooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incoming_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copier_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copier_worker_heartbeat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_deduplication ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.click_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.converted_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_terms_dictionary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_drop_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_channels ENABLE ROW LEVEL SECURITY;

-- Aplicar políticas universais multi-tenant (auth.uid() = user_id OR service_role)
DO $$
DECLARE
    t TEXT;
    user_tables TEXT[] := ARRAY[
        'user_settings', 'brand_settings', 'whatsapp_connections', 'whatsapp_groups',
        'store_credentials_vault', 'store_credentials', 'connection_audit_logs',
        'link_evidence_records', 'quality_rules', 'message_templates', 'engagement_hooks',
        'store_coupons', 'copy_sources', 'incoming_messages', 'copier_inbox',
        'products_catalog', 'offer_evaluations', 'offer_deduplication',
        'publication_jobs', 'story_publications', 'converted_sales', 'price_drop_alerts',
        'intelligence_settings'
    ];
BEGIN
    FOREACH t IN ARRAY user_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS p_user_isolation_%s ON public.%I', t, t);
        EXECUTE format(
            'CREATE POLICY p_user_isolation_%s ON public.%I FOR ALL USING (auth.uid() = user_id OR auth.role() = ''service_role'') WITH CHECK (auth.uid() = user_id OR auth.role() = ''service_role'')',
            t, t
        );
    END LOOP;
END $$;

-- Políticas específicas para tabelas públicas ou com nomes de colunas diferentes
DO $$
BEGIN
    DROP POLICY IF EXISTS "Leitura publica storefronts" ON public.public_storefronts;
    CREATE POLICY "Leitura publica storefronts" ON public.public_storefronts FOR SELECT USING (true);
    DROP POLICY IF EXISTS "Edicao storefronts dono" ON public.public_storefronts;
    CREATE POLICY "Edicao storefronts dono" ON public.public_storefronts FOR ALL USING (auth.uid() = user_id OR auth.role() = 'service_role') WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

    DROP POLICY IF EXISTS "Leitura publica links rastreados" ON public.tracked_links;
    CREATE POLICY "Leitura publica links rastreados" ON public.tracked_links FOR SELECT USING (true);
    DROP POLICY IF EXISTS "Gestao links rastreados dono" ON public.tracked_links;
    CREATE POLICY "Gestao links rastreados dono" ON public.tracked_links FOR ALL USING (auth.uid() = user_id OR auth.role() = 'service_role') WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

    DROP POLICY IF EXISTS "Registrar cliques publicos" ON public.click_events;
    CREATE POLICY "Registrar cliques publicos" ON public.click_events FOR INSERT WITH CHECK (true);
    DROP POLICY IF EXISTS "Consultar cliques" ON public.click_events;
    CREATE POLICY "Consultar cliques" ON public.click_events FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'service_role');

    DROP POLICY IF EXISTS "Leitura publica dicionario busca" ON public.search_terms_dictionary;
    CREATE POLICY "Leitura publica dicionario busca" ON public.search_terms_dictionary FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Leitura historico precos" ON public.price_history;
    CREATE POLICY "Leitura historico precos" ON public.price_history FOR SELECT USING (true);
    DROP POLICY IF EXISTS "Insercao historico precos" ON public.price_history;
    CREATE POLICY "Insercao historico precos" ON public.price_history FOR INSERT WITH CHECK (true);

    DROP POLICY IF EXISTS "Acesso equipe dono" ON public.team_members;
    CREATE POLICY "Acesso equipe dono" ON public.team_members FOR ALL USING (auth.uid() = owner_user_id OR auth.role() = 'service_role') WITH CHECK (auth.uid() = owner_user_id OR auth.role() = 'service_role');

    DROP POLICY IF EXISTS "Acesso canais dono" ON public.workspace_channels;
    CREATE POLICY "Acesso canais dono" ON public.workspace_channels FOR ALL USING (auth.uid() = owner_user_id OR auth.role() = 'service_role') WITH CHECK (auth.uid() = owner_user_id OR auth.role() = 'service_role');
END $$;

-- ------------------------------------------------------------------------------
-- PARTE 13: FUNÇÕES DE CONTROLE DE FILA DO COPIADOR (COPIER RUNTIME)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.copier_claim_inbox()
RETURNS SETOF public.copier_inbox LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    selected_id UUID;
BEGIN
    UPDATE public.copier_inbox SET status = 'failed', last_error = 'Limite de processamento atingido'
    WHERE status = 'processing' AND lease_until < NOW() AND attempts >= 3;

    SELECT id INTO selected_id FROM public.copier_inbox
    WHERE attempts < 3 AND available_at <= NOW()
      AND (status = 'pending' OR (status = 'processing' AND lease_until < NOW()))
    ORDER BY received_at FOR UPDATE SKIP LOCKED LIMIT 1;

    RETURN QUERY UPDATE public.copier_inbox SET
        status = 'processing',
        attempts = attempts + 1,
        lease_token = gen_random_uuid(),
        lease_until = NOW() + INTERVAL '5 minutes'
    WHERE id = selected_id RETURNING *;
END $$;

CREATE OR REPLACE FUNCTION public.copier_complete_inbox(p_id UUID, p_token UUID, p_result JSONB, p_jobs JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    entry public.copier_inbox;
    job JSONB;
BEGIN
    SELECT * INTO entry FROM public.copier_inbox
    WHERE id = p_id AND lease_token = p_token AND status = 'processing' AND lease_until > NOW() FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF p_jobs IS NOT NULL AND jsonb_array_length(p_jobs) > 0 THEN
        FOR job IN SELECT * FROM jsonb_array_elements(p_jobs) LOOP
            INSERT INTO public.publication_jobs(
                id, user_id, connection_id, origin_type, source_id, target_jid, target_name,
                message_text, media_url, media_type, affiliate_url, status, scheduled_for,
                attempts, max_attempts, error_details, runtime_payload, runtime_inbox_id,
                runtime_verified_url, created_at, updated_at
            )
            VALUES (
                (job->>'id')::UUID, entry.user_id, entry.connection_id, 'copiador',
                (job->>'sourceId')::UUID, job->>'targetJid', job->>'targetName',
                job->>'messageText', job->>'mediaUrl', job->>'mediaType', job->>'affiliateUrl',
                job->>'status', (job->>'scheduledFor')::TIMESTAMPTZ, 0, 3, job->>'errorDetails',
                job, entry.id, CASE WHEN job->>'status' = 'agendado' THEN job->>'affiliateUrl' ELSE NULL END,
                NOW(), NOW()
            )
            ON CONFLICT (id) DO NOTHING;
        END LOOP;
    END IF;

    UPDATE public.copier_inbox SET
        status = 'processed',
        completed_at = NOW(),
        result = p_result,
        last_error = NULL
    WHERE id = entry.id;

    RETURN TRUE;
END $$;

-- ------------------------------------------------------------------------------
-- PARTE 14: POPULAR TERMOS REAIS NO DICIONÁRIO DE BUSCA (pg_trgm)
-- ------------------------------------------------------------------------------
INSERT INTO public.search_terms_dictionary (term, normalized_term, category, popularity)
VALUES
    ('blusa feminina', 'blusa feminina', 'Moda', 100),
    ('blusa', 'blusa', 'Moda', 100),
    ('vestido', 'vestido', 'Moda', 95),
    ('tenis masculino', 'tenis masculino', 'Calçados', 98),
    ('tenis corrida', 'tenis corrida', 'Calçados', 90),
    ('cadeado digital', 'cadeado digital', 'Segurança & Casa', 90),
    ('cadeado', 'cadeado', 'Segurança & Casa', 85),
    ('fritadeira sem oleo', 'fritadeira sem oleo airfryer', 'Eletroportáteis', 95),
    ('airfryer', 'airfryer mondial philips', 'Eletroportáteis', 95),
    ('smartphone 128gb', 'smartphone celular 128gb', 'Celulares', 98),
    ('fone bluetooth', 'fone ouvido bluetooth sem fio', 'Áudio & Acessórios', 95),
    ('relogio inteligente smartwatch', 'relogio inteligente smartwatch', 'Tecnologia', 90),
    ('mochila impermeavel', 'mochila impermeavel notebook', 'Acessórios', 85),
    ('panela de pressao eletrica', 'panela pressao eletrica', 'Casa & Cozinha', 85),
    ('cafeteira expresso', 'cafeteira expresso capsula', 'Casa & Cozinha', 85),
    ('ventilador de coluna', 'ventilador coluna turbo silencioso', 'Climatização', 80)
ON CONFLICT (term) DO NOTHING;

-- FIM DO SCRIPT MASTER CONSOLIDADO

