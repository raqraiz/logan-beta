-- Faster admin_life_stage_activity(). Same name, same columns, same grants, same admin check, same numbers.
-- Before: "ret" ran a correlated EXISTS against an all-time events list once per woman.
-- Now: events are read once, from the start of the last 30 days (or the earliest day-22 window of a woman
-- who is old enough for the retention check, whichever is earlier), and "kept" is a single join.
CREATE OR REPLACE FUNCTION public.admin_life_stage_activity()
RETURNS TABLE(grp text, users bigint, conflicting bigint, active_7 bigint, active_30 bigint, active_days_30 bigint,
              minutes_30 bigint, sessions_30 bigint, retention_base bigint, retained bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  t date := (now() AT TIME ZONE 'UTC')::date;
  from_day date;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  -- Earliest day any retention window starts (only women old enough to be measured); never later than 30 days ago.
  SELECT least(t - 29, COALESCE(min(((o.onboarded_at + interval '528 hours') AT TIME ZONE 'UTC')::date), t - 29))
    INTO from_day
  FROM public._admin_onboarded_users() o
  WHERE now() - o.onboarded_at >= interval '672 hours';
  RETURN QUERY
  WITH el AS MATERIALIZED (SELECT o.stage AS grp, o.user_id, o.onboarded_at, o.conflicting FROM public._admin_onboarded_users() o),
  ev AS MATERIALIZED (SELECT e.user_id, e.ts, (e.ts AT TIME ZONE 'UTC')::date AS day
         FROM public._admin_user_events((from_day::timestamp AT TIME ZONE 'UTC'), NULL) e),
  act AS (SELECT ev.user_id, bool_or(ev.day BETWEEN t - 6 AND t) AS a7, bool_or(ev.day BETWEEN t - 29 AND t) AS a30
          FROM ev GROUP BY ev.user_id),
  g AS (SELECT ev.user_id, ev.day, ev.ts,
               CASE WHEN lag(ev.ts) OVER w IS NULL OR ev.ts - lag(ev.ts) OVER w > interval '30 minutes' THEN 1 ELSE 0 END AS ns
        FROM ev WHERE ev.day BETWEEN t - 29 AND t
        WINDOW w AS (PARTITION BY ev.user_id, ev.day ORDER BY ev.ts)),
  s AS (SELECT g.user_id, g.day, g.ts,
               sum(g.ns) OVER (PARTITION BY g.user_id, g.day ORDER BY g.ts ROWS UNBOUNDED PRECEDING) AS sid FROM g),
  vis AS (SELECT s.user_id, s.day, s.sid, extract(epoch FROM max(s.ts) - min(s.ts))::numeric / 60 AS mins
          FROM s GROUP BY s.user_id, s.day, s.sid),
  use30 AS (SELECT v.user_id, count(DISTINCT v.day) AS dcount, count(*) AS sess, sum(greatest(1, round(v.mins))) AS mins
            FROM vis v GROUP BY v.user_id),
  elig AS (SELECT el.user_id, el.onboarded_at,
                  ((el.onboarded_at + interval '528 hours') AT TIME ZONE 'UTC')::date AS d_from,
                  ((el.onboarded_at + interval '672 hours') AT TIME ZONE 'UTC')::date AS d_to
           FROM el WHERE now() - el.onboarded_at >= interval '672 hours'),
  kept AS (SELECT DISTINCT x.user_id
           FROM elig x JOIN ev ON ev.user_id = x.user_id AND ev.day BETWEEN x.d_from AND x.d_to),
  ret AS (SELECT el.user_id,
                 (now() - el.onboarded_at >= interval '672 hours') AS eligible_ret,
                 (k.user_id IS NOT NULL) AS kept
          FROM el LEFT JOIN kept k ON k.user_id = el.user_id)
  SELECT el.grp,
         count(*)::bigint,
         count(*) FILTER (WHERE el.conflicting)::bigint,
         count(*) FILTER (WHERE a.a7)::bigint,
         count(*) FILTER (WHERE a.a30)::bigint,
         COALESCE(sum(u.dcount), 0)::bigint,
         COALESCE(sum(u.mins), 0)::bigint,
         COALESCE(sum(u.sess), 0)::bigint,
         count(*) FILTER (WHERE r.eligible_ret)::bigint,
         count(*) FILTER (WHERE r.eligible_ret AND r.kept)::bigint
  FROM el
  LEFT JOIN act a ON a.user_id = el.user_id
  LEFT JOIN use30 u ON u.user_id = el.user_id
  LEFT JOIN ret r ON r.user_id = el.user_id
  GROUP BY el.grp ORDER BY el.grp;
END $$;

REVOKE ALL ON FUNCTION public.admin_life_stage_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_life_stage_activity() TO authenticated, service_role;
