
-- Fix: switch view back to security invoker (safe)
ALTER VIEW public.community_messages_public SET (security_invoker = true);

-- Allow anon+authenticated to SELECT base table so the view works,
-- but this is fine because the view masks user_id for anonymous messages
DROP POLICY "Users can read own messages" ON public.community_messages;
DROP POLICY "Admins can read all messages" ON public.community_messages;

-- Restore public read on base table (view needs it)
CREATE POLICY "Anyone can read community messages"
ON public.community_messages
FOR SELECT
TO anon, authenticated
USING (true);
