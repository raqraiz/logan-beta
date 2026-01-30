-- Add column for free-form notes from onboarding
ALTER TABLE public.participants 
ADD COLUMN IF NOT EXISTS additional_notes text;