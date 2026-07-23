ALTER TABLE public.community_symptoms ADD COLUMN IF NOT EXISTS category text;
CREATE INDEX IF NOT EXISTS community_symptoms_category_idx ON public.community_symptoms(category);