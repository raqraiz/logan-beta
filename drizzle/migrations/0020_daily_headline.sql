ALTER TABLE public.daily_home_insights ADD COLUMN IF NOT EXISTS headline_text text, ADD COLUMN IF NOT EXISTS subline_text text;
COMMENT ON COLUMN public.daily_home_insights.headline_text IS 'Short daily headline (max 6 words) for the Logan Today card.';
COMMENT ON COLUMN public.daily_home_insights.subline_text IS 'One quiet line under the daily headline.';