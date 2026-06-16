
-- 1. Tighten community_symptoms UPDATE: prevent changing added_by to someone else
DROP POLICY IF EXISTS "Contributors or admins can update" ON public.community_symptoms;
CREATE POLICY "Contributors or admins can update"
ON public.community_symptoms
FOR UPDATE
TO authenticated
USING ((auth.uid() = added_by) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (
  (
    (auth.uid() = added_by) OR has_role(auth.uid(), 'admin'::app_role)
  )
  AND added_by IS NOT NULL
);

-- 2. user_credits: explicit restrictive policies blocking authenticated UPDATE/DELETE.
-- Only service_role (which bypasses RLS) may mutate balances.
CREATE POLICY "Block user updates to credits"
ON public.user_credits
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Block user deletes of credits"
ON public.user_credits
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (false);

-- 3. Storage UPDATE policies scoped to user's own folder
CREATE POLICY "Users can update own cycle images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'cycle-images' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'cycle-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own resources"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'resources' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'resources' AND (auth.uid())::text = (storage.foldername(name))[1]);
