CREATE POLICY "Authenticated users can read short links"
ON public.short_links
FOR SELECT
TO authenticated
USING (true);