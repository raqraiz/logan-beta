ALTER TABLE public.daily_home_insights
  ADD COLUMN IF NOT EXISTS succeed_him_text text,
  ADD COLUMN IF NOT EXISTS dont_mess_up_him_text text;