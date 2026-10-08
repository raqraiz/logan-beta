-- Words in any language that clearly mean an existing library symptom (e.g. a Hebrew "headache")
-- count toward that library entry in Together. Her logs are never changed.
-- Locked table: only the word-check edge function (service role) reads or writes it. No UI.
-- Fix a wrong mapping with: UPDATE public.together_word_map SET disabled = true WHERE word_key = public.together_norm('<the word>');
CREATE TABLE IF NOT EXISTS public.together_word_map (
  word_key text PRIMARY KEY,                 -- together_norm of the word as logged
  canonical_name text NOT NULL,              -- library entry NAME; resolved at read time so merges and retirements are followed
  disabled boolean NOT NULL DEFAULT false,   -- true = ignore this mapping and never map this word again
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.together_word_map ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: the service role bypasses RLS, everyone else is denied.
REVOKE ALL ON public.together_word_map FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.together_word_map TO service_role;

-- Her already-shared words get one cross-language check; this marks which are done.
ALTER TABLE public.together_words ADD COLUMN IF NOT EXISTS map_checked_at timestamptz;

-- Same library lookup as before, plus mapped words as the lowest-priority source.
-- A mapping counts toward the entry its NAME resolves to today (following merges, same as the rest
-- of the library). If that entry is retired or gone, the mapping simply stops counting.
CREATE OR REPLACE FUNCTION public.together_library_map()
RETURNS TABLE(src text, canonical text, retired boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE
  lib AS (
    SELECT cs.id, cs.name FROM community_symptoms cs
    WHERE EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = cs.added_by AND r.role IN ('admin','super_admin'))
       OR together_norm(cs.name) IN (SELECT together_norm(a.main_name) FROM symptom_aliases a)
  ),
  walk(start_id, cur_id, depth) AS (
    SELECT id, id, 0 FROM lib
    UNION ALL
    SELECT w.start_id, c.canonical_id, w.depth + 1
    FROM walk w JOIN community_symptoms c ON c.id = w.cur_id
    WHERE c.status = 'merged' AND c.canonical_id IS NOT NULL AND w.depth < 6
  ),
  final AS (SELECT DISTINCT ON (start_id) start_id, cur_id FROM walk ORDER BY start_id, depth DESC),
  cs_map AS (
    SELECT together_norm(l.name) AS src,
           CASE WHEN f.status = 'approved' AND f.deleted_at IS NULL THEN f.name ELSE l.name END AS canonical,
           NOT (f.status = 'approved' AND f.deleted_at IS NULL) AS retired,
           2 AS pri
    FROM lib l JOIN final fi ON fi.start_id = l.id JOIN community_symptoms f ON f.id = fi.cur_id
  ),
  al_map AS (
    SELECT together_norm(a.alias) AS src, a.main_name AS canonical, false AS retired, 1 AS pri FROM symptom_aliases a
    UNION ALL
    SELECT together_norm(a.main_name), a.main_name, false, 1 FROM symptom_aliases a
  ),
  wm_map AS (
    SELECT DISTINCT ON (w.word_key) w.word_key AS src, b.canonical, false AS retired, 3 AS pri
    FROM together_word_map w
    JOIN (SELECT * FROM al_map UNION ALL SELECT * FROM cs_map) b ON b.src = together_norm(w.canonical_name)
    WHERE NOT w.disabled AND NOT b.retired
    ORDER BY w.word_key, b.pri
  ),
  all_map AS (SELECT * FROM al_map UNION ALL SELECT * FROM cs_map UNION ALL SELECT * FROM wm_map)
  SELECT DISTINCT ON (m.src) m.src, m.canonical, m.retired
  FROM all_map m WHERE m.src IS NOT NULL AND m.src <> ''
  ORDER BY m.src, m.pri, m.retired;
$$;
REVOKE ALL ON FUNCTION public.together_library_map() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.together_library_map() TO service_role;
