-- Drop the existing check constraint and add a new one that includes 'onboarding'
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;

-- Add the constraint back with 'onboarding' included
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_message_type_check 
  CHECK (message_type IS NULL OR message_type IN ('text', 'reaction', 'onboarding'));