ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS referrer text,
  ADD COLUMN IF NOT EXISTS landing_path text,
  ADD COLUMN IF NOT EXISTS landing_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_utm_source_idx ON public.profiles(utm_source);
CREATE INDEX IF NOT EXISTS profiles_utm_campaign_idx ON public.profiles(utm_campaign);