ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS postpartum_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.participants.postpartum_active IS 'When true, surfaces postpartum recovery context in addition to cycling. Stays true up to 18 months from postpartum_start_date. Manual toggle only.';