-- Resource type enum
CREATE TYPE public.resource_type AS ENUM ('meal_plan', 'training_program', 'meditation', 'planner');
CREATE TYPE public.resource_status AS ENUM ('generating', 'ready', 'failed');

-- user_resources: tracks every generated downloadable resource
CREATE TABLE public.user_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type public.resource_type NOT NULL,
  title text NOT NULL,
  status public.resource_status NOT NULL DEFAULT 'generating',
  pdf_path text,
  style text NOT NULL DEFAULT 'dark',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_resources_user_created ON public.user_resources(user_id, created_at DESC);

ALTER TABLE public.user_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own resources"
  ON public.user_resources FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own resources"
  ON public.user_resources FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own resources"
  ON public.user_resources FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own resources"
  ON public.user_resources FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all resources"
  ON public.user_resources FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_user_resources_updated_at
  BEFORE UPDATE ON public.user_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- user_dietary_prefs: saved diet preferences for re-use across resources
CREATE TABLE public.user_dietary_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  diet_type text,
  allergies text[] DEFAULT '{}',
  dislikes text[] DEFAULT '{}',
  cuisines text[] DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_dietary_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own dietary prefs"
  ON public.user_dietary_prefs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dietary prefs"
  ON public.user_dietary_prefs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dietary prefs"
  ON public.user_dietary_prefs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all dietary prefs"
  ON public.user_dietary_prefs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_user_dietary_prefs_updated_at
  BEFORE UPDATE ON public.user_dietary_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for generated PDFs (private, owner-only access)
INSERT INTO storage.buckets (id, name, public) VALUES ('resources', 'resources', false);

CREATE POLICY "Users can read their own resource files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'resources' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Service role can insert resource files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resources' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own resource files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'resources' AND auth.uid()::text = (storage.foldername(name))[1]);