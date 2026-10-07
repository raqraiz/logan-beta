CREATE TABLE public.user_word_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  original_word text NOT NULL,
  new_name text,
  removed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, original_word)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_word_prefs TO authenticated;
GRANT ALL ON public.user_word_prefs TO service_role;
ALTER TABLE public.user_word_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own word prefs select" ON public.user_word_prefs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own word prefs insert" ON public.user_word_prefs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own word prefs update" ON public.user_word_prefs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own word prefs delete" ON public.user_word_prefs FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER user_word_prefs_updated BEFORE UPDATE ON public.user_word_prefs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();