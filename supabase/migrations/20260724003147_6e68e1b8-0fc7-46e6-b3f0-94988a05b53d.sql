CREATE TABLE public.user_hidden_symptoms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_symptom_id UUID NOT NULL REFERENCES public.community_symptoms(id) ON DELETE CASCADE,
  hidden_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, community_symptom_id)
);

CREATE INDEX idx_user_hidden_symptoms_user_id ON public.user_hidden_symptoms(user_id);

GRANT SELECT, INSERT, DELETE ON public.user_hidden_symptoms TO authenticated;
GRANT ALL ON public.user_hidden_symptoms TO service_role;

ALTER TABLE public.user_hidden_symptoms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own hidden symptoms"
  ON public.user_hidden_symptoms FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users hide symptoms for themselves"
  ON public.user_hidden_symptoms FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users unhide their own symptoms"
  ON public.user_hidden_symptoms FOR DELETE
  USING (auth.uid() = user_id);