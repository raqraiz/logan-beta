
CREATE TABLE public.symptom_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_symptom_id uuid NOT NULL REFERENCES public.community_symptoms(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('spam','not_a_symptom','inappropriate','other')),
  details text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX symptom_reports_symptom_idx ON public.symptom_reports (community_symptom_id);
CREATE INDEX symptom_reports_reporter_idx ON public.symptom_reports (reporter_id, created_at DESC);

GRANT SELECT, INSERT ON public.symptom_reports TO authenticated;
GRANT DELETE ON public.symptom_reports TO authenticated;
GRANT ALL ON public.symptom_reports TO service_role;

ALTER TABLE public.symptom_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can file their own reports"
  ON public.symptom_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Reporters and admins can read reports"
  ON public.symptom_reports FOR SELECT TO authenticated
  USING (
    reporter_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Admins can clear reports"
  ON public.symptom_reports FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE OR REPLACE FUNCTION public.guard_symptom_report_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.reporter_id := auth.uid();

  SELECT count(*) INTO recent_count
  FROM public.symptom_reports
  WHERE reporter_id = auth.uid()
    AND created_at > now() - interval '24 hours';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'rate_limited: max 5 symptom reports per 24 hours';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_symptom_report_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER symptom_reports_guard_insert
BEFORE INSERT ON public.symptom_reports
FOR EACH ROW EXECUTE FUNCTION public.guard_symptom_report_insert();
