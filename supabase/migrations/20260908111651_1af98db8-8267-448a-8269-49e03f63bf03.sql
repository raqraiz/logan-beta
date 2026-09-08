ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS feeding_status text,
  ADD COLUMN IF NOT EXISTS cycle_return_status text,
  ADD COLUMN IF NOT EXISTS birth_control_status text;