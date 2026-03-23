
DROP POLICY "Users can insert their own credits" ON public.user_credits;

CREATE POLICY "Users can insert their own credits with defaults"
ON public.user_credits
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND paid_credits = 0
  AND free_credits = 5
);
