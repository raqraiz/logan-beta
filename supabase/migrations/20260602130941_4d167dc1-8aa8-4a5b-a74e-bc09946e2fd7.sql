CREATE POLICY "Users can update their own symptom logs"
ON public.symptom_logs
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);