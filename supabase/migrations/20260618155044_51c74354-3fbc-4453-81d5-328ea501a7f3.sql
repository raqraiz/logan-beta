ALTER TABLE public.participants DROP CONSTRAINT IF EXISTS life_stage_check;
ALTER TABLE public.participants ADD CONSTRAINT life_stage_check CHECK (life_stage IN ('cycling', 'postpartum', 'menopause', 'perimenopause'));
UPDATE public.participants SET life_stage = 'perimenopause' WHERE id = 'd022950e-4321-478f-aff2-e19a896833b9';