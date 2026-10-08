-- Back office phase 5: Investor reports. One report per UTC month: numbers that lock, plus written notes.
-- Totals only. No function here returns a user ID, and the snapshot table holds no user IDs at all.
-- Definitions are reused, not changed: user = onboarded + not internal (_admin_onboarded_users), active = _admin_user_events,
-- days are UTC. No existing function is edited. Safe to re-run.
--
-- Locking: the first time anyone opens a month after it has ended, its numbers are frozen into investor_report_snapshots.
-- The audit log entry 'report_locked' records who and when. The snapshot itself does not.

-- ============================================================================
-- 1. Settings (one row): the day this feature went live. Months that ended before it are labelled
--    "Calculated after the month ended". Holds no personal data.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.investor_report_settings (
  id         boolean PRIMARY KEY DEFAULT true CHECK (id),
  started_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date)
);
ALTER TABLE public.investor_report_settings ENABLE ROW LEVEL SECURITY;      -- no policies = no direct access
REVOKE ALL ON public.investor_report_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.investor_report_settings TO service_role;
INSERT INTO public.investor_report_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. Snapshots: frozen numbers, one row per month. Counts and source names only. No user IDs.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.investor_report_snapshots (
  month           date PRIMARY KEY CHECK (month = date_trunc('month', month::timestamp)::date),
  numbers         jsonb NOT NULL,
  locked_at       timestamptz NOT NULL DEFAULT now(),
  calculated_late boolean NOT NULL                     -- true = the month had already ended before this feature went live
);
ALTER TABLE public.investor_report_snapshots ENABLE ROW LEVEL SECURITY;     -- no policies = no direct access
REVOKE ALL ON public.investor_report_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.investor_report_snapshots TO service_role;

-- Locked numbers never change, for anyone, even the database owner's scripts.
CREATE OR REPLACE FUNCTION public._investor_report_snapshot_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'locked numbers never change';
END $$;
DROP TRIGGER IF EXISTS investor_report_snapshot_guard ON public.investor_report_snapshots;
CREATE TRIGGER investor_report_snapshot_guard BEFORE UPDATE OR DELETE ON public.investor_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION public._investor_report_snapshot_guard();

-- ============================================================================
-- 3. Approved notes per month, plus the Final flag. Final reports are read-only.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.investor_report_notes (
  month        date PRIMARY KEY CHECK (month = date_trunc('month', month::timestamp)::date),
  highlights   text NOT NULL DEFAULT '' CHECK (char_length(highlights) <= 1200),
  lowlights    text NOT NULL DEFAULT '' CHECK (char_length(lowlights) <= 1200),
  asks         text NOT NULL DEFAULT '' CHECK (char_length(asks) <= 1200),
  final        boolean NOT NULL DEFAULT false,
  finalized_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.investor_report_notes ENABLE ROW LEVEL SECURITY;         -- no policies = no direct access
REVOKE ALL ON public.investor_report_notes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.investor_report_notes TO service_role;

CREATE OR REPLACE FUNCTION public._investor_report_notes_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.final THEN RAISE EXCEPTION 'final reports are read-only'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS investor_report_notes_guard ON public.investor_report_notes;
CREATE TRIGGER investor_report_notes_guard BEFORE UPDATE OR DELETE ON public.investor_report_notes
  FOR EACH ROW EXECUTE FUNCTION public._investor_report_notes_guard();

-- ============================================================================
-- 4. Drafts: admins write them in admin_drafts (kind 'investor_report', status waiting).
--    The three fields live in report_notes; body keeps a plain-text copy so the existing column rules still hold.
-- ============================================================================
ALTER TABLE public.admin_drafts
  ADD COLUMN IF NOT EXISTS report_month date,
  ADD COLUMN IF NOT EXISTS report_notes jsonb;
ALTER TABLE public.admin_drafts DROP CONSTRAINT IF EXISTS admin_drafts_report_needs_month;
ALTER TABLE public.admin_drafts ADD CONSTRAINT admin_drafts_report_needs_month
  CHECK (kind <> 'investor_report' OR (report_month IS NOT NULL AND report_notes IS NOT NULL)) NOT VALID;
-- One waiting draft per month: a new save replaces it.
CREATE UNIQUE INDEX IF NOT EXISTS admin_drafts_one_waiting_report
  ON public.admin_drafts (report_month) WHERE kind = 'investor_report' AND status = 'waiting';

-- ============================================================================
-- 5. Audit log: three new action names (keeps every existing one). Never any content.
-- ============================================================================
ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN
  ('open_user','export_csv','send_data_export','edit_name','delete_user','toggle_internal',
   'draft_created','draft_edited','draft_approved','draft_rejected','message_sent','feedback_handled',
   'tip_approved','tip_removed','tip_author_removed','word_approved','word_removed',
   'broadcast_sent',
   'report_locked','report_finalized','report_copied'));

