-- ==============================================================================
-- RADAR DE OFERTAS SaaS — FASE 5 (BLOCO A): MULTIUSUÁRIO DEFINITIVO & RLS
-- Execute este arquivo no SQL Editor do Supabase.
-- Idempotente: pode ser executado múltiplas vezes sem erro.
-- ==============================================================================

-- 1. GARANTIR COLUNA user_id EM TODAS AS TABELAS DO PROJETO
DO $$
BEGIN
    -- Tabelas originais do schema.sql e migrações
    ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.integrations_whatsapp ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.store_credentials ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.quality_rules ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.engagement_hooks ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.store_coupons ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.copy_sources ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.copy_destinations ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.incoming_messages ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.products_catalog ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.offer_evaluations ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.offer_deduplication ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.publication_jobs ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.queue_campaigns ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.list_campaigns ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.curator_plans ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.group_analytics ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.bio_links ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.affiliate_reports ADD COLUMN IF NOT EXISTS user_id UUID;

    -- Tabelas das Fases 1 a 4 e extensões
    ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.brand_settings ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.price_history ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.public_storefronts ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.telegram_connections ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.tracked_links ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.click_events ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.converted_sales ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.price_drop_alerts ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.intelligence_settings ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS owner_user_id UUID;
    ALTER TABLE public.workspace_channels ADD COLUMN IF NOT EXISTS owner_user_id UUID;
    ALTER TABLE public.store_credentials_vault ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.copier_inbox ADD COLUMN IF NOT EXISTS user_id UUID;
END $$;

-- 2. CRIAR TABELA DE MIGRAÇÃO SEGURA PARA CONTA REAL (`account_claims`)
CREATE TABLE IF NOT EXISTS public.account_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_token TEXT NOT NULL UNIQUE,
    legacy_user_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.account_claims ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Acesso admin account claims" ON public.account_claims;
    CREATE POLICY "Acesso admin account claims"
        ON public.account_claims FOR ALL
        TO service_role
        USING (true) WITH CHECK (true);
END $$;

-- 3. HABILITAR ROW LEVEL SECURITY (RLS) RIGOROSO EM TODAS AS TABELAS
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'user_settings', 'integrations_whatsapp', 'store_credentials', 'quality_rules',
        'message_templates', 'engagement_hooks', 'store_coupons', 'whatsapp_groups',
        'copy_sources', 'copy_destinations', 'incoming_messages', 'products_catalog',
        'offer_evaluations', 'offer_deduplication', 'publication_jobs', 'queue_campaigns',
        'list_campaigns', 'curator_plans', 'group_analytics', 'bio_links', 'affiliate_reports',
        'user_subscriptions', 'brand_settings', 'price_history', 'public_storefronts',
        'telegram_connections', 'tracked_links', 'click_events', 'converted_sales',
        'price_drop_alerts', 'intelligence_settings', 'team_members', 'workspace_channels',
        'store_credentials_vault', 'whatsapp_connections', 'copier_inbox'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        END IF;
    END LOOP;
END $$;

