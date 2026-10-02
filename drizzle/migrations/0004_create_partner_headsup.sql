CREATE TABLE public.partner_headsup_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  partner_name text,
  relationship text CHECK (relationship IN ('partner','family','friend')),
  whatsapp_number text CHECK (whatsapp_number IS NULL OR whatsapp_number ~ '^\+[1-9][0-9]{6,14}$'),
  helps text[] NOT NULL DEFAULT '{}',
  timing text NOT NULL DEFAULT 'evening_before' CHECK (timing IN ('evening_before','morning_of')),
  include_dates boolean NOT NULL DEFAULT true,
  include_mood boolean NOT NULL DEFAULT true,
  include_helps boolean NOT NULL DEFAULT true,
  include_footer boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT false,
  paused_until date,
  consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_headsup_settings TO authenticated;
GRANT ALL ON public.partner_headsup_settings TO service_role;
ALTER TABLE public.partner_headsup_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own headsup settings select" ON public.partner_headsup_settings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own headsup settings insert" ON public.partner_headsup_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own headsup settings update" ON public.partner_headsup_settings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own headsup settings delete" ON public.partner_headsup_settings FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.partner_headsup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  window_start date NOT NULL,
  status text NOT NULL CHECK (status IN ('opened','skipped','expired')),
  outcome text CHECK (outcome IS NULL OR outcome IN ('helped','no_difference','didnt_land')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_headsup_events_user_idx ON public.partner_headsup_events (user_id, window_start);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_headsup_events TO authenticated;
GRANT ALL ON public.partner_headsup_events TO service_role;
ALTER TABLE public.partner_headsup_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own headsup events select" ON public.partner_headsup_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own headsup events insert" ON public.partner_headsup_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own headsup events update" ON public.partner_headsup_events FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own headsup events delete" ON public.partner_headsup_events FOR DELETE TO authenticated USING (user_id = auth.uid());