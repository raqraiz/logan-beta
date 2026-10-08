-- Investor reports: remove the goal. The report no longer reads admin_get_goal or returns goal_count, goal_date or goal_pct.
-- Everything else in the function is unchanged. admin_get_goal, the goal setting, Today and Growth are not touched.
-- Months locked earlier keep whatever they already hold (snapshots never change); the app ignores any goal fields in them.
-- Safe to re-run.

-- All the numbers for one month, as counts. For the current month the window ends today ("so far").
-- Reuses the Today and Growth functions wherever an admin may call them; the signup source grouping mirrors
-- admin_signup_sources (by channel = utm_source, none shown as "(direct / none)") because that one is super admin only.
CREATE OR REPLACE FUNCTION public._investor_report_compute(_month date) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  ms       date := _month;
  me       date := ((_month + interval '1 month')::date) - 1;
  today    date := (now() AT TIME ZONE 'UTC')::date;
  end_day  date;
  t_end    bigint; t_prev bigint; new_n bigint; growth numeric;
  v_wau    bigint; v_mau bigint; avg_w numeric; stick numeric;
  r_cohort bigint; r_active bigint; r_pct integer;
  chart    jsonb; sources jsonb; ref_n bigint; fb jsonb; fb_total bigint;
BEGIN
  end_day := least(me, today);

  WITH ser AS MATERIALIZED (SELECT * FROM public.admin_onboarded_by_day(NULL, end_day))
  SELECT COALESCE((SELECT s.total_users FROM ser s WHERE s.day = end_day), 0),
         COALESCE((SELECT s.total_users FROM ser s WHERE s.day = ms - 1), 0),
         COALESCE((SELECT sum(s.new_users) FROM ser s WHERE s.day >= ms), 0),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('month', to_char(s.day, 'YYYY-MM'), 'total', s.total_users) ORDER BY s.day)
                   FROM ser s
                   WHERE s.day = end_day OR s.day = (((date_trunc('month', s.day::timestamp) + interval '1 month')::date) - 1)), '[]'::jsonb)
  INTO t_end, t_prev, new_n, chart;

  -- Zero users last month (including the very first month): no percentage, never a divide by zero.
  growth := CASE WHEN t_prev > 0 THEN round(new_n * 100.0 / t_prev, 1) END;

  SELECT a.wau, a.mau INTO v_wau, v_mau FROM public._admin_active_asof(end_day) a;
  stick := CASE WHEN v_mau > 0 THEN round(v_wau::numeric / v_mau, 2) END;

  -- Same rule as the app: mean of Monday-to-Sunday weeks that fall entirely inside the window and are over.
  SELECT round(avg(w.active_users)::numeric, 1) INTO avg_w
  FROM public.admin_weekly_active_users(ms, end_day) w
  WHERE w.days_in_range = 7 AND w.week_start + 6 < today;

  SELECT r.cohort, r.active INTO r_cohort, r_active FROM public._admin_next_month_retention(ms) r;
  r_pct := CASE WHEN r_cohort >= 10 THEN round(r_active * 100.0 / r_cohort)::integer END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('source', x.k, 'signups', x.n) ORDER BY x.n DESC, x.k), '[]'::jsonb) INTO sources
  FROM (SELECT COALESCE(o.utm_source, '(direct / none)') AS k, count(*) AS n
        FROM public._admin_onboarded_users() o
        WHERE (o.onboarded_at AT TIME ZONE 'UTC')::date BETWEEN ms AND end_day
        GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 5) x;

  SELECT count(*) INTO ref_n FROM public._admin_referred() r
  WHERE (r.onboarded_at AT TIME ZONE 'UTC')::date BETWEEN ms AND end_day;

  SELECT jsonb_object_agg(t.theme, t.n), sum(t.n) INTO fb, fb_total
  FROM (SELECT th.theme, count(f.id) AS n
        FROM (VALUES ('bug'), ('feature'), ('praise'), ('content'), ('other')) th(theme)
        LEFT JOIN user_feedback f ON COALESCE(f.theme, 'other') = th.theme
                                 AND (f.created_at AT TIME ZONE 'UTC')::date BETWEEN ms AND end_day
        GROUP BY th.theme) t;

  RETURN jsonb_build_object(
    'as_of', end_day,
    'total_users', t_end, 'new_users', new_n, 'prev_total', t_prev, 'growth_pct', growth,
    'mau', v_mau, 'wau', v_wau, 'avg_weekly_active', avg_w, 'stickiness', stick,
    'retention', jsonb_build_object('cohort', r_cohort, 'active', r_active, 'pct', r_pct),
    'sources', sources, 'referral_joins', ref_n,
    'feedback', jsonb_build_object('total', COALESCE(fb_total, 0), 'themes', COALESCE(fb, '{}'::jsonb)),
    'chart', chart);
END $$;
REVOKE ALL ON FUNCTION public._investor_report_compute(date) FROM PUBLIC, anon, authenticated;
