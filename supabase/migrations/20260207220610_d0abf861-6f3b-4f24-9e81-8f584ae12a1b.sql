-- Remove the overly permissive policy
DROP POLICY IF EXISTS "Anyone can update their own telegram_chat_id" ON public.participants;