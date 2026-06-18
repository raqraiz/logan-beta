
CREATE POLICY "meal_photos_own_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "meal_photos_own_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "meal_photos_own_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
