CREATE POLICY "Contributors or admins can update"
ON public.community_symptoms FOR UPDATE
TO authenticated
USING (auth.uid() = added_by OR has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = added_by OR has_role(auth.uid(), 'admin'));