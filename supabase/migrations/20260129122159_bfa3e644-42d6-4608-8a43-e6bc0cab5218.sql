-- Add columns for consent tracking and anchor symptom
ALTER TABLE public.participants 
ADD COLUMN IF NOT EXISTS consent_given boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS consent_given_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS anchor_symptom text;