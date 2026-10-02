CREATE TABLE public.user_memory_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  note text NOT NULL CHECK (length(note) BETWEEN 1 AND 300),
  source text NOT NULL DEFAULT 'insight_correction',
  source_message_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_memory_notes_user ON public.user_memory_notes (user_id, active, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_memory_notes TO authenticated;
GRANT ALL ON public.user_memory_notes TO service_role;
ALTER TABLE public.user_memory_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own read" ON public.user_memory_notes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own insert" ON public.user_memory_notes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own update" ON public.user_memory_notes FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own delete" ON public.user_memory_notes FOR DELETE TO authenticated USING (user_id = auth.uid());