CREATE TABLE IF NOT EXISTS public.resource_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('up', 'down')),
  comment text,
  excluded_ingredients text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resource_feedback_resource_id_idx ON public.resource_feedback (resource_id);
CREATE INDEX IF NOT EXISTS resource_feedback_user_id_idx ON public.resource_feedback (user_id);

ALTER TABLE public.resource_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own resource feedback"
  ON public.resource_feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own resource feedback"
  ON public.resource_feedback FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own resource feedback"
  ON public.resource_feedback FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all resource feedback"
  ON public.resource_feedback FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));