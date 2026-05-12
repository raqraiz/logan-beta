
-- history_imports table
CREATE TABLE public.history_imports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  cycles_imported integer NOT NULL DEFAULT 0,
  symptom_days_imported integer NOT NULL DEFAULT 0,
  tracker_logs_imported integer NOT NULL DEFAULT 0,
  date_range_start date,
  date_range_end date,
  error_message text,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.history_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own imports"
  ON public.history_imports FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own imports"
  ON public.history_imports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all imports"
  ON public.history_imports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_history_imports_user ON public.history_imports(user_id, created_at DESC);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('history-imports', 'history-imports', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their own history files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'history-imports' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read their own history files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'history-imports' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own history files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'history-imports' AND (auth.uid())::text = (storage.foldername(name))[1]);
