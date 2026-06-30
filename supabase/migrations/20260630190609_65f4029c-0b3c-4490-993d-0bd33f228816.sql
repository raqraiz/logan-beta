ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS pregnancy_lmp date;