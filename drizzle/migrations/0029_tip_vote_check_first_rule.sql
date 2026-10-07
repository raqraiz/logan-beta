CREATE OR REPLACE FUNCTION public.tip_own_cycles(_user_id uuid, _symptom text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH part AS (
    SELECT id, last_period_start FROM participants WHERE user_id = _user_id ORDER BY created_at DESC LIMIT 1
  ), anchors AS (
    SELECT cycle_start_date AS d FROM cycle_history WHERE participant_id = (SELECT id FROM part)
    UNION SELECT last_period_start FROM part WHERE last_period_start IS NOT NULL
  ), hits AS (
    SELECT l.logged_at FROM symptom_logs l
    WHERE l.user_id = _user_id AND l.logged_at >= now() - interval '365 days'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(l.symptoms) = 'array' THEN l.symptoms ELSE '[]'::jsonb END) e
                  WHERE lower(public.together_canonical(e->>'name')) = lower(public.together_canonical(_symptom)))
  )
  SELECT count(DISTINCT (SELECT max(a.d) FROM anchors a WHERE a.d <= (h.logged_at + interval '1 day')::date))::int
  FROM hits h;
$$;
REVOKE ALL ON FUNCTION public.tip_own_cycles(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tip_own_cycles(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.toggle_tip_vote(_tip_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _sym text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND together_consent) THEN RAISE EXCEPTION 'not_joined'; END IF;
  SELECT symptom INTO _sym FROM together_tips WHERE id = _tip_id AND status = 'approved';
  IF _sym IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF EXISTS (SELECT 1 FROM together_tip_votes WHERE tip_id = _tip_id AND user_id = auth.uid()) THEN
    DELETE FROM together_tip_votes WHERE tip_id = _tip_id AND user_id = auth.uid();
    RETURN false;
  END IF;
  -- Check-first symptoms: voting needs logs in 2+ real cycles.
  IF _sym ~* '\m(muffled hearing|hearing loss|tinnitus|ringing in (my |the )?ears?|ear ringing)\M'
     AND public.tip_own_cycles(auth.uid(), _sym) < 2 THEN RAISE EXCEPTION 'needs_pattern'; END IF;
  INSERT INTO together_tip_votes (tip_id, user_id) VALUES (_tip_id, auth.uid());
  RETURN true;
END $function$;