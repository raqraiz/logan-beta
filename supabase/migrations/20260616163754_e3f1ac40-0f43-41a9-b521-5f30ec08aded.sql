-- Anonymous attribution event log (pre-signup).
-- Keyed by client-generated anon_id so a later signup can be matched to the
-- visit(s) that brought the user in.
CREATE TABLE IF NOT EXISTS public.attribution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  referrer text,
  landing_path text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attribution_events_anon_id_idx
  ON public.attribution_events(anon_id, captured_at);
CREATE INDEX IF NOT EXISTS attribution_events_user_id_idx
  ON public.attribution_events(user_id);

GRANT SELECT, INSERT ON public.attribution_events TO anon;
GRANT SELECT, INSERT, UPDATE ON public.attribution_events TO authenticated;
GRANT ALL ON public.attribution_events TO service_role;

ALTER TABLE public.attribution_events ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. unauthenticated visitors) can insert their own visit event.
-- Only utm/referrer/landing fields are recorded; no PII.
CREATE POLICY "Anyone can log an attribution event"
  ON public.attribution_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read raw attribution events.
CREATE POLICY "Admins can read attribution events"
  ON public.attribution_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));