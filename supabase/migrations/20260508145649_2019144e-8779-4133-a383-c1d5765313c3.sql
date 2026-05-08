CREATE POLICY "Users can view own cycle history"
ON public.cycle_history
FOR SELECT
TO authenticated
USING (
  participant_id IN (
    SELECT id FROM public.participants WHERE email = public.get_auth_email()
  )
);

CREATE POLICY "Users can update own cycle history"
ON public.cycle_history
FOR UPDATE
TO authenticated
USING (
  participant_id IN (
    SELECT id FROM public.participants WHERE email = public.get_auth_email()
  )
)
WITH CHECK (
  participant_id IN (
    SELECT id FROM public.participants WHERE email = public.get_auth_email()
  )
);

CREATE POLICY "Users can delete own cycle history"
ON public.cycle_history
FOR DELETE
TO authenticated
USING (
  participant_id IN (
    SELECT id FROM public.participants WHERE email = public.get_auth_email()
  )
);

CREATE POLICY "Users can insert own cycle history"
ON public.cycle_history
FOR INSERT
TO authenticated
WITH CHECK (
  participant_id IN (
    SELECT id FROM public.participants WHERE email = public.get_auth_email()
  )
);