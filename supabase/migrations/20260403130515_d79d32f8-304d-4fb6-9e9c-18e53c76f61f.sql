CREATE TABLE public.feature_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own feature events"
  ON public.feature_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all feature events"
  ON public.feature_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_feature_events_feature ON public.feature_events (feature_name);
CREATE INDEX idx_feature_events_user ON public.feature_events (user_id);
CREATE INDEX idx_feature_events_created ON public.feature_events (created_at);