-- Custom trackers: user-defined items they want to correlate with their cycle
CREATE TABLE public.custom_trackers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '✨',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_custom_trackers_user ON public.custom_trackers(user_id, is_active);

ALTER TABLE public.custom_trackers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trackers"
  ON public.custom_trackers FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trackers"
  ON public.custom_trackers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trackers"
  ON public.custom_trackers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trackers"
  ON public.custom_trackers FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all trackers"
  ON public.custom_trackers FOR SELECT
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_custom_trackers_updated_at
  BEFORE UPDATE ON public.custom_trackers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tracker logs: daily 1-5 ratings, tagged with cycle context
CREATE TABLE public.tracker_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tracker_id UUID NOT NULL REFERENCES public.custom_trackers(id) ON DELETE CASCADE,
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 5),
  notes TEXT,
  cycle_phase TEXT,
  cycle_day INTEGER,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tracker_logs_user_tracker ON public.tracker_logs(user_id, tracker_id, logged_at DESC);

ALTER TABLE public.tracker_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tracker logs"
  ON public.tracker_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tracker logs"
  ON public.tracker_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tracker logs"
  ON public.tracker_logs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all tracker logs"
  ON public.tracker_logs FOR SELECT
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));