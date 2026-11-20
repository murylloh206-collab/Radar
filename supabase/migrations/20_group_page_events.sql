-- 20: contador da página /grupo (visitas e cliques em "Entrar no grupo").
-- O visitante é guardado só como um código embaralhado do dia (sem IP nem nome), para não contar o mesmo duas vezes.
CREATE TABLE IF NOT EXISTS public.group_page_events (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('visita', 'clique')),
  visitor text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_group_page_events_kind_time ON public.group_page_events(kind, created_at);
CREATE INDEX IF NOT EXISTS idx_group_page_events_visitor ON public.group_page_events(visitor, kind, created_at);
-- Sem políticas: só o servidor (chave de serviço) lê e grava.
ALTER TABLE public.group_page_events ENABLE ROW LEVEL SECURITY;
