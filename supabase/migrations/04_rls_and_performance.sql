-- ==============================================================================
-- ETAPA 4: ROW LEVEL SECURITY (RLS), POLÍTICAS MULTI-TENANT E ÍNDICES
-- Garante isolamento estrito entre usuários por auth.uid() e performance em produção.
-- ==============================================================================

-- 1. Habilitar RLS em todas as tabelas públicas
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

-- 2. Políticas RLS idempotentes para isolamento multi-tenant
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

-- 3. Índices de Desempenho e Pesquisa
CREATE INDEX IF NOT EXISTS idx_vault_user_store ON public.store_credentials_vault(user_id, store_name);
CREATE INDEX IF NOT EXISTS idx_audit_user_store ON public.connection_audit_logs(user_id, store_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_user_url ON public.link_evidence_records(user_id, final_affiliate_url);
CREATE INDEX IF NOT EXISTS idx_evidence_user_prod ON public.link_evidence_records(user_id, store_name, product_id);
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON public.publication_jobs(status, scheduled_for) WHERE status IN ('agendado', 'aguardando_aprovacao');
CREATE INDEX IF NOT EXISTS idx_incoming_instance ON public.incoming_messages(instance_name, message_id);
CREATE INDEX IF NOT EXISTS idx_catalog_ext ON public.products_catalog(user_id, store_name, external_id);
CREATE INDEX IF NOT EXISTS idx_dedup_hash ON public.offer_deduplication(canonical_url_hash, target_jid);
