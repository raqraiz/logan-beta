ALTER TABLE public.daily_home_insights
  ADD COLUMN IF NOT EXISTS succeed_partner_text text,
  ADD COLUMN IF NOT EXISTS dont_mess_up_partner_text text;
UPDATE public.daily_home_insights SET succeed_partner_text = succeed_him_text, dont_mess_up_partner_text = dont_mess_up_him_text
  WHERE succeed_partner_text IS NULL AND (succeed_him_text IS NOT NULL OR dont_mess_up_him_text IS NOT NULL);
COMMENT ON COLUMN public.daily_home_insights.succeed_him_text IS 'DEPRECATED: replaced by succeed_partner_text';
COMMENT ON COLUMN public.daily_home_insights.dont_mess_up_him_text IS 'DEPRECATED: replaced by dont_mess_up_partner_text';
ALTER TABLE public.headsup_people ADD COLUMN IF NOT EXISTS relationship text;
UPDATE public.headsup_people hp SET relationship = s.relationship
  FROM public.partner_headsup_settings s
  WHERE s.user_id = hp.user_id AND s.relationship IS NOT NULL AND hp.relationship IS NULL
    AND lower(trim(s.partner_name)) = lower(trim(hp.name));