-- ============================================================================
-- 6. Owner-only helpers (nobody can call these from the API)
-- ============================================================================
-- NEW: women active in the last 7 / 30 days ending on a given UTC day. Same window and same events as
-- admin_active_users_now, but for any day instead of only today (that function is left unchanged).
CREATE OR REPLACE FUNCTION public._admin_active_asof(_day date)
RETURNS TABLE(wau bigint, mau bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ev AS (
    SELECT e.user_id, (e.ts AT TIME ZONE 'UTC')::date AS day
    FROM public._admin_user_events(((_day - 29)::timestamp AT TIME ZONE 'UTC'),
                                   ((_day + 1)::timestamp AT TIME ZONE 'UTC') - interval '1 microsecond') e
  )
  SELECT count(DISTINCT ev.user_id) FILTER (WHERE ev.day BETWEEN _day - 6 AND _day)::bigint,
         count(DISTINCT ev.user_id) FILTER (WHERE ev.day BETWEEN _day - 29 AND _day)::bigint
  FROM ev
$$;
REVOKE ALL ON FUNCTION public._admin_active_asof(date) FROM PUBLIC, anon, authenticated;

-- NEW: "Still active the next month". Cohort = women who finished onboarding in the month BEFORE _month.
-- Active = at least one _admin_user_events event at any point during _month (UTC).
-- Cohort under 10 comes back as -1 and active as NULL (the small-group rule), so the real number never leaves the database.
CREATE OR REPLACE FUNCTION public._admin_next_month_retention(_month date)
RETURNS TABLE(cohort bigint, active bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    SELECT o.user_id FROM public._admin_onboarded_users() o
    WHERE (o.onboarded_at AT TIME ZONE 'UTC')::date >= (_month - interval '1 month')::date
      AND (o.onboarded_at AT TIME ZONE 'UTC')::date < _month
  ), a AS (
    SELECT DISTINCT e.user_id
    FROM public._admin_user_events(_month::timestamp AT TIME ZONE 'UTC',
                                   (((_month + interval '1 month')::date)::timestamp AT TIME ZONE 'UTC') - interval '1 microsecond') e
    WHERE e.user_id IN (SELECT c.user_id FROM c)
  )
  SELECT public._admin_small((SELECT count(*) FROM c), true),
         CASE WHEN (SELECT count(*) FROM c) < 10 THEN NULL ELSE (SELECT count(*) FROM a) END
$$;
REVOKE ALL ON FUNCTION public._admin_next_month_retention(date) FROM PUBLIC, anon, authenticated;

-- A month must be the 1st, no earlier than the first month anyone joined, and no later than the current month.
CREATE OR REPLACE FUNCTION public._investor_report_check_month(_month date) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE first_m date;
        cur date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF _month IS NULL OR _month <> date_trunc('month', _month::timestamp)::date THEN RAISE EXCEPTION 'invalid month'; END IF;
  SELECT date_trunc('month', min(o.onboarded_at AT TIME ZONE 'UTC'))::date INTO first_m FROM public._admin_onboarded_users() o;
  IF first_m IS NULL OR _month < first_m OR _month > cur THEN RAISE EXCEPTION 'month not available'; END IF;
END $$;
REVOKE ALL ON FUNCTION public._investor_report_check_month(date) FROM PUBLIC, anon, authenticated;

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
  goal_n   integer; goal_d date;
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

  SELECT g.goal_count, g.goal_date INTO goal_n, goal_d FROM public.admin_get_goal() g;

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
    'goal_count', goal_n, 'goal_date', goal_d,
    'goal_pct', CASE WHEN goal_n > 0 THEN round(t_end * 100.0 / goal_n, 1) END,
    'mau', v_mau, 'wau', v_wau, 'avg_weekly_active', avg_w, 'stickiness', stick,
    'retention', jsonb_build_object('cohort', r_cohort, 'active', r_active, 'pct', r_pct),
    'sources', sources, 'referral_joins', ref_n,
    'feedback', jsonb_build_object('total', COALESCE(fb_total, 0), 'themes', COALESCE(fb, '{}'::jsonb)),
    'chart', chart);
