-- Drop the existing check constraint and add a new one that includes 'web'
ALTER TABLE public.participants DROP CONSTRAINT IF EXISTS participants_preferred_channel_check;

ALTER TABLE public.participants ADD CONSTRAINT participants_preferred_channel_check 
CHECK (preferred_channel IN ('telegram', 'whatsapp', 'web'));