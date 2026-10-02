ALTER TABLE public.partner_headsup_events DROP CONSTRAINT IF EXISTS partner_headsup_events_status_check;
ALTER TABLE public.partner_headsup_events ADD CONSTRAINT partner_headsup_events_status_check CHECK (status IN ('drafted','opened','skipped','expired','superseded'));
ALTER TABLE public.partner_headsup_events
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'scheduled' CHECK (kind IN ('scheduled','on_demand')),
  ADD COLUMN IF NOT EXISTS window_end date,
  ADD COLUMN IF NOT EXISTS predicted_period_start date,
  ADD COLUMN IF NOT EXISTS low_confidence boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkin_sent_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS partner_headsup_events_one_scheduled_per_window
  ON public.partner_headsup_events (user_id, window_start) WHERE kind = 'scheduled' AND status <> 'superseded';

CREATE TABLE public.partner_headsup_style_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  text text NOT NULL CHECK (char_length(text) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_headsup_style_examples_user_idx ON public.partner_headsup_style_examples (user_id, created_at DESC);
GRANT SELECT, DELETE ON public.partner_headsup_style_examples TO authenticated;
GRANT ALL ON public.partner_headsup_style_examples TO service_role;
ALTER TABLE public.partner_headsup_style_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own style examples select" ON public.partner_headsup_style_examples FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own style examples delete" ON public.partner_headsup_style_examples FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
GRANT ALL ON public.push_tokens TO service_role;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own push tokens select" ON public.push_tokens FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own push tokens insert" ON public.push_tokens FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own push tokens update" ON public.push_tokens FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own push tokens delete" ON public.push_tokens FOR DELETE TO authenticated USING (user_id = auth.uid());