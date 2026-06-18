
-- Fix 1: community_symptoms UPDATE WITH CHECK - prevent re-attribution
DROP POLICY IF EXISTS "Contributors or admins can update" ON public.community_symptoms;
CREATE POLICY "Contributors or admins can update"
ON public.community_symptoms
FOR UPDATE
USING ((auth.uid() = added_by) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (
  added_by IS NOT NULL
  AND (
    (auth.uid() = added_by)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Fix 2: user_credits INSERT - require valid reset timestamp
DROP POLICY IF EXISTS "Users can insert their own credits with defaults" ON public.user_credits;
CREATE POLICY "Users can insert their own credits with defaults"
ON public.user_credits
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND paid_credits = 0
  AND free_credits = 5
  AND bonus_credits_awarded = false
  AND free_credits_reset_at IS NOT NULL
);

-- Fix 3: user_integrations - hide OAuth tokens from the client
REVOKE SELECT ON public.user_integrations FROM authenticated;
REVOKE SELECT ON public.user_integrations FROM anon;
GRANT SELECT
  (id, user_id, provider, provider_user_id, status, scopes,
   connected_at, last_synced_at, expires_at, created_at, updated_at)
ON public.user_integrations TO authenticated;
