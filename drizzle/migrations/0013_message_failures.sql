CREATE TABLE public.message_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  message_type text,
  source text NOT NULL DEFAULT 'app',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_failures_created_at_idx ON public.message_failures (created_at DESC);
GRANT SELECT, INSERT ON public.message_failures TO authenticated;
GRANT ALL ON public.message_failures TO service_role;
ALTER TABLE public.message_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own insert" ON public.message_failures FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins read" ON public.message_failures FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));