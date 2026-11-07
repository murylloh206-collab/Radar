-- ==============================================================================
-- RADAR DE OFERTAS SaaS — FASE 3: MÉTRICAS POR PLANO, VENDAS E BUSCADOR COMPARADOR
-- Execute este arquivo no SQL Editor do Supabase.
-- Reaproveita e estende as tabelas existentes `tracked_links` e `click_events`.
-- ==============================================================================

-- 1. EXTENSÕES PARA BUSCA TOLERANTE A ERROS DE DIGITAÇÃO (pg_trgm + unaccent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. APRIMORAMENTO DAS TABELAS DE CLIQUES EXISTENTES (`tracked_links` e `click_events`)
CREATE TABLE IF NOT EXISTS public.tracked_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    code TEXT NOT NULL UNIQUE,
    destination_url TEXT NOT NULL,
    store TEXT,
    product_title TEXT,
    clicks_count INT NOT NULL DEFAULT 0,
    last_clicked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.click_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    destination_url TEXT NOT NULL,
    store TEXT,
    user_agent TEXT,
    referer TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adicionar colunas de produto, origem (WhatsApp, Telegram, vitrine /@slug, card, outro) e user_id
ALTER TABLE public.tracked_links ADD COLUMN IF NOT EXISTS origin_default TEXT DEFAULT 'whatsapp';
ALTER TABLE public.click_events ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.click_events ADD COLUMN IF NOT EXISTS product_title TEXT;
ALTER TABLE public.click_events ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'outro';

CREATE INDEX IF NOT EXISTS idx_click_events_store_date ON public.click_events(store, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_events_origin_date ON public.click_events(origin, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_events_user_date ON public.click_events(user_id, created_at DESC);

-- 3. TABELA DE VENDAS CONVERTIDAS (API OFICIAL SHOPEE + IMPORTAÇÃO DE RELATÓRIO CSV)
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
    sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, store, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_converted_sales_user_date ON public.converted_sales(user_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_converted_sales_store_date ON public.converted_sales(store, sale_date DESC);

ALTER TABLE public.converted_sales ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Acesso vendas convertidas" ON public.converted_sales;
    CREATE POLICY "Acesso vendas convertidas" ON public.converted_sales FOR ALL USING (true) WITH CHECK (true);
END $$;

-- 4. DICIONÁRIO E ÍNDICE TRIGRAM (`pg_trgm` + `unaccent`) PARA "VOCÊ QUIS DIZER: ...?"
CREATE TABLE IF NOT EXISTS public.search_terms_dictionary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    term TEXT NOT NULL UNIQUE,
    normalized_term TEXT NOT NULL,
    category TEXT,
    popularity INT NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_terms_trgm
    ON public.search_terms_dictionary
    USING gin (normalized_term gin_trgm_ops);

ALTER TABLE public.search_terms_dictionary ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Leitura publica dicionario busca" ON public.search_terms_dictionary;
    CREATE POLICY "Leitura publica dicionario busca" ON public.search_terms_dictionary FOR SELECT USING (true);
END $$;

-- Popular termos reais de e-commerce para correção ortográfica via pg_trgm + unaccent
INSERT INTO public.search_terms_dictionary (term, normalized_term, category, popularity)
VALUES
    ('blusa feminina', 'blusa feminina', 'Moda', 100),
    ('blusa', 'blusa', 'Moda', 100),
    ('cadeado', 'cadeado', 'Segurança & Casa', 95),
    ('cadeado digital', 'cadeado digital', 'Segurança & Casa', 85),
    ('fone de ouvido bluetooth', 'fone de ouvido bluetooth', 'Eletrônicos', 100),
    ('fritadeira elétrica air fryer', 'fritadeira eletrica air fryer', 'Eletroportáteis', 100),
    ('tênis de corrida', 'tenis de corrida', 'Esportes & Calçados', 95),
    ('caixa de som bluetooth', 'caixa de som bluetooth', 'Áudio', 95),
    ('smartwatch relógio inteligente', 'smartwatch relogio inteligente', 'Wearables', 90),
    ('cafeteira expresso', 'cafeteira expresso', 'Eletroportáteis', 90),
    ('aspirador de pó robô', 'aspirador de po robo', 'Casa', 88),
    ('perfume importado', 'perfume importado', 'Beleza', 92),
    ('creatina monohidratada', 'creatina monohidratada', 'Suplementos', 94),
    ('whey protein', 'whey protein', 'Suplementos', 90),
    ('parafusadeira e furadeira', 'parafusadeira e furadeira', 'Ferramentas', 89),
    ('teclado mecânico gamer', 'teclado mecanico gamer', 'Informática', 86),
    ('mouse sem fio gamer', 'mouse sem fio gamer', 'Informática', 85),
    ('monitor gamer', 'monitor gamer', 'Informática', 85),
    ('escova secadora', 'escova secadora', 'Beleza', 88),
    ('liquidificador turbo', 'liquidificador turbo', 'Eletroportáteis', 84),
    ('panela de pressão elétrica', 'panela de pressao eletrica', 'Eletroportáteis', 84),
    ('ventilador de coluna', 'ventilador de coluna', 'Climatização', 86),
    ('travesseiro viscoelástico nasa', 'travesseiro viscoelastico nasa', 'Casa & Quarto', 82),
    ('mochila impermeável notebook', 'mochila impermeavel notebook', 'Acessórios', 83)
ON CONFLICT (term) DO NOTHING;

-- Função RPC no Supabase usando `unaccent` + `pg_trgm` para sugerir correção ("Você quis dizer: ...?")
CREATE OR REPLACE FUNCTION public.suggest_search_term(raw_query TEXT)
RETURNS TABLE (
    suggested_term TEXT,
    similarity_score REAL,
    category TEXT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        d.term AS suggested_term,
        similarity(d.normalized_term, lower(unaccent(trim(raw_query)))) AS similarity_score,
        d.category
    FROM public.search_terms_dictionary d
    WHERE similarity(d.normalized_term, lower(unaccent(trim(raw_query)))) >= 0.32
    ORDER BY
        similarity(d.normalized_term, lower(unaccent(trim(raw_query)))) DESC,
        d.popularity DESC
    LIMIT 3;
$$;

