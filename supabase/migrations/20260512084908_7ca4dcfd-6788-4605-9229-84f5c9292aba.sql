-- Blood test panels and markers
CREATE TABLE public.lab_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  taken_on DATE,
  lab_name TEXT,
  source TEXT NOT NULL DEFAULT 'upload',
  notes TEXT,
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.lab_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id UUID NOT NULL REFERENCES public.lab_panels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  marker_key TEXT,
  value_numeric NUMERIC,
  value_text TEXT,
  unit TEXT,
  ref_low NUMERIC,
  ref_high NUMERIC,
  flag TEXT,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lab_panels_user ON public.lab_panels(user_id, taken_on DESC);
CREATE INDEX idx_lab_markers_user_key ON public.lab_markers(user_id, marker_key, created_at DESC);
CREATE INDEX idx_lab_markers_panel ON public.lab_markers(panel_id);

ALTER TABLE public.lab_panels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_markers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own lab panels" ON public.lab_panels FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own lab panels" ON public.lab_panels FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own lab panels" ON public.lab_panels FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own lab panels" ON public.lab_panels FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all lab panels" ON public.lab_panels FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users view own lab markers" ON public.lab_markers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own lab markers" ON public.lab_markers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own lab markers" ON public.lab_markers FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own lab markers" ON public.lab_markers FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all lab markers" ON public.lab_markers FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));