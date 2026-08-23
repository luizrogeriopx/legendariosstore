CREATE TABLE IF NOT EXISTS public.affiliate_settings (
  id text PRIMARY KEY DEFAULT 'default',
  shopee_app_id text,
  shopee_secret text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_settings TO authenticated;
GRANT ALL ON public.affiliate_settings TO service_role;

ALTER TABLE public.affiliate_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage affiliate settings" ON public.affiliate_settings;
CREATE POLICY "Admins manage affiliate settings"
ON public.affiliate_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));