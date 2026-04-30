ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type IS NULL OR message_type = ANY (ARRAY['text','reaction','onboarding','resource_offer','resource','checkin']));