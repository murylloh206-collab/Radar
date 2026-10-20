-- ==============================================================================
-- Migration: Habilitar Row Level Security (RLS) nas tabelas de telemetria
-- Tabelas: offer_price_history e scan_runs
-- Objetivo: Proteger dados de auditoria e histórico contra leitura ou gravação
--           não autorizada via chave pública anônima (anon key).
-- ==============================================================================

-- 1. Habilita RLS em offer_price_history
ALTER TABLE public.offer_price_history ENABLE ROW LEVEL SECURITY;

-- 2. Habilita RLS em scan_runs
ALTER TABLE public.scan_runs ENABLE ROW LEVEL SECURITY;

-- 3. Remover políticas preexistentes caso tenham sido criadas
DROP POLICY IF EXISTS "Service role full access on offer_price_history" ON public.offer_price_history;
DROP POLICY IF EXISTS "Service role full access on scan_runs" ON public.scan_runs;
DROP POLICY IF EXISTS "Deny anon access on offer_price_history" ON public.offer_price_history;
DROP POLICY IF EXISTS "Deny anon access on scan_runs" ON public.scan_runs;

-- 4. Política de acesso total apenas para service_role (usado pelo backend Next.js)
CREATE POLICY "Service role full access on offer_price_history"
  ON public.offer_price_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on scan_runs"
  ON public.scan_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- (Opcional) Se você quiser permitir que o painel do frontend autenticado leia o histórico de preços:
-- CREATE POLICY "Authenticated users can read price history"
--   ON public.offer_price_history
--   FOR SELECT
--   TO authenticated
--   USING (true);
