ALTER TABLE public.distress_mode_daily_counts DROP CONSTRAINT IF EXISTS distress_mode_daily_counts_kind_check;
ALTER TABLE public.distress_mode_daily_counts
  ADD CONSTRAINT distress_mode_daily_counts_kind_check CHECK (kind IN ('acute', 'self_harm', 'heavy_mood'));