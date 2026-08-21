ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS has_uterus boolean DEFAULT true;

COMMENT ON COLUMN public.participants.has_uterus IS 'true = has uterus (bleed possible), false = uterus removed but ovaries retained (still cycling hormonally, no bleed signal), null = unknown/not asked. Independent of life_stage, mirrors on_hormonal_bc tri-state.';