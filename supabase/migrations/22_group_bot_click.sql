-- 22: o contador da página /grupo passa a aceitar também o toque no botão do bot.
-- Só amplia os tipos aceitos: não altera nem apaga nenhum registro.
ALTER TABLE public.group_page_events DROP CONSTRAINT IF EXISTS group_page_events_kind_check;
ALTER TABLE public.group_page_events ADD CONSTRAINT group_page_events_kind_check CHECK (kind IN ('visita', 'clique', 'clique_bot'));
