ALTER TABLE public.cycle_history
  ADD COLUMN IF NOT EXISTS confirmed_by_user_at timestamptz;