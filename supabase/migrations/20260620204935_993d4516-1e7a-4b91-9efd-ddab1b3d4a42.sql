ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS current_period_end_date date;