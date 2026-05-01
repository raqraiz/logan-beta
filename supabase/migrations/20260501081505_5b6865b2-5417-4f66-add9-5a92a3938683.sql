-- Table to store broadcast drafts and history
CREATE TABLE public.admin_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  title text,
  content text NOT NULL,
  segment_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft', -- draft | sent
  recipient_count integer,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage broadcasts"
  ON public.admin_broadcasts
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_admin_broadcasts_updated_at
  BEFORE UPDATE ON public.admin_broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_admin_broadcasts_created_at ON public.admin_broadcasts (created_at DESC);