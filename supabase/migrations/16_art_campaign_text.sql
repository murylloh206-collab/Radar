-- 16 · Texto de campanha nas artes (ex.: "Mês da Black Friday"), repetido em diagonal no fundo.
-- Só acrescenta uma coluna; vazio/nulo = fundo liso.
alter table public.brand_settings add column if not exists art_campaign_text text;
