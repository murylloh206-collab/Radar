-- ==============================================================================
-- RADAR DE OFERTAS SaaS — PLANOS, ASSINATURAS, INDICAÇÕES E HISTÓRICO DE PREÇOS
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Assinaturas por Usuário (pronta para checkout e login futuros)
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    user_id UUID PRIMARY KEY,
    plano TEXT NOT NULL DEFAULT 'impulse' CHECK (plano IN ('impulse', 'plus', 'ultimate')),
    ciclo TEXT NOT NULL DEFAULT 'anual' CHECK (ciclo IN ('mensal', 'anual')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
    expira_em TIMESTAMPTZ,
    trial_ate TIMESTAMPTZ,
    referral_code TEXT UNIQUE,
    referred_by TEXT,
    referral_discount_pending BOOLEAN NOT NULL DEFAULT false,
    referrals_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabela de Histórico de Preços de cada oferta coletada
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

CREATE INDEX IF NOT EXISTS idx_price_history_url_date
    ON public.price_history (product_url, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_history_ext_store_date
    ON public.price_history (store, product_external_id, recorded_at DESC);

-- 3. Habilitar Row Level Security (RLS)
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Leitura da propria assinatura" ON public.user_subscriptions;
    DROP POLICY IF EXISTS "Leitura do historico de precos" ON public.price_history;
    DROP POLICY IF EXISTS "Insercao de historico de precos" ON public.price_history;

    CREATE POLICY "Leitura da propria assinatura"
        ON public.user_subscriptions FOR SELECT
        USING (auth.uid() = user_id OR auth.role() = 'service_role');

    CREATE POLICY "Leitura do historico de precos"
        ON public.price_history FOR SELECT
        USING (true);

    CREATE POLICY "Insercao de historico de precos"
        ON public.price_history FOR INSERT
        WITH CHECK (true);
END $$;

