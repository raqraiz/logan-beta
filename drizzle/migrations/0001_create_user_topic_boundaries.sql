CREATE TABLE public.user_topic_boundaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz NULL,
  source_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('topic', 'behavior')),
  label text NOT NULL,
  stage_key text NULL CHECK (stage_key IN ('pregnancy_loss', 'pregnancy', 'postpartum', 'perimenopause', 'menopause')),
  active boolean NOT NULL DEFAULT true
);

GRANT SELECT, UPDATE ON public.user_topic_boundaries TO authenticated;
GRANT ALL ON public.user_topic_boundaries TO service_role;

ALTER TABLE public.user_topic_boundaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own topic boundaries"
  ON public.user_topic_boundaries
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own topic boundaries"
  ON public.user_topic_boundaries
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_topic_boundaries_lookup
  ON public.user_topic_boundaries (user_id, active);

CREATE UNIQUE INDEX uq_active_stage_boundary
  ON public.user_topic_boundaries (user_id, stage_key)
  WHERE active = true AND stage_key IS NOT NULL;