CREATE TABLE public.community_symptoms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  added_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX community_symptoms_name_unique ON public.community_symptoms (LOWER(TRIM(name)));

ALTER TABLE public.community_symptoms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view community symptoms"
ON public.community_symptoms FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can add community symptoms"
ON public.community_symptoms FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = added_by);

CREATE POLICY "Contributors or admins can delete"
ON public.community_symptoms FOR DELETE
TO authenticated
USING (auth.uid() = added_by OR has_role(auth.uid(), 'admin'));