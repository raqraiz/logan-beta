-- Count-only analytics: allow the new "heavy_mood" kind. Still one row per day and type, no user IDs, no message text.
ALTER TABLE public.distress_mode_daily_counts DROP CONSTRAINT IF EXISTS distress_mode_daily_counts_kind_check;
ALTER TABLE public.distress_mode_daily_counts
  ADD CONSTRAINT distress_mode_daily_counts_kind_check CHECK (kind IN ('acute', 'self_harm', 'heavy_mood'));
