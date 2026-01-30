-- Create storage bucket for cycle circle images
INSERT INTO storage.buckets (id, name, public)
VALUES ('cycle-images', 'cycle-images', true);

-- Allow public read access to cycle images
CREATE POLICY "Public can view cycle images"
ON storage.objects FOR SELECT
USING (bucket_id = 'cycle-images');

-- Allow service role to upload cycle images (edge functions use service role)
CREATE POLICY "Service role can upload cycle images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'cycle-images');

-- Allow service role to delete old images
CREATE POLICY "Service role can delete cycle images"
ON storage.objects FOR DELETE
USING (bucket_id = 'cycle-images');