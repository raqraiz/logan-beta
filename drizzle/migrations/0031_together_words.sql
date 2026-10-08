-- Together words: a woman's own symptom words can appear in Together right away,
-- after a server-side AI check. Counts are bucketed on the server (under 3 / 3 to 9 / 10+).
-- Custom words never reach the daily aggregates or the pairs cache. They only reach
-- Together through get_together_words(). Consent version "together-v2" is required to share.

-- ---------------------------------------------------------------------------
-- 1. Her words. Written only by the edge function and triggers, never by the phone.
-- ---------------------------------------------------------------------------
CREATE TABLE public.together_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_key text NOT NULL,        -- together_norm of the name as logged
  original_word text NOT NULL,     -- the name as logged
  word text NOT NULL,              -- the name she uses now (after a rename)
  word_key text NOT NULL,          -- together_norm(word): what women are counted on
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','shared','private','rejected')),
  reject_category text,
  kind text NOT NULL DEFAULT 'log' CHECK (kind IN ('log','existing','rename')),
  checked_at timestamptz,          -- set only when the AI check gave an answer
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_key)
);
CREATE INDEX together_words_shared_idx ON public.together_words (word_key) WHERE status = 'shared';
GRANT SELECT ON public.together_words TO authenticated;
GRANT ALL ON public.together_words TO service_role;
ALTER TABLE public.together_words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own words read" ON public.together_words FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Reports against a word (by its key). One per woman per word, same reasons as tips.
CREATE TABLE public.together_word_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word_key text NOT NULL,
  reporter_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('unsafe','off_topic','advertising','other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (word_key, reporter_id)
);
GRANT SELECT, DELETE ON public.together_word_reports TO authenticated;
GRANT ALL ON public.together_word_reports TO service_role;
ALTER TABLE public.together_word_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own word reports read" ON public.together_word_reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());

-- Review state per word. Locked: read only through functions.
CREATE TABLE public.together_word_review (
  word_key text PRIMARY KEY,
  report_count integer NOT NULL DEFAULT 0,
  needs_review boolean NOT NULL DEFAULT false,
  blocked boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz
);
GRANT ALL ON public.together_word_review TO service_role;
ALTER TABLE public.together_word_review ENABLE ROW LEVEL SECURITY;

