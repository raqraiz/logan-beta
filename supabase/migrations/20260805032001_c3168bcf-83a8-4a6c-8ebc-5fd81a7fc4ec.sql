ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS menstruation_days integer,
  ADD COLUMN IF NOT EXISTS follicular_days integer,
  ADD COLUMN IF NOT EXISTS ovulation_window_days integer,
  ADD COLUMN IF NOT EXISTS luteal_days integer;