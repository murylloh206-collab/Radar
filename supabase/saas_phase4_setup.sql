-- ==============================================================================
-- RADAR DE OFERTAS SaaS — FASE 4: INTELIGÊNCIA, EQUIPE, JOBS EM SEGUNDO PLANO E PRODUÇÃO
-- Execute este arquivo no SQL Editor do Supabase.
-- ==============================================================================

-- 1. MARCAÇÃO DE DADOS DE TESTE (`is_test = true`) PARA EXCLUSÃO EM PRODUÇÃO E LIMPEZA EM 1 CLIQUE
ALTER TABLE public.tracked_links ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.click_events ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.converted_sales ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_click_events_is_test ON public.click_events(is_test);
CREATE INDEX IF NOT EXISTS idx_converted_sales_is_test ON public.converted_sales(is_test);

-- 2. ALERTAS DE QUEDA DE PREÇO (`price_drop_alerts` — Exclusivo Ultimate)
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_drop_alerts_user_status
    ON public.price_drop_alerts(user_id, status);

ALTER TABLE public.price_drop_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Acesso alertas de queda de preco" ON public.price_drop_alerts;
    CREATE POLICY "Acesso alertas de queda de preco"
        ON public.price_drop_alerts FOR ALL USING (true) WITH CHECK (true);
END $$;

-- 3. CONFIGURAÇÃO DO RADAR DE OPORTUNIDADES E RELATÓRIO SEMANAL (`intelligence_settings`)
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

ALTER TABLE public.intelligence_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Acesso configuracoes de inteligencia" ON public.intelligence_settings;
    CREATE POLICY "Acesso configuracoes de inteligencia"
        ON public.intelligence_settings FOR ALL USING (true) WITH CHECK (true);
END $$;

-- 4. EQUIPE E MÚLTIPLOS CANAIS (`team_members` e `workspace_channels` — Ultimate)
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

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_channels ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Acesso membros da equipe" ON public.team_members;
    DROP POLICY IF EXISTS "Acesso canais do workspace" ON public.workspace_channels;

    CREATE POLICY "Acesso membros da equipe"
        ON public.team_members FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "Acesso canais do workspace"
        ON public.workspace_channels FOR ALL USING (true) WITH CHECK (true);
END $$;

-- 5. STATUS DE EXECUÇÃO DOS MOTORES EM SEGUNDO PLANO (`background_jobs_status`)
CREATE TABLE IF NOT EXISTS public.background_jobs_status (
    job_key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    schedule_cron TEXT NOT NULL,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    last_status TEXT NOT NULL DEFAULT 'idle' CHECK (last_status IN ('idle', 'running', 'ok', 'error')),
    last_error TEXT,
    items_processed INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.background_jobs_status ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Acesso status jobs background" ON public.background_jobs_status;
    CREATE POLICY "Acesso status jobs background"
        ON public.background_jobs_status FOR ALL USING (true) WITH CHECK (true);
END $$;

