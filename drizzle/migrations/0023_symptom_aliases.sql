CREATE TABLE public.symptom_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias text NOT NULL UNIQUE,
  main_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.symptom_aliases TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.symptom_aliases TO authenticated;
GRANT ALL ON public.symptom_aliases TO service_role;
ALTER TABLE public.symptom_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read aliases" ON public.symptom_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage aliases" ON public.symptom_aliases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.together_canonical(_name text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT together_norm(a.main_name) FROM symptom_aliases a WHERE together_norm(a.alias) = together_norm(_name) LIMIT 1),
    together_norm(_name))
$$;

CREATE OR REPLACE FUNCTION public.refresh_together_aggregates()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT DISTINCT together_canonical(cs.name) AS n
    FROM community_symptoms cs
    WHERE cs.deleted_at IS NULL AND cs.status = 'approved'
      AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = cs.added_by AND r.role IN ('admin','super_admin'))
    UNION
    SELECT DISTINCT together_norm(a.main_name) FROM symptom_aliases a
  ),
  raw AS (
    SELECT c.user_id, c.stage, sl.cycle_day,
           together_canonical(CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' ELSE e->>'name' END) AS symptom
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