-- 4. POLÍTICAS DE RLS: CADA USUÁRIO SÓ LÊ E ESCREVE AS PRÓPRIAS LINHAS (auth.uid() = user_id)
DO $$
DECLARE
    tbl text;
    user_col text;
    tables text[] := ARRAY[
        'user_settings', 'integrations_whatsapp', 'store_credentials', 'quality_rules',
        'message_templates', 'engagement_hooks', 'store_coupons', 'whatsapp_groups',
        'copy_sources', 'copy_destinations', 'incoming_messages', 'products_catalog',
        'offer_evaluations', 'offer_deduplication', 'publication_jobs', 'queue_campaigns',
        'list_campaigns', 'curator_plans', 'group_analytics', 'bio_links', 'affiliate_reports',
        'user_subscriptions', 'brand_settings', 'price_history', 'public_storefronts',
        'telegram_connections', 'tracked_links', 'click_events', 'converted_sales',
        'price_drop_alerts', 'intelligence_settings', 'store_credentials_vault',
        'whatsapp_connections', 'copier_inbox'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('DROP POLICY IF EXISTS "rls_user_isolation_%s" ON public.%I;', tbl, tbl);
            EXECUTE format(
                'CREATE POLICY "rls_user_isolation_%s" ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);',
                tbl, tbl
            );
        END IF;
    END LOOP;

    -- Políticas com nome de coluna customizado (owner_user_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'team_members') THEN
        DROP POLICY IF EXISTS "rls_user_isolation_team_members" ON public.team_members;
        CREATE POLICY "rls_user_isolation_team_members" ON public.team_members FOR ALL TO authenticated
            USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspace_channels') THEN
        DROP POLICY IF EXISTS "rls_user_isolation_workspace_channels" ON public.workspace_channels;
        CREATE POLICY "rls_user_isolation_workspace_channels" ON public.workspace_channels FOR ALL TO authenticated
            USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);
    END IF;

    -- Permissão pública para leitura de vitrines ativas (/u/:slug)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'public_storefronts') THEN
        DROP POLICY IF EXISTS "rls_public_storefront_read" ON public.public_storefronts;
        CREATE POLICY "rls_public_storefront_read" ON public.public_storefronts FOR SELECT TO anon, authenticated
            USING (is_active = true);
    END IF;

    -- Permissão irrestrita e segura para o backend administrativo (service_role)
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('DROP POLICY IF EXISTS "rls_service_role_%s" ON public.%I;', tbl, tbl);
            EXECUTE format(
                'CREATE POLICY "rls_service_role_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
                tbl, tbl
            );
        END IF;
    END LOOP;
END $$;

-- 5. FUNÇÃO ATÔMICA PARA REIVINDICAR DADOS DO LEGADO / ADMIN_UUID PARA A CONTA REAL
CREATE OR REPLACE FUNCTION public.claim_legacy_account_data(p_target_user_id UUID, p_claim_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_claim RECORD;
    v_legacy_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    v_updated_count INT := 0;
BEGIN
    SELECT * INTO v_claim FROM public.account_claims
    WHERE claim_token = p_claim_token AND claimed_at IS NULL;

    IF v_claim.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Token de reivindicação inválido ou já utilizado.');
    END IF;

    -- Migra todos os registros que pertenciam ao ADMIN_UUID para o novo user_id autenticado
    UPDATE public.user_settings SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.integrations_whatsapp SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.store_credentials SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.quality_rules SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.message_templates SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.engagement_hooks SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.store_coupons SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.whatsapp_groups SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.copy_sources SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.incoming_messages SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.products_catalog SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.offer_evaluations SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.offer_deduplication SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.publication_jobs SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.queue_campaigns SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.list_campaigns SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.curator_plans SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.group_analytics SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.bio_links SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.affiliate_reports SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.brand_settings SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.public_storefronts SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.telegram_connections SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.tracked_links SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.click_events SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.converted_sales SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.price_drop_alerts SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.intelligence_settings SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.team_members SET owner_user_id = p_target_user_id WHERE owner_user_id = v_legacy_id;
    UPDATE public.workspace_channels SET owner_user_id = p_target_user_id WHERE owner_user_id = v_legacy_id;
    UPDATE public.store_credentials_vault SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.whatsapp_connections SET user_id = p_target_user_id WHERE user_id = v_legacy_id;
    UPDATE public.copier_inbox SET user_id = p_target_user_id WHERE user_id = v_legacy_id;

    -- Marca o token como consumido
    UPDATE public.account_claims
    SET claimed_at = NOW(), claimed_by_user_id = p_target_user_id
    WHERE id = v_claim.id;

    RETURN jsonb_build_object('success', true, 'message', 'Todos os dados legados foram migrados com sucesso para sua conta real!');
END;
$$;

