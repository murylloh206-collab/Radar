-- ==============================================================================
-- RADAR DE OFERTAS — PLANO DE RECUPERAÇÃO / ROLLBACK SEGURO (20261026000000)
-- IMPORTANTE: NUNCA execute este script de forma automática!
-- NENHUMA EXCLUSÃO DESTRUTIVA OU DROP TABLE ... CASCADE É EXECUTADA AUTOMATICAMENTE.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- OPÇÃO 1 (RECOMENDADA): RECUPERAÇÃO NÃO-DESTRUTIVA (PRESERVAÇÃO DE DADOS)
-- Renomeia as tabelas para _backup caso seja necessário reverter a migração
-- sem perder o histórico de mensagens, avaliações, produtos e configurações.
-- ------------------------------------------------------------------------------
/*
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'publication_jobs') THEN
        ALTER TABLE public.publication_jobs RENAME TO publication_jobs_backup;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'incoming_messages') THEN
        ALTER TABLE public.incoming_messages RENAME TO incoming_messages_backup;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products_catalog') THEN
        ALTER TABLE public.products_catalog RENAME TO products_catalog_backup;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'offer_evaluations') THEN
        ALTER TABLE public.offer_evaluations RENAME TO offer_evaluations_backup;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'copy_sources') THEN
        ALTER TABLE public.copy_sources RENAME TO copy_sources_backup;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'copy_destinations') THEN
        ALTER TABLE public.copy_destinations RENAME TO copy_destinations_backup;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'whatsapp_groups') THEN
        ALTER TABLE public.whatsapp_groups RENAME TO whatsapp_groups_backup;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_settings') THEN
        ALTER TABLE public.user_settings RENAME TO user_settings_backup;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'integrations_whatsapp') THEN
        ALTER TABLE public.integrations_whatsapp RENAME TO integrations_whatsapp_backup;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_credentials') THEN
        ALTER TABLE public.store_credentials RENAME TO store_credentials_backup;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quality_rules') THEN
        ALTER TABLE public.quality_rules RENAME TO quality_rules_backup;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'queue_campaigns') THEN
        ALTER TABLE public.queue_campaigns RENAME TO queue_campaigns_backup;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'list_campaigns') THEN
        ALTER TABLE public.list_campaigns RENAME TO list_campaigns_backup;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'curator_plans') THEN
        ALTER TABLE public.curator_plans RENAME TO curator_plans_backup;
    END IF;
END $$;
*/

-- ------------------------------------------------------------------------------
-- OPÇÃO 2 (DESTRUTIVA - SOMENTE MANUAL COM CONFIRMAÇÃO DO OPERADOR HUMANO)
-- Caso você queira excluir completamente todas as tabelas após conferência prévia.
-- Descomente as linhas abaixo manualmente apenas se tiver certeza absoluta e backup.
-- ------------------------------------------------------------------------------
-- DROP TABLE IF EXISTS public.curator_plans CASCADE;
-- DROP TABLE IF EXISTS public.list_campaigns CASCADE;
-- DROP TABLE IF EXISTS public.queue_campaigns CASCADE;
-- DROP TABLE IF EXISTS public.publication_jobs CASCADE;
-- DROP TABLE IF EXISTS public.offer_deduplication CASCADE;
-- DROP TABLE IF EXISTS public.offer_evaluations CASCADE;
-- DROP TABLE IF EXISTS public.products_catalog CASCADE;
-- DROP TABLE IF EXISTS public.incoming_messages CASCADE;
-- DROP TABLE IF EXISTS public.copy_destinations CASCADE;
-- DROP TABLE IF EXISTS public.copy_sources CASCADE;
-- DROP TABLE IF EXISTS public.whatsapp_groups CASCADE;
-- DROP TABLE IF EXISTS public.store_coupons CASCADE;
-- DROP TABLE IF EXISTS public.engagement_hooks CASCADE;
-- DROP TABLE IF EXISTS public.message_templates CASCADE;
-- DROP TABLE IF EXISTS public.quality_rules CASCADE;
-- DROP TABLE IF EXISTS public.store_credentials CASCADE;
-- DROP TABLE IF EXISTS public.integrations_whatsapp CASCADE;
-- DROP TABLE IF EXISTS public.user_settings CASCADE;