-- Counts-only analytics. No user column, day only. Written by database functions only.
CREATE TABLE public.together_word_events (
  id bigserial PRIMARY KEY,
  event text NOT NULL CHECK (event IN ('word_submitted','word_shared','word_rejected','word_reported','word_hidden','consent_v2_kept','consent_v2_left')),
  reason text CHECK (reason IS NULL OR reason IN ('name','place','number','link','contact','slur','gibberish','too_short','too_long','all_caps','blocked_term','not_words','daily_limit','check_failed','retired','removed_by_review','other')),
  day date NOT NULL DEFAULT current_date
);
CREATE INDEX together_word_events_day_idx ON public.together_word_events (day, event);
GRANT ALL ON public.together_word_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.together_word_events_id_seq TO service_role;
ALTER TABLE public.together_word_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._log_together_event(_event text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.together_word_events (event, reason) VALUES (_event, _reason);
$$;
REVOKE ALL ON FUNCTION public._log_together_event(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._log_together_event(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Symptom library lookup: canonical entries, aliases and retired ones, by name.
--    One source of truth for the daily jobs and for the word check.
-- ---------------------------------------------------------------------------
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
  all_map AS (SELECT * FROM al_map UNION ALL SELECT * FROM cs_map)
  SELECT DISTINCT ON (m.src) m.src, m.canonical, m.retired
  FROM all_map m WHERE m.src IS NOT NULL AND m.src <> ''
  ORDER BY m.src, m.pri, m.retired;
$$;
REVOKE ALL ON FUNCTION public.together_library_map() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.together_library_map() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Daily aggregates and pairs: library entries only. Never a custom word.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_together_aggregates()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  CREATE TEMP TABLE _t ON COMMIT DROP AS
  WITH consenting AS (
    SELECT pr.id AS user_id,
           together_stage(pa.life_stage, pa.due_date, pa.pregnancy_lmp, pa.postpartum_start_date) AS stage
    FROM profiles pr
    LEFT JOIN LATERAL (SELECT * FROM participants p WHERE p.user_id = pr.id ORDER BY p.created_at DESC LIMIT 1) pa ON true
    WHERE pr.together_consent = true
  ),
  lib AS (SELECT m.src, together_norm(m.canonical) AS sym FROM together_library_map() m WHERE NOT m.retired)
  SELECT c.user_id, c.stage, sl.cycle_day, lib.sym AS symptom
  FROM symptom_logs sl
  JOIN consenting c ON c.user_id = sl.user_id
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(sl.symptoms) = 'array' THEN sl.symptoms ELSE '[]'::jsonb END) e
  JOIN lib ON lib.src = together_norm(CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' ELSE e->>'name' END)
  WHERE sl.logged_at >= now() - interval '90 days';

  CREATE TEMP TABLE _m ON COMMIT DROP AS
  SELECT 'everyone'::text kind, 'all'::text ckey, user_id, symptom, cycle_day FROM _t
  UNION ALL
  SELECT 'stage', stage, user_id, symptom, cycle_day FROM _t WHERE stage IS NOT NULL
  UNION ALL
  SELECT 'cycle_day', d::text, user_id, symptom, cycle_day
  FROM _t CROSS JOIN generate_series(1, 60) d
  WHERE stage = 'cycle' AND cycle_day IS NOT NULL AND abs(cycle_day - d) <= 3;

  DELETE FROM together_daily_aggregates WHERE true;

  INSERT INTO together_daily_aggregates (computed_on, cohort_kind, cohort_key, cohort_women, symptom, women_band, women_count, day_shares)
  WITH cohort AS (
    SELECT kind, ckey, count(DISTINCT user_id) w FROM _m GROUP BY 1,2 HAVING count(DISTINCT user_id) >= 10
  ),
  sym AS (
    SELECT m.kind, m.ckey, m.symptom, count(DISTINCT m.user_id) w
    FROM _m m JOIN cohort c USING (kind, ckey)
    GROUP BY 1,2,3 HAVING count(DISTINCT m.user_id) >= 3
  ),
  days AS (
    SELECT m.kind, m.ckey, m.symptom,
           jsonb_object_agg(m.cycle_day::text, round(m.n::numeric / m.tot, 4)) shares
    FROM (
      SELECT kind, ckey, symptom, cycle_day, count(*) n,
             sum(count(*)) OVER (PARTITION BY kind, ckey, symptom) tot
      FROM _m WHERE cycle_day IS NOT NULL GROUP BY 1,2,3,4
    ) m GROUP BY 1,2,3
  )
  SELECT current_date, s.kind, s.ckey, c.w, s.symptom,
         CASE WHEN s.w >= 10 THEN 'exact' ELSE 'few' END,
         CASE WHEN s.w >= 10 THEN s.w END,
         CASE WHEN s.w >= 10 THEN d.shares END
  FROM sym s JOIN cohort c USING (kind, ckey)
  LEFT JOIN days d USING (kind, ckey, symptom);
END $function$;

CREATE OR REPLACE FUNCTION public.refresh_together_pairs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.together_daily_pairs WHERE computed_on IS NOT NULL;
  INSERT INTO public.together_daily_pairs (symptom_a, symptom_b, women_count, computed_on)
  WITH lib AS (SELECT m.src, together_norm(m.canonical) AS sym FROM public.together_library_map() m WHERE NOT m.retired),
  raw AS (
    SELECT DISTINCT sl.user_id,
      (sl.logged_at AT TIME ZONE COALESCE(tz.name, 'UTC'))::date AS local_day,
      lib.sym AS symptom
    FROM public.symptom_logs sl
    JOIN public.profiles pr ON pr.id = sl.user_id AND pr.together_consent = true
    LEFT JOIN LATERAL (SELECT p.timezone FROM public.participants p WHERE p.user_id = sl.user_id ORDER BY p.created_at DESC LIMIT 1) pa ON true
    LEFT JOIN pg_timezone_names tz ON tz.name = pa.timezone
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(sl.symptoms) = 'array' THEN sl.symptoms ELSE '[]'::jsonb END) e
    JOIN lib ON lib.src = together_norm(CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' ELSE e->>'name' END)
    WHERE sl.logged_at >= now() - interval '90 days' AND sl.logged_at <= now()
      AND (jsonb_typeof(e) = 'string' OR jsonb_typeof(e->'severity') IS DISTINCT FROM 'number' OR (e->>'severity')::numeric >= 0)
  )
  SELECT a.symptom, b.symptom, count(DISTINCT a.user_id)::integer, current_date
  FROM raw a JOIN raw b ON a.user_id = b.user_id AND a.local_day = b.local_day AND a.symptom < b.symptom
  WHERE a.symptom IS NOT NULL AND a.symptom <> '' AND b.symptom IS NOT NULL AND b.symptom <> ''
  GROUP BY a.symptom, b.symptom HAVING count(DISTINCT a.user_id) >= 10;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_together_pairs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_together_pairs() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. What women see: live word counts, bucketed on the server.
--    Only the label, or the count when it is 10 or more. Never user IDs.
--    Words from women under 3 carry no metadata at all (just the word and its label).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_together_words()
RETURNS TABLE(word text, label text, women_count integer, mine boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN QUERY
  WITH lib AS MATERIALIZED (SELECT m.src FROM together_library_map() m),
  ok AS (
    SELECT w.word_key, w.word AS w_word, w.user_id
    FROM together_words w
    JOIN profiles p ON p.id = w.user_id AND p.together_consent = true AND p.together_consent_version = 'together-v2'
    WHERE w.status = 'shared'
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
END $$;
REVOKE ALL ON FUNCTION public.get_together_words() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_together_words() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Reporting: same reasons and flow as tips. 3 reports hide the word for everyone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_word(_word text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _key text := together_norm(_word); _n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _reason NOT IN ('unsafe','off_topic','advertising','other') THEN RAISE EXCEPTION 'bad_reason'; END IF;
  IF _key IS NULL OR NOT EXISTS (
    SELECT 1 FROM together_words w JOIN profiles p ON p.id = w.user_id AND p.together_consent AND p.together_consent_version = 'together-v2'
    WHERE w.word_key = _key AND w.status = 'shared') THEN RAISE EXCEPTION 'not_found'; END IF;
  INSERT INTO together_word_reports (word_key, reporter_id, reason) VALUES (_key, auth.uid(), _reason)
  ON CONFLICT (word_key, reporter_id) DO NOTHING;
  IF FOUND THEN
    SELECT count(*)::int INTO _n FROM together_word_reports WHERE word_key = _key;
    INSERT INTO together_word_review (word_key, report_count, needs_review) VALUES (_key, _n, true)
    ON CONFLICT (word_key) DO UPDATE SET report_count = EXCLUDED.report_count, needs_review = true;
    PERFORM _log_together_event('word_reported', NULL);
    IF _n = 3 THEN PERFORM _log_together_event('word_hidden', NULL); END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.report_word(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_word(text, text) TO authenticated;

-- Admin: the word, report reasons, report count and status only. No author, ever.
CREATE OR REPLACE FUNCTION public.admin_word_queue()
RETURNS TABLE(word text, status text, report_count integer, reasons text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT (SELECT mode() WITHIN GROUP (ORDER BY w.word) FROM together_words w WHERE w.word_key = rv.word_key AND w.status = 'shared'),
         CASE WHEN rv.report_count >= 3 THEN 'hidden' ELSE 'reported' END,
         rv.report_count,
         ARRAY(SELECT r.reason FROM together_word_reports r WHERE r.word_key = rv.word_key)
  FROM together_word_review rv
  WHERE rv.needs_review AND NOT rv.blocked
    AND EXISTS (SELECT 1 FROM together_words w WHERE w.word_key = rv.word_key AND w.status = 'shared')
  ORDER BY rv.report_count DESC;
END $$;

-- approve: clears reports and the review flag. remove: the word becomes "rejected" for everyone who used it;
-- each woman keeps it privately in "Your words".
CREATE OR REPLACE FUNCTION public.admin_review_word(_word text, _action text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _key text := together_norm(_word); _n int := 0;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _action = 'approve' THEN
    DELETE FROM together_word_reports WHERE word_key = _key;
    INSERT INTO together_word_review (word_key, report_count, needs_review, blocked, reviewed_at) VALUES (_key, 0, false, false, now())
    ON CONFLICT (word_key) DO UPDATE SET report_count = 0, needs_review = false, blocked = false, reviewed_at = now();
    RETURN 1;
  ELSIF _action = 'remove' THEN
    UPDATE together_words SET status = 'rejected', reject_category = 'removed_by_review', updated_at = now()
    WHERE word_key = _key AND status = 'shared';
    GET DIAGNOSTICS _n = ROW_COUNT;
    INSERT INTO together_word_review (word_key, report_count, needs_review, blocked, reviewed_at) VALUES (_key, 0, false, true, now())
    ON CONFLICT (word_key) DO UPDATE SET needs_review = false, blocked = true, reviewed_at = now();
    RETURN _n;
  END IF;
  RAISE EXCEPTION 'bad_action';
END $$;

CREATE OR REPLACE FUNCTION public.admin_together_word_event_totals(_days integer DEFAULT 30)
RETURNS TABLE(event text, reason text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT e.event, e.reason, count(*) FROM together_word_events e
  WHERE e.day >= current_date - GREATEST(1, LEAST(_days, 365)) GROUP BY e.event, e.reason ORDER BY e.event, e.reason;
END $$;

REVOKE ALL ON FUNCTION public.admin_word_queue(), public.admin_review_word(text, text), public.admin_together_word_event_totals(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_word_queue(), public.admin_review_word(text, text), public.admin_together_word_event_totals(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Consent v2. Existing members keep sharing logs under the old consent until they answer.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.keep_together_v2()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE profiles SET together_consent = true, together_consent_at = now(), together_consent_version = 'together-v2'
  WHERE id = auth.uid() AND together_consent = true AND together_consent_version IS DISTINCT FROM 'together-v2';
  IF FOUND THEN PERFORM _log_together_event('consent_v2_kept', NULL); RETURN true; END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.leave_together_v2()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE profiles SET together_consent = false WHERE id = auth.uid() AND together_consent = true;
  IF FOUND THEN PERFORM _log_together_event('consent_v2_left', NULL); RETURN true; END IF;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.keep_together_v2(), public.leave_together_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.keep_together_v2(), public.leave_together_v2() TO authenticated;

-- Leaving Together (from anywhere) makes her words private at once. Nothing is deleted.
-- Reports she filed on other women's words stay.
CREATE OR REPLACE FUNCTION public.trg_together_leave_words()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE together_words SET status = 'private', reject_category = 'left', updated_at = now()
  WHERE user_id = NEW.id AND status IN ('shared','pending');
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS together_leave_words ON public.profiles;
CREATE TRIGGER together_leave_words AFTER UPDATE OF together_consent ON public.profiles
  FOR EACH ROW WHEN (OLD.together_consent = true AND NEW.together_consent = false)
  EXECUTE FUNCTION public.trg_together_leave_words();

-- ---------------------------------------------------------------------------
-- 7. Keep her words in step with her own data.
-- ---------------------------------------------------------------------------
-- Rename or remove in "Your words".
CREATE OR REPLACE FUNCTION public.trg_prefs_sync_words()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _orig text; _k text;
BEGIN
  IF TG_OP = 'DELETE' THEN _uid := OLD.user_id; _orig := OLD.original_word; ELSE _uid := NEW.user_id; _orig := NEW.original_word; END IF;
  _k := together_norm(_orig);
  IF TG_OP <> 'DELETE' AND NEW.removed THEN
    UPDATE together_words SET status = 'private', reject_category = 'removed', updated_at = now()
    WHERE user_id = _uid AND source_key = _k;
  ELSIF TG_OP <> 'DELETE' AND NEW.new_name IS NOT NULL AND btrim(NEW.new_name) <> '' THEN
    UPDATE together_words SET word = btrim(NEW.new_name), word_key = together_norm(NEW.new_name), status = 'pending',
           reject_category = NULL, checked_at = NULL, kind = 'rename', updated_at = now()
    WHERE user_id = _uid AND source_key = _k;
  ELSE
    UPDATE together_words SET word = original_word, word_key = together_norm(original_word), status = 'pending',
           reject_category = NULL, checked_at = NULL, updated_at = now()
    WHERE user_id = _uid AND source_key = _k AND (reject_category = 'removed' OR word_key <> together_norm(original_word));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS user_word_prefs_sync_words ON public.user_word_prefs;
CREATE TRIGGER user_word_prefs_sync_words AFTER INSERT OR UPDATE OR DELETE ON public.user_word_prefs
  FOR EACH ROW EXECUTE FUNCTION public.trg_prefs_sync_words();

-- When her last log with a word is deleted (or edited away), it stops counting.
CREATE OR REPLACE FUNCTION public._symptoms_has_word(_s jsonb, _k text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_s) = 'array' THEN _s ELSE '[]'::jsonb END) e
    WHERE together_norm(CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' ELSE e->>'name' END) = _k)
$$;

CREATE OR REPLACE FUNCTION public.trg_logs_sync_words()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _k text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM together_words WHERE user_id = OLD.user_id AND status IN ('shared','pending')) THEN RETURN NULL; END IF;
  FOR _k IN
    SELECT DISTINCT together_norm(CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' ELSE e->>'name' END)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(OLD.symptoms) = 'array' THEN OLD.symptoms ELSE '[]'::jsonb END) e
  LOOP
    CONTINUE WHEN _k IS NULL OR _k = '';
    CONTINUE WHEN TG_OP = 'UPDATE' AND _symptoms_has_word(NEW.symptoms, _k);
    IF NOT EXISTS (SELECT 1 FROM symptom_logs l WHERE l.user_id = OLD.user_id AND l.id <> OLD.id AND _symptoms_has_word(l.symptoms, _k)) THEN
      UPDATE together_words SET status = 'private', reject_category = 'no_logs', updated_at = now()
      WHERE user_id = OLD.user_id AND source_key = _k AND status IN ('shared','pending');
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS symptom_logs_sync_words_del ON public.symptom_logs;
CREATE TRIGGER symptom_logs_sync_words_del AFTER DELETE ON public.symptom_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_logs_sync_words();
DROP TRIGGER IF EXISTS symptom_logs_sync_words_upd ON public.symptom_logs;
CREATE TRIGGER symptom_logs_sync_words_upd AFTER UPDATE OF symptoms ON public.symptom_logs
  FOR EACH ROW WHEN (OLD.symptoms IS DISTINCT FROM NEW.symptoms)
  EXECUTE FUNCTION public.trg_logs_sync_words();

-- Account deletion: her words and the reports she filed go; report counts are recomputed.
CREATE OR REPLACE FUNCTION public.purge_together_words(_uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _keys text[];
BEGIN
  DELETE FROM together_words WHERE user_id = _uid;
  SELECT array_agg(word_key) INTO _keys FROM together_word_reports WHERE reporter_id = _uid;
  DELETE FROM together_word_reports WHERE reporter_id = _uid;
  IF _keys IS NOT NULL THEN
    UPDATE together_word_review rv SET report_count = (SELECT count(*) FROM together_word_reports r WHERE r.word_key = rv.word_key)
    WHERE rv.word_key = ANY(_keys);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.purge_together_words(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_together_words(uuid) TO service_role;

-- Custom words are out of the daily totals and pairs from now on.
SELECT public.refresh_together_aggregates();