END $$;
REVOKE ALL ON FUNCTION public._investor_report_compute(date) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 7. The month list. Newest first. Does not lock anything.
--    status: live (this month), locked, final, or unlocked (ended, nobody has opened it yet; it locks when opened).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_report_months()
RETURNS TABLE(month date, status text, locked_at timestamptz, calculated_late boolean, draft_waiting boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE sup boolean := has_role(auth.uid(), 'super_admin');
        cur date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
        first_m date;
BEGIN
  IF NOT (sup OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT date_trunc('month', min(o.onboarded_at AT TIME ZONE 'UTC'))::date INTO first_m FROM public._admin_onboarded_users() o;
  IF first_m IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT m.d::date,
         CASE WHEN m.d::date >= cur THEN 'live'
              WHEN n.final THEN 'final'
              WHEN s.month IS NOT NULL THEN 'locked'
              ELSE 'unlocked' END,
         s.locked_at, s.calculated_late,
         sup AND EXISTS (SELECT 1 FROM admin_drafts d WHERE d.kind = 'investor_report' AND d.status = 'waiting' AND d.report_month = m.d::date)
  FROM generate_series(first_m::timestamp, cur::timestamp, interval '1 month') m(d)
  LEFT JOIN investor_report_snapshots s ON s.month = m.d::date
  LEFT JOIN investor_report_notes n ON n.month = m.d::date
  ORDER BY m.d DESC;
END $$;

-- ============================================================================
-- 8. Open one month. Past month: lock it on first view (exactly once), then read the frozen numbers.
--    Current month: live numbers, nothing stored. VOLATILE because it can write the snapshot and the audit entry.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_report_get(_month date)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE sup boolean := has_role(auth.uid(), 'super_admin');
        cur date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
        snap public.investor_report_snapshots%ROWTYPE;
        nt public.investor_report_notes%ROWTYPE;
        dr public.admin_drafts%ROWTYPE;
        nums jsonb; st text; n integer; writer text;
BEGIN
  IF NOT (sup OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM public._investor_report_check_month(_month);

  IF _month < cur THEN
    SELECT * INTO snap FROM investor_report_snapshots WHERE month = _month;
    IF NOT FOUND THEN
      -- Two people opening at the same moment: one waits here, then finds the snapshot and does nothing.
      PERFORM pg_advisory_xact_lock(hashtext('investor_report_snapshot'), (_month - DATE '2000-01-01'));
      SELECT * INTO snap FROM investor_report_snapshots WHERE month = _month;
      IF NOT FOUND THEN
        INSERT INTO investor_report_snapshots(month, numbers, calculated_late)
        VALUES (_month, public._investor_report_compute(_month),
                (((_month + interval '1 month')::date) - 1) < (SELECT started_on FROM investor_report_settings WHERE id))
        ON CONFLICT (month) DO NOTHING;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n = 1 THEN INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'report_locked'); END IF;
        SELECT * INTO snap FROM investor_report_snapshots WHERE month = _month;
      END IF;
    END IF;
    nums := snap.numbers;
  ELSE
    nums := public._investor_report_compute(_month);
  END IF;

  SELECT * INTO nt FROM investor_report_notes WHERE month = _month;
  st := CASE WHEN _month >= cur THEN 'live' WHEN nt.final IS TRUE THEN 'final' ELSE 'locked' END;

  SELECT * INTO dr FROM admin_drafts
  WHERE kind = 'investor_report' AND status = 'waiting' AND report_month = _month AND (sup OR created_by = auth.uid());
  IF FOUND AND sup THEN
    SELECT nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), '') INTO writer FROM profiles p WHERE p.id = dr.created_by;
  END IF;

  RETURN jsonb_build_object(
    'month', _month, 'status', st, 'locked_at', snap.locked_at, 'calculated_late', snap.calculated_late,
    'numbers', nums,
    'notes', jsonb_build_object('highlights', COALESCE(nt.highlights, ''), 'lowlights', COALESCE(nt.lowlights, ''),
                                'asks', COALESCE(nt.asks, ''), 'final_at', nt.finalized_at),
    'draft', CASE WHEN dr.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', dr.id, 'highlights', dr.report_notes ->> 'highlights', 'lowlights', dr.report_notes ->> 'lowlights',
      'asks', dr.report_notes ->> 'asks', 'mine', dr.created_by = auth.uid(), 'written_by', writer) END);
