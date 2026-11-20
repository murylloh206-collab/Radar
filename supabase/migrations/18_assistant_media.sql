-- 18 · Assistente: guarda por alguns segundos a mensagem original (para baixar a foto que a pessoa mandou).
-- Apagada junto com o telefone e o texto assim que a resposta sai. Só acrescenta uma coluna.
alter table public.assistant_inbox add column if not exists source_message jsonb;
