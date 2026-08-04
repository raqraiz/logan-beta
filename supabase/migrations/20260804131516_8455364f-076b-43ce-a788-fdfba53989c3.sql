CREATE TABLE public.feedback_prompt_state (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_shown_at timestamptz,
  last_dismissed_at timestamptz,
  sessions_since_shown integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_prompt_state TO authenticated;
GRANT ALL ON public.feedback_prompt_state TO service_role;

ALTER TABLE public.feedback_prompt_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own feedback prompt state"
ON public.feedback_prompt_state
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_feedback_prompt_state_updated_at
BEFORE UPDATE ON public.feedback_prompt_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();