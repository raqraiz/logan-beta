ALTER TABLE public.community_symptoms ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS community_symptoms_deleted_at_idx ON public.community_symptoms (deleted_at);