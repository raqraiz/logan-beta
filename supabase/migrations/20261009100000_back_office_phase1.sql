-- Back office phase 1 (shell, Today, Growth). Totals only: no function here returns a user ID or a row about one woman.
-- No health data: nothing below reads symptom content, cycle data or tip/word authors.
-- Definitions unchanged: user = onboarded + not internal; active = chat message she sent, symptom log, or app event;
-- days are UTC; "this week" = Monday to today.
-- Safe to re-run.

-- ============================================================================
-- 0. Goal settings (one row). Not readable or writable directly; only through the two functions below.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),     -- forces a single row
  goal_count  integer NOT NULL CHECK (goal_count BETWEEN 1 AND 10000000),
  goal_date   date    NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;      -- no policies = no direct access
REVOKE ALL ON public.admin_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_settings TO service_role;
INSERT INTO public.admin_settings (id, goal_count, goal_date) VALUES (true, 1000, DATE '2027-01-01')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_get_goal()
RETURNS TABLE(goal_count integer, goal_date date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY SELECT s.goal_count, s.goal_date FROM public.admin_settings s;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_goal(_count integer, _date date)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _count IS NULL OR _count < 1 OR _count > 10000000 THEN RAISE EXCEPTION 'invalid goal'; END IF;
  IF _date IS NULL OR _date <= (now() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'goal date must be in the future'; END IF;
  UPDATE public.admin_settings SET goal_count = _count, goal_date = _date, updated_at = now(), updated_by = auth.uid()
  WHERE id;
END $$;

-- ============================================================================
-- 1. Internal helper (returns user IDs, so only the database owner can call it).
--    One row per eligible woman: when she finished onboarding, her life stage, her campaign tags.
--    Life stage is resolved here with the same precedence the app used:
--    pregnant > postpartum > hormonal BC > irregular > menopausal > regular > not_set.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._admin_onboarded_users()
RETURNS TABLE(user_id uuid, onboarded_at timestamptz, stage text, conflicting boolean,
              utm_campaign text, utm_source text, utm_medium text, referred_by uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sig AS (
    SELECT p.id AS user_id, p.utm_campaign, p.utm_source, p.utm_medium, p.referred_by,
           (SELECT min(cm.created_at) FROM chat_messages cm
             WHERE cm.user_id = p.id AND (cm.metadata ->> 'onboarding_complete') = 'true') AS onboarded_at,
           pa.user_id IS NOT NULL AS has_pa,
           (btrim(coalesce(pa.life_stage, '')) = 'pregnant' OR pa.due_date IS NOT NULL OR pa.pregnancy_lmp IS NOT NULL) AS pregnant,
           (btrim(coalesce(pa.life_stage, '')) = 'postpartum' OR pa.postpartum_active IS TRUE OR pa.postpartum_start_date IS NOT NULL
             OR pa.is_breastfeeding IS TRUE
             OR (btrim(coalesce(pa.feeding_status, '')) <> '' AND btrim(coalesce(pa.feeding_status, '')) <> 'weaned')) AS postpartum,
           (pa.on_hormonal_bc IS TRUE OR btrim(coalesce(pa.birth_control_status, '')) = 'hormonal') AS hormonal,
           (btrim(coalesce(pa.life_stage, '')) = 'irregular') AS irregular,
           (btrim(coalesce(pa.life_stage, '')) IN ('perimenopause', 'menopause')) AS menopausal,
           (btrim(coalesce(pa.life_stage, '')) = 'cycling'
             OR (btrim(coalesce(pa.life_stage, '')) = '' AND pa.last_period_start IS NOT NULL)) AS regular
    FROM profiles p
    JOIN public._admin_eligible_users() e ON e.user_id = p.id
    LEFT JOIN LATERAL (SELECT x.* FROM participants x WHERE x.user_id = p.id ORDER BY x.updated_at DESC LIMIT 1) pa ON true
  )
  SELECT s.user_id, s.onboarded_at,
         CASE WHEN NOT s.has_pa THEN 'not_set'
              WHEN s.pregnant THEN 'pregnant' WHEN s.postpartum THEN 'postpartum' WHEN s.hormonal THEN 'bc_hormonal'
              WHEN s.irregular THEN 'irregular' WHEN s.menopausal THEN 'menopausal' WHEN s.regular THEN 'regular'
              ELSE 'not_set' END,
         (s.has_pa AND (s.pregnant::int + s.postpartum::int + s.hormonal::int + s.irregular::int
                        + s.menopausal::int + s.regular::int) > 1),
         lower(nullif(btrim(s.utm_campaign), '')), lower(nullif(btrim(s.utm_source), '')),
         lower(nullif(btrim(s.utm_medium), '')), s.referred_by
  FROM sig s
$$;
REVOKE ALL ON FUNCTION public._admin_onboarded_users() FROM PUBLIC, anon, authenticated;

-- Small-group rule: when a life stage filter is on, any count under 10 women comes back as -1
-- (the app shows "Fewer than 10"). Enforced here, so the browser never receives the real number.
CREATE OR REPLACE FUNCTION public._admin_small(_n bigint, _filtered boolean)
RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _filtered AND _n < 10 THEN -1::bigint ELSE _n END
$$;
REVOKE ALL ON FUNCTION public._admin_small(bigint, boolean) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. TODAY: Monday-to-today actives and new this week.
--    (Active today and the rolling 7/30 numbers stay on admin_active_users_now, unchanged.)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_week_to_date()
RETURNS TABLE(week_start date, active_week bigint, new_week bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE wk date := date_trunc('week', now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT wk,
         (SELECT count(DISTINCT e.user_id) FROM public._admin_user_events(wk::timestamp AT TIME ZONE 'UTC', NULL) e)::bigint,
         (SELECT count(*) FROM public._admin_onboarded_users() o
           WHERE (o.onboarded_at AT TIME ZONE 'UTC')::date >= wk)::bigint;
END $$;

-- ============================================================================
-- 3. TODAY: path chart. New women per UTC day and the running total. _from NULL = first day anyone finished onboarding.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_onboarded_by_day(_from date, _to date)
RETURNS TABLE(day date, new_users bigint, total_users bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE st date;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _to IS NULL OR (_from IS NOT NULL AND (_to < _from OR _to - _from > 3660)) THEN
    RAISE EXCEPTION 'invalid range';
  END IF;
  SELECT COALESCE(_from, (SELECT min((u.onboarded_at AT TIME ZONE 'UTC')::date) FROM public._admin_onboarded_users() u), _to)
  INTO st;
  IF _to < st THEN RAISE EXCEPTION 'invalid range'; END IF;
  RETURN QUERY
  WITH o AS (SELECT (u.onboarded_at AT TIME ZONE 'UTC')::date AS d FROM public._admin_onboarded_users() u)
  SELECT (st + i)::date,
         (SELECT count(*) FROM o WHERE o.d = st + i)::bigint,
         (SELECT count(*) FROM o WHERE o.d <= st + i)::bigint
  FROM generate_series(0, _to - st) i
  ORDER BY 1;
END $$;

-- ============================================================================
-- 4. TODAY: "Needs you" counts. Message failures and link clicks come back NULL for plain admins.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_needs_you()
RETURNS TABLE(new_feedback bigint, tips_waiting bigint, tips_reported bigint, message_failures_7d bigint,
              new_referrers_week bigint, link_clicks_total bigint, link_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE sup boolean := has_role(auth.uid(), 'super_admin');
        wk date := date_trunc('week', now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR sup) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT (SELECT count(*) FROM user_feedback f WHERE f.created_at >= now() - interval '7 days')::bigint,
         (SELECT count(*) FROM together_tips t WHERE t.status = 'pending')::bigint,
         (SELECT count(*) FROM together_tips t WHERE t.status = 'approved' AND t.needs_review)::bigint,
         CASE WHEN sup THEN (SELECT count(*) FROM message_failures m WHERE m.created_at >= now() - interval '7 days')::bigint END,
         (SELECT count(DISTINCT o.referred_by) FROM public._admin_onboarded_users() o
           WHERE o.referred_by IS NOT NULL AND (o.onboarded_at AT TIME ZONE 'UTC')::date >= wk)::bigint,
         CASE WHEN sup THEN (SELECT COALESCE(sum(l.clicks), 0) FROM short_links l)::bigint END,
         CASE WHEN sup THEN (SELECT count(*) FROM short_links l)::bigint END;
END $$;

-- ============================================================================
-- 5. TODAY: Together strip. Counts only. Reads Together tables; does not change any Together function.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_together_strip()
RETURNS TABLE(women_joined bigint, symptoms_10_plus bigint, tips_live bigint, tips_waiting bigint,
              tips_reported bigint, new_words_week bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE wk timestamptz := (date_trunc('week', now() AT TIME ZONE 'UTC')::timestamp AT TIME ZONE 'UTC');
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT (SELECT count(*) FROM profiles p JOIN public._admin_eligible_users() e ON e.user_id = p.id
           WHERE p.together_consent)::bigint,
         (SELECT count(DISTINCT a.symptom) FROM together_daily_aggregates a
           WHERE a.cohort_kind = 'everyone' AND a.women_count >= 10)::bigint,
         (SELECT count(*) FROM together_tips t WHERE t.status = 'approved' AND NOT t.needs_review)::bigint,
         (SELECT count(*) FROM together_tips t WHERE t.status = 'pending')::bigint,
         (SELECT count(*) FROM together_tips t WHERE t.status = 'approved' AND t.needs_review)::bigint,
         (SELECT count(*) FROM (SELECT w.word_key FROM together_words w WHERE w.status = 'shared'
                                GROUP BY w.word_key HAVING min(w.created_at) >= wk) nw)::bigint;
END $$;

-- ============================================================================
-- 6. GROWTH (super admin only): weekly measurement. Weeks are Mon to Sun and touch the range. _stage filters totals;
--    with a stage chosen, any count under 10 comes back as -1 ("Fewer than 10").
--    returned_base is NULL until the following week has fully ended (shown as "—" in the app).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_weekly_measurement(_from date, _to date, _stage text DEFAULT NULL)
RETURNS TABLE(week_start date, new_users bigint, active_users bigint, returned_base bigint, returned bigint,
              headsups_opened bigint, feedback bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE today date := (now() AT TIME ZONE 'UTC')::date;
        f date; t date;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _stage IS NOT NULL AND _stage NOT IN ('pregnant','postpartum','bc_hormonal','irregular','menopausal','regular','not_set') THEN RAISE EXCEPTION 'invalid stage'; END IF;
  IF _to IS NULL OR (_from IS NOT NULL AND (_to < _from OR _to - _from > 3660)) THEN RAISE EXCEPTION 'invalid range'; END IF;
  SELECT date_trunc('week', COALESCE(_from, (SELECT min((u.onboarded_at AT TIME ZONE 'UTC')::date) FROM public._admin_onboarded_users() u), _to)::timestamp)::date INTO f;
  t := date_trunc('week', _to::timestamp)::date;
  RETURN QUERY
  WITH u AS (SELECT o.user_id, o.stage, date_trunc('week', o.onboarded_at AT TIME ZONE 'UTC')::date AS wk
             FROM public._admin_onboarded_users() o WHERE _stage IS NULL OR o.stage = _stage),
  ev AS (SELECT DISTINCT e.user_id, date_trunc('week', e.ts AT TIME ZONE 'UTC')::date AS wk
         FROM public._admin_user_events(f::timestamp AT TIME ZONE 'UTC', NULL) e
         WHERE e.user_id IN (SELECT u.user_id FROM u)),
  weeks AS (SELECT (f + 7 * i)::date AS wk FROM generate_series(0, (t - f) / 7) i)
  SELECT w.wk,
         public._admin_small((SELECT count(*) FROM u WHERE u.wk = w.wk), _stage IS NOT NULL),
         public._admin_small((SELECT count(*) FROM ev WHERE ev.wk = w.wk), _stage IS NOT NULL),
         CASE WHEN w.wk + 14 <= today THEN public._admin_small((SELECT count(*) FROM u WHERE u.wk = w.wk), _stage IS NOT NULL) END,
         CASE WHEN w.wk + 14 <= today THEN public._admin_small(
           (SELECT count(*) FROM u WHERE u.wk = w.wk
              AND EXISTS (SELECT 1 FROM ev WHERE ev.user_id = u.user_id AND ev.wk = w.wk + 7)), _stage IS NOT NULL) END,
         public._admin_small((SELECT count(*) FROM partner_headsup_events h
           WHERE h.opened_at IS NOT NULL AND date_trunc('week', h.opened_at AT TIME ZONE 'UTC')::date = w.wk
             AND h.user_id IN (SELECT u.user_id FROM u)), _stage IS NOT NULL),
         public._admin_small((SELECT count(*) FROM user_feedback fb
           WHERE date_trunc('week', fb.created_at AT TIME ZONE 'UTC')::date = w.wk
             AND fb.user_id IN (SELECT u.user_id FROM u)), _stage IS NOT NULL)
  FROM weeks w ORDER BY 1;
END $$;

-- ============================================================================
-- 7. GROWTH (super admin only): where signups came from, by campaign or channel (= utm_source).
--    Clicks are the lifetime count on the link (no click dates exist), so they ignore the date range and the stage filter (NULL when a stage is chosen).
--    With a stage chosen, any count under 10 comes back as -1 ("Fewer than 10").
--    active_14d_base = signups whose first 14 days are over; active_14d = of those, active again within 14 days of signing up.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_signup_sources(_from date, _to date, _by text, _stage text DEFAULT NULL)
RETURNS TABLE(source text, clicks bigint, signups bigint, active_14d_base bigint, active_14d bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _by NOT IN ('campaign', 'channel') THEN RAISE EXCEPTION 'invalid grouping'; END IF;
  IF _stage IS NOT NULL AND _stage NOT IN ('pregnant','postpartum','bc_hormonal','irregular','menopausal','regular','not_set') THEN RAISE EXCEPTION 'invalid stage'; END IF;
  IF _to IS NULL OR (_from IS NOT NULL AND (_to < _from OR _to - _from > 3660)) THEN RAISE EXCEPTION 'invalid range'; END IF;
  RETURN QUERY
  WITH u AS (
    SELECT o.user_id, o.onboarded_at,
           CASE WHEN _by = 'channel' THEN COALESCE(o.utm_source, '(direct / none)') ELSE COALESCE(o.utm_campaign, '(direct / none)') END AS k
    FROM public._admin_onboarded_users() o
    WHERE (_stage IS NULL OR o.stage = _stage)
      AND (_from IS NULL OR (o.onboarded_at AT TIME ZONE 'UTC')::date >= _from)
      AND (o.onboarded_at AT TIME ZONE 'UTC')::date <= _to
  ), ev AS (
    SELECT e.user_id, e.ts FROM public._admin_user_events((SELECT min(u.onboarded_at) FROM u), NULL) e
    WHERE e.user_id IN (SELECT u.user_id FROM u)
  ), s AS (
    SELECT u.k, count(*) AS signups,
           count(*) FILTER (WHERE u.onboarded_at + interval '15 days' <= now()) AS base,
           count(*) FILTER (WHERE u.onboarded_at + interval '15 days' <= now() AND EXISTS (
             SELECT 1 FROM ev WHERE ev.user_id = u.user_id
               AND (ev.ts AT TIME ZONE 'UTC')::date > (u.onboarded_at AT TIME ZONE 'UTC')::date
               AND (ev.ts AT TIME ZONE 'UTC')::date <= (u.onboarded_at AT TIME ZONE 'UTC')::date + 14)) AS act
    FROM u GROUP BY u.k
  ), c AS (
    SELECT CASE WHEN _by = 'channel' THEN COALESCE(lower(nullif(btrim(l.utm_source), '')), '(direct / none)')
                ELSE COALESCE(lower(nullif(btrim(l.utm_campaign), '')), '(direct / none)') END AS k,
           sum(l.clicks)::bigint AS clicks
    FROM short_links l GROUP BY 1
  )
  SELECT COALESCE(s.k, c.k),
         CASE WHEN _stage IS NULL THEN COALESCE(c.clicks, 0) END,
         public._admin_small(COALESCE(s.signups, 0), _stage IS NOT NULL),
         public._admin_small(COALESCE(s.base, 0), _stage IS NOT NULL),
         public._admin_small(COALESCE(s.act, 0), _stage IS NOT NULL)
  FROM s FULL JOIN c ON c.k = s.k
  ORDER BY COALESCE(s.signups, 0) DESC, 1;
END $$;

-- ============================================================================
-- 8. GROWTH (super admin only): campaign links list (for Copy). Link text and counts only; signups = women whose
--    campaign + source + medium match the link (same match the old Saved links screen used).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_campaign_links()
RETURNS TABLE(slug text, target_url text, utm_campaign text, utm_source text, utm_medium text,
              clicks bigint, signups bigint, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  WITH o AS (SELECT x.utm_campaign, x.utm_source, x.utm_medium FROM public._admin_onboarded_users() x
             WHERE x.utm_campaign IS NOT NULL)
  SELECT l.slug, l.target_url, l.utm_campaign, l.utm_source, l.utm_medium, l.clicks::bigint,
         (SELECT count(*) FROM o
           WHERE o.utm_campaign = COALESCE(lower(btrim(l.utm_campaign)), '')
             AND COALESCE(o.utm_source, '') = COALESCE(lower(btrim(l.utm_source)), '')
             AND COALESCE(o.utm_medium, '') = COALESCE(lower(btrim(l.utm_medium)), ''))::bigint,
         l.created_at
  FROM short_links l ORDER BY l.created_at DESC;
END $$;

-- ============================================================================
-- 9. Life stage grouping moves to the server. The app no longer sends any user IDs.
--    Old version (takes a list of IDs) is removed; same columns as before plus users and conflicting.
-- ============================================================================
DROP FUNCTION IF EXISTS public.admin_life_stage_activity(jsonb);
CREATE OR REPLACE FUNCTION public.admin_life_stage_activity()
RETURNS TABLE(grp text, users bigint, conflicting bigint, active_7 bigint, active_30 bigint, active_days_30 bigint,
              minutes_30 bigint, sessions_30 bigint, retention_base bigint, retained bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE t date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  WITH el AS (SELECT o.stage AS grp, o.user_id, o.onboarded_at, o.conflicting FROM public._admin_onboarded_users() o),
  ev AS (SELECT e.user_id, e.ts, (e.ts AT TIME ZONE 'UTC')::date AS day
         FROM public._admin_user_events(NULL, NULL) e),
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
  ret AS (SELECT el.user_id,
                 (now() - el.onboarded_at >= interval '672 hours') AS eligible_ret,
                 EXISTS (SELECT 1 FROM ev WHERE ev.user_id = el.user_id
                           AND ev.day BETWEEN ((el.onboarded_at + interval '528 hours') AT TIME ZONE 'UTC')::date
                                          AND ((el.onboarded_at + interval '672 hours') AT TIME ZONE 'UTC')::date) AS kept
          FROM el)
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

-- ============================================================================
-- Who may call what: signed-in users only; the role check inside decides. Never anon.
-- ============================================================================
REVOKE ALL ON FUNCTION public.admin_get_goal() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_goal(integer, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_week_to_date() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_onboarded_by_day(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_needs_you() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_together_strip() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_weekly_measurement(date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_signup_sources(date, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_campaign_links() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_life_stage_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_goal() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_goal(integer, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_week_to_date() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_onboarded_by_day(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_needs_you() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_together_strip() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_weekly_measurement(date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_signup_sources(date, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_campaign_links() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_life_stage_activity() TO authenticated, service_role;
