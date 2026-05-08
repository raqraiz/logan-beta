DROP POLICY IF EXISTS "Authenticated users can upload cycle images" ON storage.objects;

CREATE POLICY "Authenticated users can upload cycle images to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cycle-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);