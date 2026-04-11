
CREATE TABLE public.symptom_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  symptoms jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  cycle_day integer,
  cycle_phase text,
  logged_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.symptom_logs.symptoms IS 'Array of {name: string, severity: number (1-5)} objects';

ALTER TABLE public.symptom_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own symptom logs"
  ON public.symptom_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own symptom logs"
  ON public.symptom_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own symptom logs"
  ON public.symptom_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all symptom logs"
  ON public.symptom_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_symptom_logs_user_id ON public.symptom_logs (user_id);
CREATE INDEX idx_symptom_logs_logged_at ON public.symptom_logs (logged_at DESC);
