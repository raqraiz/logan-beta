-- Together step 1: consent + daily cached, thresholded aggregates.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS together_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS together_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS together_consent_version text;

-- Normalize symptom names: case, spacing, simple plurals merged.
CREATE OR REPLACE FUNCTION public.together_norm(_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN n IS NULL OR n = '' THEN NULL
    WHEN length(n) > 4 AND n ~ 'ies$' THEN regexp_replace(n, 'ies$', 'y')
    WHEN length(n) > 3 AND n ~ 's$' AND n !~ '(ss|us|is)$' THEN regexp_replace(n, 's$', '')
    ELSE n END
  FROM (SELECT regexp_replace(lower(btrim(coalesce(_name, ''))), '\s+', ' ', 'g') AS n) x
$$;

-- Life-stage bucket for a participant (current stage).
CREATE OR REPLACE FUNCTION public.together_stage(_life_stage text, _due date, _lmp date, _pp date)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _life_stage IN ('cycling','irregular') THEN 'cycle'
    WHEN _life_stage = 'pregnant' THEN
      CASE
        WHEN coalesce((current_date - _lmp), 280 - (_due - current_date)) IS NULL THEN 'pregnant'
        WHEN coalesce((current_date - _lmp), 280 - (_due - current_date)) < 98 THEN 'pregnant_t1'
        WHEN coalesce((current_date - _lmp), 280 - (_due - current_date)) < 196 THEN 'pregnant_t2'
        ELSE 'pregnant_t3' END
    WHEN _life_stage = 'postpartum' THEN
      CASE
        WHEN _pp IS NULL THEN 'postpartum'
        WHEN current_date - _pp < 42 THEN 'postpartum_0_6w'
        WHEN current_date - _pp < 183 THEN 'postpartum_6w_6m'
        WHEN current_date - _pp < 365 THEN 'postpartum_6_12m'
        ELSE 'postpartum_12m_plus' END
    WHEN _life_stage = 'perimenopause' THEN 'perimenopause'
    WHEN _life_stage = 'menopause' THEN 'menopause'
    ELSE coalesce(_life_stage, 'unknown') END
$$;

-- Cache. Locked: no client policies; read only via security-definer functions.
CREATE TABLE public.together_daily_aggregates (
  id bigserial PRIMARY KEY,
  computed_on date NOT NULL,
  cohort_kind text NOT NULL,       -- everyone | stage | cycle_day
  cohort_key text NOT NULL,        -- 'all' | stage bucket | centre cycle day
  cohort_women integer NOT NULL,   -- always >= 10
  symptom text NOT NULL,           -- normalized name
  women_band text NOT NULL,        -- exact | few
  women_count integer,             -- only when band = exact (>= 10)
  day_shares jsonb,                -- {cycle_day: share}, only when women_count >= 10
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.together_daily_aggregates TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.together_daily_aggregates_id_seq TO service_role;
ALTER TABLE public.together_daily_aggregates ENABLE ROW LEVEL SECURITY;
CREATE INDEX together_agg_lookup ON public.together_daily_aggregates (cohort_kind, cohort_key);

CREATE OR REPLACE FUNCTION public.refresh_together_aggregates()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  CREATE TEMP TABLE _t ON COMMIT DROP AS
  WITH consenting AS (
    SELECT pr.id AS user_id,
           together_stage(pa.life_stage, pa.due_date, pa.pregnancy_lmp, pa.postpartum_start_date) AS stage
    FROM profiles pr
    LEFT JOIN LATERAL (SELECT * FROM participants p WHERE p.user_id = pr.id ORDER BY p.created_at DESC LIMIT 1) pa ON true
    WHERE pr.together_consent = true
  ),
  builtin AS (
    SELECT DISTINCT together_norm(cs.name) AS n
    FROM community_symptoms cs
    WHERE cs.deleted_at IS NULL AND cs.status = 'approved'
      AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = cs.added_by AND r.role IN ('admin','super_admin'))
  ),
  raw AS (
    SELECT c.user_id, c.stage, sl.cycle_day,
           together_norm(CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' ELSE e->>'name' END) AS symptom
    FROM symptom_logs sl
    JOIN consenting c ON c.user_id = sl.user_id
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(sl.symptoms) = 'array' THEN sl.symptoms ELSE '[]'::jsonb END) e
    WHERE sl.logged_at >= now() - interval '90 days'
  ),
  custom_ok AS (
    SELECT symptom FROM raw WHERE symptom NOT IN (SELECT n FROM builtin WHERE n IS NOT NULL)
    GROUP BY symptom HAVING count(DISTINCT user_id) >= 10
  )
  SELECT * FROM raw
  WHERE symptom IS NOT NULL
    AND (symptom IN (SELECT n FROM builtin) OR symptom IN (SELECT symptom FROM custom_ok));

  -- Cohort membership: (kind, key, user, symptom, cycle_day)
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
END $$;
REVOKE ALL ON FUNCTION public.refresh_together_aggregates() FROM PUBLIC, anon, authenticated;

-- Requester-facing read: aggregates only, no rows or IDs.
CREATE OR REPLACE FUNCTION public.get_together_aggregates()
RETURNS TABLE(filter text, cohort_key text, symptom text, women_band text, women_count integer, day_shares jsonb, computed_on date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _stage text; _day int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT together_stage(p.life_stage, p.due_date, p.pregnancy_lmp, p.postpartum_start_date),
         CASE WHEN p.last_period_start IS NOT NULL THEN (current_date - p.last_period_start) + 1 END
    INTO _stage, _day
  FROM participants p WHERE p.user_id = auth.uid() ORDER BY p.created_at DESC LIMIT 1;
  RETURN QUERY
  SELECT a.cohort_kind, a.cohort_key, a.symptom, a.women_band, a.women_count, a.day_shares, a.computed_on
  FROM together_daily_aggregates a
  WHERE a.cohort_kind = 'everyone'
     OR (a.cohort_kind = 'stage' AND a.cohort_key = _stage)
     OR (a.cohort_kind = 'cycle_day' AND _stage = 'cycle' AND a.cohort_key = _day::text);
END $$;
REVOKE ALL ON FUNCTION public.get_together_aggregates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_together_aggregates() TO authenticated;

-- Admin read: totals only.
CREATE OR REPLACE FUNCTION public.admin_together_totals()
RETURNS TABLE(cohort_kind text, cohort_key text, cohort_women integer, symptom text, women_band text, women_count integer, computed_on date, consenting_women bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT a.cohort_kind, a.cohort_key, a.cohort_women, a.symptom, a.women_band, a.women_count, a.computed_on,
         (SELECT count(*) FROM profiles WHERE together_consent)
  FROM together_daily_aggregates a ORDER BY a.cohort_kind, a.cohort_key, a.women_count DESC NULLS LAST;
END $$;
REVOKE ALL ON FUNCTION public.admin_together_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_together_totals() TO authenticated;

-- Admins lose raw symptom-log reads; activity metrics get timestamps only (no symptom content).
DROP POLICY IF EXISTS "Admins can view all symptom logs" ON public.symptom_logs;
CREATE OR REPLACE FUNCTION public.admin_symptom_log_activity(_from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL)
RETURNS TABLE(user_id uuid, logged_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY SELECT s.user_id, s.logged_at FROM symptom_logs s
  WHERE (_from IS NULL OR s.logged_at >= _from) AND (_to IS NULL OR s.logged_at <= _to)
  ORDER BY s.logged_at;
END $$;
REVOKE ALL ON FUNCTION public.admin_symptom_log_activity(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_symptom_log_activity(timestamptz, timestamptz) TO authenticated;

-- Daily refresh at 03:15 UTC.
SELECT cron.schedule('together-daily-aggregates', '15 3 * * *', $$SELECT public.refresh_together_aggregates()$$);
SELECT public.refresh_together_aggregates();