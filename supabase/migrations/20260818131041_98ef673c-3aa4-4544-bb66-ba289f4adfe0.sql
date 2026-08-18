CREATE TABLE public.symptom_candidate_rejections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_name text NOT NULL,
  normalized_name text,
  user_id uuid,
  source text NOT NULL DEFAULT 'unknown',
  reason text NOT NULL,
  matched_existing text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.symptom_candidate_rejections TO authenticated;
GRANT ALL ON public.symptom_candidate_rejections TO service_role;

ALTER TABLE public.symptom_candidate_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view rejected symptom candidates"
ON public.symptom_candidate_rejections FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_symptom_candidate_rejections_created_at ON public.symptom_candidate_rejections (created_at DESC);