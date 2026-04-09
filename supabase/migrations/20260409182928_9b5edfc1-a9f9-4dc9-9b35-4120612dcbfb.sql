CREATE POLICY "Admins can view all widget preferences"
ON public.home_widget_preferences
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));