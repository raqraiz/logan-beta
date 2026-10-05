GRANT SELECT, INSERT ON public.cycle_updates TO authenticated;
GRANT ALL ON public.cycle_updates TO service_role;
CREATE POLICY "Users can add their own cycle marker notes"
ON public.cycle_updates FOR INSERT TO authenticated
WITH CHECK (
  update_type = 'cycle_marker'
  AND description IN ('Spotting','Symptoms eased','Just felt it reset','Other')
  AND participant_id IN (SELECT id FROM public.participants WHERE user_id = auth.uid())
);