DROP POLICY "Contributors or admins can update" ON public.community_symptoms;
CREATE POLICY "Contributors or admins can update" ON public.community_symptoms FOR UPDATE TO authenticated USING ((auth.uid() = added_by) OR has_role(auth.uid(), 'admin'::app_role)) WITH CHECK ((auth.uid() = added_by) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can delete their own cycle images" ON storage.objects;
DROP POLICY IF EXISTS "Cycle images delete own" ON storage.objects;
CREATE POLICY "Cycle images delete own folder" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'cycle-images' AND (storage.foldername(name))[1] = (auth.uid())::text);