END $$;

-- ============================================================================
-- 9. Notes and drafts
-- ============================================================================
-- Plain-text copy of the three fields, kept in admin_drafts.body.
CREATE OR REPLACE FUNCTION public._investor_report_body(_h text, _l text, _a text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'Highlights: ' || _h || E'\n\nLowlights: ' || _l || E'\n\nAsks: ' || _a
$$;
REVOKE ALL ON FUNCTION public._investor_report_body(text, text, text) FROM PUBLIC, anon, authenticated;

-- Admin or super admin: write the draft for a month (replaces the waiting one).
CREATE OR REPLACE FUNCTION public.admin_report_draft_save(_month date, _highlights text, _lowlights text, _asks text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE h text := btrim(coalesce(_highlights, ''));
        l text := btrim(coalesce(_lowlights, ''));
        a text := btrim(coalesce(_asks, ''));
        j jsonb; new_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM public._investor_report_check_month(_month);
  IF char_length(h) > 1200 OR char_length(l) > 1200 OR char_length(a) > 1200 THEN RAISE EXCEPTION 'too long'; END IF;
  IF h = '' AND l = '' AND a = '' THEN RAISE EXCEPTION 'write something first'; END IF;
  IF EXISTS (SELECT 1 FROM investor_report_notes WHERE month = _month AND final) THEN RAISE EXCEPTION 'report is final'; END IF;
  j := jsonb_build_object('highlights', h, 'lowlights', l, 'asks', a);

  UPDATE admin_drafts SET report_notes = j, body = public._investor_report_body(h, l, a), updated_at = now()
  WHERE kind = 'investor_report' AND status = 'waiting' AND report_month = _month RETURNING id INTO new_id;
  IF FOUND THEN
    INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'draft_edited');
    RETURN new_id;
  END IF;
  BEGIN
    INSERT INTO admin_drafts(kind, body, status, created_by, report_month, report_notes)
    VALUES ('investor_report', public._investor_report_body(h, l, a), 'waiting', auth.uid(), _month, j) RETURNING id INTO new_id;
    INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'draft_created');
  EXCEPTION WHEN unique_violation THEN   -- someone else saved a draft at the same moment: replace theirs
    UPDATE admin_drafts SET report_notes = j, body = public._investor_report_body(h, l, a), updated_at = now()
    WHERE kind = 'investor_report' AND status = 'waiting' AND report_month = _month RETURNING id INTO new_id;
    INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'draft_edited');
  END;
  RETURN new_id;
END $$;

-- Super admin: edit a waiting draft before approving it.
CREATE OR REPLACE FUNCTION public.admin_report_draft_edit(_draft uuid, _highlights text, _lowlights text, _asks text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE h text := btrim(coalesce(_highlights, ''));
        l text := btrim(coalesce(_lowlights, ''));
        a text := btrim(coalesce(_asks, ''));
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF char_length(h) > 1200 OR char_length(l) > 1200 OR char_length(a) > 1200 THEN RAISE EXCEPTION 'too long'; END IF;
  IF h = '' AND l = '' AND a = '' THEN RAISE EXCEPTION 'write something first'; END IF;
  UPDATE admin_drafts SET report_notes = jsonb_build_object('highlights', h, 'lowlights', l, 'asks', a),
         body = public._investor_report_body(h, l, a), updated_at = now()
  WHERE id = _draft AND kind = 'investor_report' AND status = 'waiting';
  IF NOT FOUND THEN RAISE EXCEPTION 'draft not waiting'; END IF;
  INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'draft_edited');
END $$;

