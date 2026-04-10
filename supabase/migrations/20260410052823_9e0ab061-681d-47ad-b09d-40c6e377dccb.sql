
-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view own participant record" ON public.participants;

-- Create a security definer function to safely get the current user's email
CREATE OR REPLACE FUNCTION public.get_auth_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid()
$$;

-- Recreate the policy using the safe function
CREATE POLICY "Users can view own participant record"
ON public.participants
FOR SELECT
TO authenticated
USING (email = public.get_auth_email());
