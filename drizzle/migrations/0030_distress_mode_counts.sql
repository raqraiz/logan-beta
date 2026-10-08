-- Count-only analytics for distress mode: one row per day and type, no user IDs, no message text.
-- Written only by the chat-ai edge function (service role). Nobody else can read or write it.
CREATE TABLE IF NOT EXISTS public.distress_mode_daily_counts (
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('acute', 'self_harm')),
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);

ALTER TABLE public.distress_mode_daily_counts ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: the service role bypasses RLS, everyone else is denied.

CREATE OR REPLACE FUNCTION public.record_distress_event(_kind text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.distress_mode_daily_counts (day, kind, count)
  VALUES ((now() AT TIME ZONE 'UTC')::date, _kind, 1)
  ON CONFLICT (day, kind) DO UPDATE SET count = public.distress_mode_daily_counts.count + 1
$$;

REVOKE ALL ON FUNCTION public.record_distress_event(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_distress_event(text) TO service_role;