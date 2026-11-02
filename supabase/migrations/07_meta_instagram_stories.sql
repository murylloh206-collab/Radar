-- ==============================================================================
-- ETAPA 7: INTEGRAÇÃO META GRAPH API (INSTAGRAM & FACEBOOK STORIES) E HISTÓRICO
-- ==============================================================================

-- 1. Tabela para publicações de Stories realizadas a partir de ofertas
CREATE TABLE IF NOT EXISTS public.story_publications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    job_id UUID REFERENCES public.publication_jobs(id) ON DELETE SET NULL,
    story_image_url TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'instagram', -- 'instagram', 'facebook', 'both'
    meta_media_id TEXT,
    meta_creation_id TEXT,
    call_to_action TEXT,
    status TEXT NOT NULL DEFAULT 'published', -- 'published', 'failed'
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_story_publications_user_id ON public.story_publications(user_id);
CREATE INDEX IF NOT EXISTS idx_story_publications_job_id ON public.story_publications(job_id);

-- Habilitar RLS
ALTER TABLE public.story_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário gerencia suas próprias publicações de Stories"
    ON public.story_publications
    FOR ALL
    USING (auth.uid() = user_id OR user_id = '00000000-0000-0000-0000-000000000001'::uuid);

