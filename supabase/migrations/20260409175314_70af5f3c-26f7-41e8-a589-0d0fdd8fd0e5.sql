-- Add life_stage column to participants
ALTER TABLE public.participants 
ADD COLUMN life_stage text NOT NULL DEFAULT 'cycling' 
CONSTRAINT life_stage_check CHECK (life_stage IN ('cycling', 'postpartum', 'menopause'));