-- Lets a user confirm that an unusually long or short tracked cycle is real.
-- Existing rows stay NULL (not confirmed). Existing RLS policies already cover the new column.
ALTER TABLE public.cycle_history
  ADD COLUMN IF NOT EXISTS confirmed_by_user_at timestamptz;