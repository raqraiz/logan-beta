-- Admin activity metrics, computed on the server. Counts only, never user IDs.
-- Symptom logs count as activity again (they stopped when admin_symptom_log_activity went totals-only).
--
-- Definitions are unchanged:
--   user      = onboarded (chat_messages.metadata->>'onboarding_complete' = 'true') and not profiles.is_internal
--   active    = at least one user-initiated action on the UTC day:
--               a chat message she sent (role = 'user'), a symptom log (logged_at),
--               or a click / page_view / tab_switch / widget_interact / "<tab>.<feature>.<action>" event
--   day       = UTC
-- Safe to re-run (CREATE OR REPLACE).

-- ============================================================================
-- Internal helpers. Return user IDs, so NOBODY but the database owner can call them.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._admin_eligible_users()
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id
  FROM profiles p
  WHERE COALESCE(p.is_internal, false) = false
    AND EXISTS (SELECT 1 FROM chat_messages cm
                WHERE cm.user_id = p.id
                  AND (cm.metadata ->> 'onboarding_complete') = 'true')
$$;

-- Every user-initiated action by an eligible user. _from inclusive, _to inclusive, NULL = open.
CREATE OR REPLACE FUNCTION public._admin_user_events(_from timestamptz, _to timestamptz)
RETURNS TABLE(user_id uuid, ts timestamptz, from_chat boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH el AS MATERIALIZED (SELECT e.user_id FROM public._admin_eligible_users() e)
  SELECT m.user_id, m.created_at, true
  FROM chat_messages m JOIN el USING (user_id)
  WHERE m.role = 'user'
    AND (_from IS NULL OR m.created_at >= _from) AND (_to IS NULL OR m.created_at <= _to)
  UNION ALL
  SELECT s.user_id, s.logged_at, false
  FROM symptom_logs s JOIN el USING (user_id)
  WHERE (_from IS NULL OR s.logged_at >= _from) AND (_to IS NULL OR s.logged_at <= _to)
  UNION ALL
  SELECT a.user_id, a.created_at, false
  FROM user_activity_events a JOIN el USING (user_id)
  WHERE (a.event_type IN ('click', 'page_view', 'tab_switch', 'widget_interact')
         OR position('.' IN a.event_type) > 0)
    AND (_from IS NULL OR a.created_at >= _from) AND (_to IS NULL OR a.created_at <= _to)
$$;

REVOKE ALL ON FUNCTION public._admin_eligible_users() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._admin_user_events(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 1. Today's DAU / WAU / MAU (rolling: today, last 7 days, last 30 days, UTC)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_active_users_now()
RETURNS TABLE(dau bigint, wau bigint, mau bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE t date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  WITH ev AS (
    SELECT e.user_id, (e.ts AT TIME ZONE 'UTC')::date AS day
    FROM public._admin_user_events(((t - 29)::timestamp AT TIME ZONE 'UTC'), NULL) e
  )
  SELECT count(DISTINCT ev.user_id) FILTER (WHERE ev.day = t)::bigint,
         count(DISTINCT ev.user_id) FILTER (WHERE ev.day BETWEEN t - 6 AND t)::bigint,
         count(DISTINCT ev.user_id) FILTER (WHERE ev.day BETWEEN t - 29 AND t)::bigint
  FROM ev;
END $$;

-- ============================================================================
-- 2. One row per UTC day in the range: people active, messages she sent, visits.
--    Visits = 30-minute-gap sessions per person per UTC day (a gap of 30 min or more starts a new one).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_daily_activity(_from date, _to date)
RETURNS TABLE(day date, active_users bigint, user_messages bigint, sessions bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from OR _to - _from > 3660 THEN
    RAISE EXCEPTION 'invalid range';
  END IF;
  RETURN QUERY
  WITH ev AS (
    SELECT e.user_id, e.ts, e.from_chat, (e.ts AT TIME ZONE 'UTC')::date AS day
    FROM public._admin_user_events(_from::timestamp AT TIME ZONE 'UTC',
                                   ((_to + 1)::timestamp AT TIME ZONE 'UTC') - interval '1 microsecond') e
  ),
  g AS (
    SELECT ev.day, ev.user_id, ev.from_chat,
           CASE WHEN lag(ev.ts) OVER w IS NULL OR ev.ts - lag(ev.ts) OVER w >= interval '30 minutes'
                THEN 1 ELSE 0 END AS new_session
    FROM ev WINDOW w AS (PARTITION BY ev.day, ev.user_id ORDER BY ev.ts)
  ),
  per_day AS (
    SELECT g.day, count(DISTINCT g.user_id) AS au,
           count(*) FILTER (WHERE g.from_chat) AS msgs, sum(g.new_session) AS sess
    FROM g GROUP BY g.day
  )
  SELECT (_from + i)::date, COALESCE(p.au, 0)::bigint, COALESCE(p.msgs, 0)::bigint, COALESCE(p.sess, 0)::bigint
  FROM generate_series(0, _to - _from) i
  LEFT JOIN per_day p ON p.day = _from + i
  ORDER BY 1;
END $$;

-- ============================================================================
-- 3. Mon-Sun weeks touching the range: days of the range in that week, people active that week.
--    The app picks completed weeks (or the day-weighted fallback) exactly as before.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_weekly_active_users(_from date, _to date)
RETURNS TABLE(week_start date, days_in_range integer, active_users bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from OR _to - _from > 3660 THEN
    RAISE EXCEPTION 'invalid range';
  END IF;
  RETURN QUERY
  WITH ev AS (
    SELECT DISTINCT e.user_id, (e.ts AT TIME ZONE 'UTC')::date AS day
    FROM public._admin_user_events(_from::timestamp AT TIME ZONE 'UTC',
                                   ((_to + 1)::timestamp AT TIME ZONE 'UTC') - interval '1 microsecond') e
  ),
  wk AS (
    SELECT (_from + i) AS d, date_trunc('week', (_from + i)::timestamp)::date AS wk
    FROM generate_series(0, _to - _from) i
  )
  SELECT wk.wk, count(DISTINCT wk.d)::integer, count(DISTINCT ev.user_id)::bigint
  FROM wk LEFT JOIN ev ON ev.day = wk.d
  GROUP BY wk.wk
  ORDER BY wk.wk;
END $$;

-- ============================================================================
-- 4. Distinct people active at least once in the range (denominator for the per-person averages)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_active_users_in_range(_from date, _to date)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from OR _to - _from > 3660 THEN
    RAISE EXCEPTION 'invalid range';
  END IF;
  RETURN (SELECT count(DISTINCT e.user_id)
          FROM public._admin_user_events(_from::timestamp AT TIME ZONE 'UTC',
                                         ((_to + 1)::timestamp AT TIME ZONE 'UTC') - interval '1 microsecond') e);
END $$;

-- ============================================================================
-- 5. Total time spent: per person, a new visit starts after a gap of more than 30 minutes.
--    minutes         = each visit rounded down, at least 1   (Total time spent card)
--    minutes_rounded = each visit rounded to nearest, at least 1   (the "Today" chip)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_time_spent(_from timestamptz, _to timestamptz)
RETURNS TABLE(sessions bigint, minutes bigint, minutes_rounded bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  WITH g AS (
    SELECT e.user_id, e.ts,
           CASE WHEN lag(e.ts) OVER w IS NULL OR e.ts - lag(e.ts) OVER w > interval '30 minutes'
                THEN 1 ELSE 0 END AS ns
    FROM public._admin_user_events(_from, _to) e
    WINDOW w AS (PARTITION BY e.user_id ORDER BY e.ts)
  ),
  s AS (SELECT g.user_id, g.ts, sum(g.ns) OVER (PARTITION BY g.user_id ORDER BY g.ts ROWS UNBOUNDED PRECEDING) AS sid FROM g),
  d AS (SELECT s.user_id, s.sid, extract(epoch FROM max(s.ts) - min(s.ts))::numeric / 60 AS mins
        FROM s GROUP BY s.user_id, s.sid)
  SELECT count(*)::bigint,
         COALESCE(sum(greatest(1, floor(d.mins))), 0)::bigint,
         COALESCE(sum(greatest(1, round(d.mins))), 0)::bigint
  FROM d;
END $$;

-- ============================================================================
-- 6. Engagement by life stage. The app sends which stage each person is in
--    ({"pregnant": ["<id>", ...], ...}); only totals per stage come back.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_life_stage_activity(_groups jsonb)
RETURNS TABLE(grp text, active_7 bigint, active_30 bigint, active_days_30 bigint,
              minutes_30 bigint, sessions_30 bigint, retention_base bigint, retained bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE t date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  WITH el AS (
    SELECT j.key AS grp, u.value::uuid AS user_id
    FROM jsonb_each(_groups) j, jsonb_array_elements_text(j.value) u(value)
    WHERE u.value::uuid IN (SELECT x.user_id FROM public._admin_eligible_users() x)
  ),
  ev AS (
    SELECT e.user_id, e.ts, (e.ts AT TIME ZONE 'UTC')::date AS day
    FROM public._admin_user_events(NULL, NULL) e
    WHERE e.user_id IN (SELECT el.user_id FROM el)
  ),
  act AS (
    SELECT ev.user_id,
           bool_or(ev.day BETWEEN t - 6 AND t) AS a7,
           bool_or(ev.day BETWEEN t - 29 AND t) AS a30
    FROM ev GROUP BY ev.user_id
  ),
  g AS (
    SELECT ev.user_id, ev.day, ev.ts,
           CASE WHEN lag(ev.ts) OVER w IS NULL OR ev.ts - lag(ev.ts) OVER w > interval '30 minutes'
                THEN 1 ELSE 0 END AS ns
    FROM ev WHERE ev.day BETWEEN t - 29 AND t
    WINDOW w AS (PARTITION BY ev.user_id, ev.day ORDER BY ev.ts)
  ),
  s AS (SELECT g.user_id, g.day, g.ts,
               sum(g.ns) OVER (PARTITION BY g.user_id, g.day ORDER BY g.ts ROWS UNBOUNDED PRECEDING) AS sid FROM g),
  vis AS (SELECT s.user_id, s.day, s.sid, extract(epoch FROM max(s.ts) - min(s.ts))::numeric / 60 AS mins
          FROM s GROUP BY s.user_id, s.day, s.sid),
  use30 AS (
    SELECT v.user_id, count(DISTINCT v.day) AS dcount, count(*) AS sess,
           sum(greatest(1, round(v.mins))) AS mins
    FROM vis v GROUP BY v.user_id
  ),
  onb AS (
    SELECT m.user_id, min(m.created_at) AS at
    FROM chat_messages m
    WHERE (m.metadata ->> 'onboarding_complete') = 'true'
      AND m.user_id IN (SELECT el.user_id FROM el)
    GROUP BY m.user_id
  ),
  ret AS (
    SELECT o.user_id,
           (now() - o.at >= interval '672 hours') AS eligible_ret,
           EXISTS (SELECT 1 FROM ev
                   WHERE ev.user_id = o.user_id
                     AND ev.day BETWEEN ((o.at + interval '528 hours') AT TIME ZONE 'UTC')::date
                                    AND ((o.at + interval '672 hours') AT TIME ZONE 'UTC')::date) AS kept
    FROM onb o
  )
  SELECT el.grp,
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
  GROUP BY el.grp
  ORDER BY el.grp;
END $$;

-- ============================================================================
-- Who may call what: signed-in users who pass the admin check inside. Never anon.
-- ============================================================================
REVOKE ALL ON FUNCTION public.admin_active_users_now() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_daily_activity(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_weekly_active_users(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_active_users_in_range(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_time_spent(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_life_stage_activity(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_active_users_now() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_daily_activity(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_weekly_active_users(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_active_users_in_range(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_time_spent(timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_life_stage_activity(jsonb) TO authenticated, service_role;
