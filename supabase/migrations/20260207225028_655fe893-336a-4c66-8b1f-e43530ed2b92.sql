-- Allow admins to delete participants
CREATE POLICY "Admins can delete participants"
ON public.participants
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));