CREATE TABLE public.together_daily_pairs (
  symptom_a text NOT NULL,
  symptom_b text NOT NULL,
  women_count integer NOT NULL,
  computed_on date NOT NULL DEFAULT current_date,
  PRIMARY KEY (symptom_a, symptom_b)
);
GRANT ALL ON public.together_daily_pairs TO service_role;
ALTER TABLE public.together_daily_pairs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.refresh_together_pairs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.together_daily_pairs WHERE computed_on IS NOT NULL;
  INSERT INTO public.together_daily_pairs (symptom_a, symptom_b, women_count, computed_on)
  WITH raw AS (
    SELECT DISTINCT sl.user_id,
      (sl.logged_at AT TIME ZONE COALESCE(tz.name, 'UTC'))::date AS local_day,
      public.together_canonical(CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' ELSE e->>'name' END) AS symptom
    FROM public.symptom_logs sl
    JOIN public.profiles pr ON pr.id = sl.user_id AND pr.together_consent = true
    LEFT JOIN LATERAL (SELECT p.timezone FROM public.participants p WHERE p.user_id = sl.user_id ORDER BY p.created_at DESC LIMIT 1) pa ON true
    LEFT JOIN pg_timezone_names tz ON tz.name = pa.timezone
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(sl.symptoms) = 'array' THEN sl.symptoms ELSE '[]'::jsonb END) e
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

CREATE TRIGGER refresh_daily_together_pairs
AFTER INSERT ON public.together_daily_aggregates
FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_together_pairs();

CREATE OR REPLACE FUNCTION public.get_together_pairs()
RETURNS TABLE (symptom_a text, symptom_b text, women_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN QUERY SELECT p.symptom_a, p.symptom_b, p.women_count
  FROM public.together_daily_pairs p WHERE p.women_count >= 10 ORDER BY p.women_count DESC, p.symptom_a, p.symptom_b;
END;
$$;
REVOKE ALL ON FUNCTION public.get_together_pairs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_together_pairs() TO authenticated, service_role;
COMMENT ON TABLE public.together_daily_pairs IS 'Daily 90-day aggregate only. Each same-woman same-local-day pair requires 10 consenting women. No user IDs or individual logs are stored or returned. Refreshed atomically by the existing Together refresh.';