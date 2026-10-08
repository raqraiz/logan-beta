-- Feedback topic: a short line about what the feedback is about, written from the cleaned text only,
-- so it is safe for both roles. Used to fill in the reply starter. The health rule is not changed.
-- Safe to re-run.

ALTER TABLE public.user_feedback ADD COLUMN IF NOT EXISTS topic text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_feedback_topic_len') THEN
    ALTER TABLE public.user_feedback ADD CONSTRAINT user_feedback_topic_len CHECK (topic IS NULL OR char_length(topic) <= 120);
  END IF;
END $$;

-- Same list as before, plus topic. Everything else is identical.
DROP FUNCTION IF EXISTS public.admin_feedback_list(text, text);
CREATE FUNCTION public.admin_feedback_list(_tab text, _theme text DEFAULT NULL)
RETURNS TABLE(id uuid, text_shown text, text_state text, first_name text, last_initial text, user_id uuid,
              channel text, theme text, created_at timestamptz, handled boolean, topic text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE sup boolean := has_role(auth.uid(), 'super_admin');
BEGIN
  IF NOT (sup OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _tab NOT IN ('new','handled','all') THEN RAISE EXCEPTION 'invalid tab'; END IF;
  IF _theme IS NOT NULL AND _theme NOT IN ('bug','feature','praise','content','other') THEN RAISE EXCEPTION 'invalid theme'; END IF;
  RETURN QUERY
  SELECT f.id,
         public._feedback_visible_text(f, sup),
         public._feedback_text_state(f),
         nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''),
         CASE WHEN sup THEN nullif(left(btrim(regexp_replace(btrim(coalesce(p.full_name, '')), '^\S+\s*', '')), 1), '') END,
         CASE WHEN sup THEN f.user_id END,
         f.channel, coalesce(f.theme, 'other'), f.created_at, f.handled_at IS NOT NULL,
         f.topic
  FROM user_feedback f LEFT JOIN profiles p ON p.id = f.user_id
  WHERE (_tab = 'all' OR (_tab = 'new' AND f.handled_at IS NULL) OR (_tab = 'handled' AND f.handled_at IS NOT NULL))
    AND (_theme IS NULL OR coalesce(f.theme, 'other') = _theme)
  ORDER BY f.created_at DESC
  LIMIT 300;
END $$;
REVOKE ALL ON FUNCTION public.admin_feedback_list(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_feedback_list(text, text) TO authenticated;

-- Backfill helpers (service role only): rows with no cleaned copy, or a cleaned copy but no topic yet.
-- Rows hidden whole by a failed check ([health detail]) have nothing to take a topic from, so they are skipped.
DROP FUNCTION IF EXISTS public._feedback_needing_clean(integer);
CREATE FUNCTION public._feedback_needing_clean(_limit integer)
RETURNS TABLE(id uuid, message text, message_clean text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, f.message, f.message_clean FROM user_feedback f
  WHERE f.message_clean IS NULL OR (f.topic IS NULL AND f.message_clean <> '[health detail]')
  ORDER BY f.created_at LIMIT _limit
$$;
CREATE OR REPLACE FUNCTION public._feedback_needing_clean_count()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM user_feedback f
  WHERE f.message_clean IS NULL OR (f.topic IS NULL AND f.message_clean <> '[health detail]')
$$;
REVOKE ALL ON FUNCTION public._feedback_needing_clean(integer), public._feedback_needing_clean_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._feedback_needing_clean(integer), public._feedback_needing_clean_count() TO service_role;
