-- ==============================================================================
-- RADAR DE OFERTAS — MIGRAÇÃO FASE 2 (MARCA D'ÁGUA, BRANDING, TELEGRAM, VITRINE E ENVIO SEGURO)
-- Execute este script no SQL Editor do seu projeto Supabase.
-- ==============================================================================

-- 1. Tabela de Identidade Visual, Marca d'Água Personalizável e Envio Seguro
CREATE TABLE IF NOT EXISTS public.brand_settings (
    user_id UUID PRIMARY KEY,
    panel_name TEXT NOT NULL DEFAULT 'Radar de Ofertas',
    panel_logo_url TEXT,
    accent_color TEXT NOT NULL DEFAULT '#6366f1',
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

-- 2. Tabela de Conexão Oficial com Telegram (Bot API)
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

-- 3. Tabela de Vitrine Pública ("Link na Bio" em /@slug)
CREATE TABLE IF NOT EXISTS public.public_storefronts (
    user_id UUID PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT 'Radar de Ofertas',
    bio TEXT NOT NULL DEFAULT 'Ofertas verificadas que valem a pena. Promoções selecionadas todos os dias.',
    logo_url TEXT,
    accent_color TEXT NOT NULL DEFAULT '#6366f1',
    btn1_text TEXT NOT NULL DEFAULT 'Entrar no grupo VIP do WhatsApp',
    btn1_url TEXT NOT NULL DEFAULT '',
    btn2_text TEXT NOT NULL DEFAULT 'Canal no Telegram',
    btn2_url TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_storefronts_slug ON public.public_storefronts(slug);

-- Habilitar RLS
ALTER TABLE public.brand_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_storefronts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Acesso brand_settings" ON public.brand_settings;
    DROP POLICY IF EXISTS "Acesso telegram_connections" ON public.telegram_connections;
    DROP POLICY IF EXISTS "Leitura publica storefronts" ON public.public_storefronts;

    CREATE POLICY "Acesso brand_settings" ON public.brand_settings FOR ALL USING (true);
    CREATE POLICY "Acesso telegram_connections" ON public.telegram_connections FOR ALL USING (true);
    CREATE POLICY "Leitura publica storefronts" ON public.public_storefronts FOR ALL USING (true);
END $$;

