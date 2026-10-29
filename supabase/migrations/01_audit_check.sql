-- ==============================================================================
-- ETAPA 1 (OPCIONAL / SOMENTE LEITURA): AUDITORIA DO BANCO EXISTENTE
-- Não altera nem apaga absolutamente nada no banco de dados.
-- Use para conferir o que já existe no seu projeto Supabase antes de aplicar as tabelas.
-- ==============================================================================

-- 1. Listar todas as tabelas existentes no schema public
SELECT 
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. Verificar se o RLS já está ativo em alguma tabela existente
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 3. Verificar extensões ativas
SELECT extname, extversion FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto');
