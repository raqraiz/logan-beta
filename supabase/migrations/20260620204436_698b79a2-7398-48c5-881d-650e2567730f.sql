ALTER TABLE public.cycle_history
  ADD COLUMN IF NOT EXISTS menstruation_days integer,
  ADD COLUMN IF NOT EXISTS follicular_days integer,
  ADD COLUMN IF NOT EXISTS ovulation_days integer,
  ADD COLUMN IF NOT EXISTS luteal_days integer;