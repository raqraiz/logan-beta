-- Add preferred messaging channel to participants
ALTER TABLE public.participants 
ADD COLUMN preferred_channel text DEFAULT 'telegram' 
CHECK (preferred_channel IN ('whatsapp', 'telegram'));