
-- 1) Restrict admin-only columns on public.insights from end users
REVOKE SELECT (admin_notes, ai_prompt_used, approved_by, approved_at) ON public.insights FROM authenticated;
REVOKE SELECT (admin_notes, ai_prompt_used, approved_by, approved_at) ON public.insights FROM anon;
-- Admins access via service_role (edge functions) which bypasses column grants

-- 2) Tighten user_credits insert policy
DROP POLICY IF EXISTS "Users can insert their own credits with defaults" ON public.user_credits;
CREATE POLICY "Users can insert their own credits with defaults"
ON public.user_credits
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND paid_credits = 0
  AND free_credits = 5
  AND bonus_credits_awarded = false
  AND free_credits_reset_at IS NULL
);