-- Super admin: approve a draft. Its three fields become the month's notes.
CREATE OR REPLACE FUNCTION public.admin_report_draft_approve(_draft uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.admin_drafts%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO d FROM admin_drafts WHERE id = _draft AND kind = 'investor_report' AND status = 'waiting' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft not waiting'; END IF;
  IF EXISTS (SELECT 1 FROM investor_report_notes WHERE month = d.report_month AND final) THEN RAISE EXCEPTION 'report is final'; END IF;
  INSERT INTO investor_report_notes(month, highlights, lowlights, asks)
  VALUES (d.report_month, d.report_notes ->> 'highlights', d.report_notes ->> 'lowlights', d.report_notes ->> 'asks')
  ON CONFLICT (month) DO UPDATE SET highlights = EXCLUDED.highlights, lowlights = EXCLUDED.lowlights,
                                    asks = EXCLUDED.asks, updated_at = now();
  UPDATE admin_drafts SET status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now() WHERE id = _draft;
  INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'draft_approved');
END $$;

CREATE OR REPLACE FUNCTION public.admin_report_draft_reject(_draft uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE admin_drafts SET status = 'rejected', updated_at = now()
  WHERE id = _draft AND kind = 'investor_report' AND status = 'waiting';
  IF NOT FOUND THEN RAISE EXCEPTION 'draft not waiting'; END IF;
  INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'draft_rejected');
END $$;

-- Super admin: write the notes directly (no draft needed).
CREATE OR REPLACE FUNCTION public.admin_report_notes_save(_month date, _highlights text, _lowlights text, _asks text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE h text := btrim(coalesce(_highlights, ''));
        l text := btrim(coalesce(_lowlights, ''));
        a text := btrim(coalesce(_asks, ''));
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM public._investor_report_check_month(_month);
  IF char_length(h) > 1200 OR char_length(l) > 1200 OR char_length(a) > 1200 THEN RAISE EXCEPTION 'too long'; END IF;
  IF EXISTS (SELECT 1 FROM investor_report_notes WHERE month = _month AND final) THEN RAISE EXCEPTION 'report is final'; END IF;
  INSERT INTO investor_report_notes(month, highlights, lowlights, asks) VALUES (_month, h, l, a)
  ON CONFLICT (month) DO UPDATE SET highlights = EXCLUDED.highlights, lowlights = EXCLUDED.lowlights,
                                    asks = EXCLUDED.asks, updated_at = now();
  INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'draft_edited');
END $$;

-- Super admin only: mark a locked, ended month Final. From then on it is read-only.
-- Any draft still waiting for that month is closed as rejected.
CREATE OR REPLACE FUNCTION public.admin_report_finalize(_month date)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM public._investor_report_check_month(_month);
  IF NOT EXISTS (SELECT 1 FROM investor_report_snapshots WHERE month = _month) THEN RAISE EXCEPTION 'month is not locked yet'; END IF;
  IF EXISTS (SELECT 1 FROM investor_report_notes WHERE month = _month AND final) THEN RAISE EXCEPTION 'report is final'; END IF;
  UPDATE admin_drafts SET status = 'rejected', updated_at = now()
  WHERE kind = 'investor_report' AND status = 'waiting' AND report_month = _month;
  INSERT INTO investor_report_notes(month, final, finalized_at) VALUES (_month, true, now())
  ON CONFLICT (month) DO UPDATE SET final = true, finalized_at = now(), updated_at = now();
  INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'report_finalized');
END $$;

-- Admin or super admin: note that a report was copied. No content.
CREATE OR REPLACE FUNCTION public.admin_report_log_copy(_month date)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM public._investor_report_check_month(_month);
  INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'report_copied');
END $$;

-- ============================================================================
-- Who may call what: signed-in users only; the role check inside decides. Never anon.
-- ============================================================================
REVOKE ALL ON FUNCTION public.admin_report_months() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_report_get(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_report_draft_save(date, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_report_draft_edit(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_report_draft_approve(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_report_draft_reject(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_report_notes_save(date, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_report_finalize(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_report_log_copy(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_report_months() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_report_get(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_report_draft_save(date, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_report_draft_edit(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_report_draft_approve(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_report_draft_reject(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_report_notes_save(date, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_report_finalize(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_report_log_copy(date) TO authenticated, service_role;
