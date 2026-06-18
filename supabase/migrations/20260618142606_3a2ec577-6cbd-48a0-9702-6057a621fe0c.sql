
CREATE POLICY "meal_photos_own_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'meal-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
