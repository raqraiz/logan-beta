CREATE TABLE public.user_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('fitbit', 'whoop')),
  provider_user_id text,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reauth_required', 'disconnected')),
  last_synced_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own integrations" ON public.user_integrations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own integrations" ON public.user_integrations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own integrations" ON public.user_integrations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own integrations" ON public.user_integrations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins view all integrations" ON public.user_integrations
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_user_integrations_updated_at
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_user_integrations_user ON public.user_integrations(user_id);
CREATE INDEX idx_user_integrations_sync ON public.user_integrations(provider, status, last_synced_at);