CREATE POLICY "Users can view own participant record"
ON public.participants
FOR SELECT
TO authenticated
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));