ALTER TABLE public.together_words ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

UPDATE public.together_words SET hidden = true WHERE word ~ '^[^:]{1,40}:\s*\S' AND NOT hidden;

CREATE OR REPLACE FUNCTION public.set_my_word_hidden(_word text, _hidden boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE together_words SET hidden = _hidden
  WHERE user_id = auth.uid() AND word_key = together_norm(_word);
END $$;
REVOKE ALL ON FUNCTION public.set_my_word_hidden(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_word_hidden(text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_together_words()
RETURNS TABLE(word text, label text, women_count integer, mine boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN QUERY
  WITH lib AS MATERIALIZED (SELECT m.src FROM together_library_map() m),
  ok AS (
    SELECT w.word_key, w.word AS w_word, w.user_id
    FROM together_words w
    JOIN profiles p ON p.id = w.user_id AND p.together_consent = true AND p.together_consent_version = 'together-v2'
    WHERE w.status = 'shared'
      AND NOT w.hidden
      AND w.word !~ '^[^:]{1,40}:\s*\S'
      AND w.word_key NOT IN (SELECT l.src FROM lib l)
      AND NOT EXISTS (SELECT 1 FROM together_word_review rv
                      WHERE rv.word_key = w.word_key AND (rv.blocked OR (rv.needs_review AND rv.report_count >= 3)))
      AND NOT EXISTS (SELECT 1 FROM together_word_reports r WHERE r.word_key = w.word_key AND r.reporter_id = auth.uid())
  ),
  agg AS (
    SELECT o.word_key, mode() WITHIN GROUP (ORDER BY o.w_word) AS a_word,
           count(DISTINCT o.user_id)::int AS n, bool_or(o.user_id = auth.uid()) AS a_mine
    FROM ok o GROUP BY o.word_key
  )
  SELECT a.a_word,
         CASE WHEN a.n >= 10 THEN 'exact' WHEN a.n >= 3 THEN 'few' ELSE 'single' END,
         CASE WHEN a.n >= 10 THEN a.n END,
         a.a_mine
  FROM agg a ORDER BY a.n DESC, a.a_word;
END $function$;

INSERT INTO public.community_symptoms (name, added_by, category, status, aliases)
SELECT 'Anger', cs.added_by, 'Mood & mind', 'approved', ARRAY['angry']
FROM public.community_symptoms cs
WHERE cs.name = 'Irritability'
  AND NOT EXISTS (SELECT 1 FROM public.community_symptoms x WHERE lower(btrim(x.name)) = 'anger')
LIMIT 1;

INSERT INTO public.symptom_aliases (alias, main_name) VALUES
  ('angry', 'Anger'),
  ('burn out', 'Fatigue'),
  ('burnout', 'Fatigue')
ON CONFLICT (alias) DO NOTHING;

UPDATE public.community_symptoms
SET aliases = (SELECT array_agg(DISTINCT a) FROM unnest(coalesce(aliases, '{}') || ARRAY['burn out', 'burnout']) a)
WHERE name = 'Fatigue';