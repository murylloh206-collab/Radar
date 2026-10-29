-- ==============================================================================
-- RADAR DE OFERTAS — SCRIPT DE CONFERÊNCIA PRÉ-MIGRAÇÃO (SOMENTE LEITURA)
-- Não realiza nenhuma alteração nem exclusão no banco de dados.
-- Execute no Editor SQL do seu Supabase para verificar a estrutura atual.
-- ==============================================================================

-- 1. Listar todas as tabelas públicas existentes e contagem aproximada de registros
SELECT 
    table_name,
    (xpath('/row/cnt/text()', xml_count))[1]::text::int as approximate_row_count
FROM (
    SELECT 
        table_name,
        table_schema,
        query_to_xml(format('SELECT COUNT(*) as cnt FROM %I.%I', table_schema, table_name), false, true, '') as xml_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
) sub;

-- 2. Verificar se o schema antigo (Painel de Ofertas antigo) ou objetos anteriores existem
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'user_settings',
    'integrations_whatsapp',
    'store_credentials',
    'quality_rules',
    'copy_sources',
    'copy_destinations',
    'incoming_messages',
    'products_catalog',
    'offer_evaluations',
    'publication_jobs',
    'queue_campaigns',
    'list_campaigns'
  )
ORDER BY table_name, ordinal_position;

-- 3. Verificar status do Row Level Security (RLS) nas tabelas públicas
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 4. Verificar se a extensão uuid-ossp e pgcrypto estão ativas
SELECT extname, extversion FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto');
