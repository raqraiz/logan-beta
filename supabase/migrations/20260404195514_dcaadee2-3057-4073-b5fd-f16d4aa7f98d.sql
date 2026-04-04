
-- Drop existing overly permissive INSERT and DELETE policies
DROP POLICY IF EXISTS "Anyone can upload cycle images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete cycle images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload cycle images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete cycle images" ON storage.objects;

-- Only authenticated users can upload to cycle-images
CREATE POLICY "Authenticated users can upload cycle images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'cycle-images');

-- Only authenticated users can delete their own files (owner match)
CREATE POLICY "Authenticated users can delete own cycle images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'cycle-images' AND owner = auth.uid());
