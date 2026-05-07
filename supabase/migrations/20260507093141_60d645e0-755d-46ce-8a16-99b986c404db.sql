
-- 1. Storage: drop overly broad public-role policies on cycle-images
DROP POLICY IF EXISTS "Service role can upload cycle images" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete cycle images" ON storage.objects;
-- (service_role bypasses RLS, so no replacement needed; authenticated policies already exist)

-- 2. cycle_history: restrict admin policy to authenticated role
DROP POLICY IF EXISTS "Admins can manage cycle history" ON public.cycle_history;
CREATE POLICY "Admins can manage cycle history"
ON public.cycle_history
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. promo_codes: remove broad SELECT; redemption goes through edge function (service role)
DROP POLICY IF EXISTS "Anyone can read active promo codes" ON public.promo_codes;

-- 4. realtime.messages: require authenticated subscribers (postgres_changes still filtered by underlying table RLS)
CREATE POLICY "Authenticated users can subscribe to realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);
