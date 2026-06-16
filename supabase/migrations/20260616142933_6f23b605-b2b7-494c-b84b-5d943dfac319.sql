
-- Remove sensitive participants table from realtime publication (no client subscribes to it)
ALTER PUBLICATION supabase_realtime DROP TABLE public.participants;

-- Tighten waitlist insert policy: replace WITH CHECK (true) with basic email validation
DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlist;
CREATE POLICY "Anyone can join waitlist"
ON public.waitlist
FOR INSERT
TO anon, authenticated
WITH CHECK (
  email IS NOT NULL
  AND length(email) BETWEEN 5 AND 320
  AND email LIKE '%_@_%.__%'
);
