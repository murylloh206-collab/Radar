-- 09 · Instagram Pro / posts sociais (story, feed e status do WhatsApp)
-- Pode ser executada mais de uma vez. Todas as tabelas isoladas por user_id (RLS + acesso só pelo servidor).
BEGIN;

ALTER TABLE public.brand_settings ADD COLUMN IF NOT EXISTS art_background text NOT NULL DEFAULT 'dark';

-- Ofertas divulgadas nas redes, numeradas por cliente (Oferta #1, #2, ...)
CREATE TABLE IF NOT EXISTS public.social_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  offer_number integer NOT NULL,
  source_job_id uuid,
  title text NOT NULL,
  store text,
  image_url text,
  price_current numeric(12,2) NOT NULL,
  price_original numeric(12,2),
  discount_pct integer,
  coupon text,
  affiliate_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, offer_number),
  UNIQUE (user_id, source_job_id)
);
CREATE INDEX IF NOT EXISTS social_offers_recent ON public.social_offers(user_id, created_at DESC);

-- Cada publicação em um canal
CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  social_offer_id uuid NOT NULL REFERENCES public.social_offers(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('instagram_story', 'instagram_feed', 'whatsapp_status')),
  connection_id uuid,
  art_url text,
  status text NOT NULL CHECK (status IN ('publicado', 'falha', 'incerto')),
  error text,
  external_id text,
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'automatico')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_posts_daily ON public.social_posts(user_id, created_at DESC);

-- Automático com freio (desligado por padrão)
CREATE TABLE IF NOT EXISTS public.social_autopost_settings (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  channels text[] NOT NULL DEFAULT ARRAY['instagram_story'],
  min_interval_minutes integer NOT NULL DEFAULT 60 CHECK (min_interval_minutes BETWEEN 15 AND 1440),
  window_start text NOT NULL DEFAULT '09:00',
  window_end text NOT NULL DEFAULT '22:00',
  min_discount_pct integer NOT NULL DEFAULT 30 CHECK (min_discount_pct BETWEEN 0 AND 95),
  connection_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_autopost_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_offers, public.social_posts, public.social_autopost_settings FROM anon, authenticated;
GRANT ALL ON public.social_offers, public.social_posts, public.social_autopost_settings TO service_role;

-- Registra a oferta e devolve o número (atômico por cliente; a mesma oferta não ganha dois números)
CREATE OR REPLACE FUNCTION public.social_next_offer_number(
  p_user uuid, p_job uuid, p_title text, p_store text, p_image text,
  p_price numeric, p_original numeric, p_discount integer, p_coupon text, p_affiliate text
) RETURNS public.social_offers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing public.social_offers; next_number integer; created public.social_offers;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('social_offers:' || p_user::text));
  IF p_job IS NOT NULL THEN
    SELECT * INTO existing FROM social_offers WHERE user_id = p_user AND source_job_id = p_job;
    IF FOUND THEN RETURN existing; END IF;
  END IF;
  SELECT coalesce(max(offer_number), 0) + 1 INTO next_number FROM social_offers WHERE user_id = p_user;
  INSERT INTO social_offers(user_id, offer_number, source_job_id, title, store, image_url, price_current, price_original, discount_pct, coupon, affiliate_url)
  VALUES (p_user, next_number, p_job, p_title, p_store, p_image, p_price, p_original, p_discount, p_coupon, p_affiliate)
  RETURNING * INTO created;
  RETURN created;
END $$;

REVOKE ALL ON FUNCTION public.social_next_offer_number(uuid, uuid, text, text, text, numeric, numeric, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.social_next_offer_number(uuid, uuid, text, text, text, numeric, numeric, integer, text, text) TO service_role;

COMMIT;
