ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS on_hormonal_bc boolean;

COMMENT ON COLUMN public.participants.on_hormonal_bc IS 'Whether the user is currently on hormonal birth control. NULL = unknown / not yet asked. Independent of life_stage, which tracks cycle regularity and life phase.';