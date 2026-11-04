-- ==============================================================================
-- RADAR DE OFERTAS — SCHEMA DE RASTREAMENTO DE CLIQUES E ESTATÍSTICAS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tracked_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL,
    destination_url TEXT NOT NULL,
    store TEXT,
    user_agent TEXT,
    referer TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracked_links_code ON public.tracked_links(code);
CREATE INDEX IF NOT EXISTS idx_click_events_code ON public.click_events(code);
CREATE INDEX IF NOT EXISTS idx_click_events_date ON public.click_events(created_at DESC);

-- Habilitar RLS
ALTER TABLE public.tracked_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.click_events ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Permitir leitura de links rastreados" ON public.tracked_links;
    DROP POLICY IF EXISTS "Permitir registrar cliques públicos" ON public.click_events;
    DROP POLICY IF EXISTS "Permitir leitura de cliques públicos" ON public.click_events;
    
    CREATE POLICY "Permitir leitura de links rastreados" ON public.tracked_links FOR ALL USING (true);
    CREATE POLICY "Permitir registrar cliques públicos" ON public.click_events FOR INSERT WITH CHECK (true);
    CREATE POLICY "Permitir leitura de cliques públicos" ON public.click_events FOR SELECT USING (true);
END $$;
