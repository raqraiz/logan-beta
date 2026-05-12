
-- Add SELECT policies so users can read their own data
CREATE POLICY "Users can view their own cycle updates"
ON public.cycle_updates
FOR SELECT TO authenticated
USING (participant_id IN (SELECT id FROM public.participants WHERE email = public.get_auth_email()));

CREATE POLICY "Users can view their own insights"
ON public.insights
FOR SELECT TO authenticated
USING (participant_id IN (SELECT id FROM public.participants WHERE email = public.get_auth_email()));

CREATE POLICY "Users can view their own feedback"
ON public.feedback
FOR SELECT TO authenticated
USING (participant_id IN (SELECT id FROM public.participants WHERE email = public.get_auth_email()));

-- Storage: allow users to read their own cycle images
CREATE POLICY "Authenticated users can read own cycle images"
ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'cycle-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Privilege escalation hardening on user_roles: restrictive INSERT/UPDATE/DELETE for non-admins
CREATE POLICY "Only admins can insert roles"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update roles"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete roles"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Set search_path on pgmq helper functions to satisfy linter
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
