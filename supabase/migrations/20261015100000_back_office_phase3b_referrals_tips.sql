-- Back office phase 3b: Referrals and Tips.
-- Referrals reuse admin_drafts and the team-message delivery from phase 3a (kind 'thank_you').
-- Tips extend the existing admin_tip_queue / admin_tip_totals / admin_review_tip and the existing word-report data.
-- Every function checks the role inside. None returns an author ID. Nothing here logs message or tip text.
-- Safe to re-run.

-- ============================================================================
-- 1. Audit log: new action names (the log never holds content)
-- ============================================================================
ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN
  ('open_user','export_csv','send_data_export','edit_name','delete_user','toggle_internal',
   'draft_created','draft_edited','draft_approved','draft_rejected','message_sent','feedback_handled',
   'tip_approved','tip_removed','tip_author_removed','word_approved','word_removed'));

-- ============================================================================
-- 2. "Reported" needs a memory: approving a tip clears its reports, so remember when it was first reported.
--    A trigger fills it in; the women-facing report function is not touched.
-- ============================================================================
ALTER TABLE public.together_tips ADD COLUMN IF NOT EXISTS first_reported_at timestamptz;

UPDATE public.together_tips t SET first_reported_at = r.first_at
FROM (SELECT tip_id, min(created_at) AS first_at FROM public.together_tip_reports GROUP BY tip_id) r
WHERE r.tip_id = t.id AND t.first_reported_at IS NULL;

CREATE OR REPLACE FUNCTION public._tip_mark_first_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE together_tips SET first_reported_at = coalesce(first_reported_at, NEW.created_at) WHERE id = NEW.tip_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._tip_mark_first_report() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS together_tip_reports_first_report ON public.together_tip_reports;
CREATE TRIGGER together_tip_reports_first_report AFTER INSERT ON public.together_tip_reports
  FOR EACH ROW EXECUTE FUNCTION public._tip_mark_first_report();

-- ============================================================================
-- 3. TIPS
-- ============================================================================
-- 3a. Queue. Same function, now with a tab and a "why". The old no-argument call still works (defaults to the review queue).
--     Pending tips have no stored reason (Logan's check only stores one for tips it turned down), so a plain line is shown.
DROP FUNCTION IF EXISTS public.admin_tip_queue();
CREATE OR REPLACE FUNCTION public.admin_tip_queue(_tab text DEFAULT 'review')
RETURNS TABLE(id uuid, symptom text, text text, label text, status text, report_count integer, reasons text[],
              created_at timestamptz, author_tip_count integer, why text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _tab NOT IN ('review','live','removed') THEN RAISE EXCEPTION 'invalid tab'; END IF;
  RETURN QUERY
  SELECT t.id, t.symptom, t.text, t.label, t.status, t.report_count,
         ARRAY(SELECT r.reason FROM together_tip_reports r WHERE r.tip_id = t.id),
         t.created_at,
         (SELECT count(*)::int FROM together_tips t2 WHERE t2.author_id = t.author_id AND t2.status <> 'removed'),
         CASE WHEN t.status = 'pending'
              THEN coalesce(t.reject_reason, 'Logan could not tell whether this is safe and about this symptom.') END
  FROM together_tips t
  WHERE (_tab = 'review'  AND (t.status = 'pending' OR (t.needs_review AND t.status = 'approved')))
     OR (_tab = 'live'    AND t.status = 'approved' AND NOT t.needs_review)
     OR (_tab = 'removed' AND t.status = 'removed')
  ORDER BY (CASE WHEN _tab = 'review' THEN t.report_count ELSE 0 END) DESC,
           (CASE WHEN _tab = 'review' THEN t.created_at END) ASC,
           t.created_at DESC
  LIMIT 200;
END $$;

-- 3b. Totals. Same function and the same four status rows as before, plus extra rows the new screen reads
--     (tab_*, month_*; UTC calendar month). The old screen ignores rows it does not know.
CREATE OR REPLACE FUNCTION public.admin_tip_totals()
RETURNS TABLE(status text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE m0 timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT t.status, count(*) FROM together_tips t GROUP BY t.status
  UNION ALL SELECT 'tab_review'::text,
    (SELECT count(*) FROM together_tips t WHERE t.status = 'pending' OR (t.needs_review AND t.status = 'approved'))
  UNION ALL SELECT 'tab_live'::text,
    (SELECT count(*) FROM together_tips t WHERE t.status = 'approved' AND NOT t.needs_review)
  UNION ALL SELECT 'month_shared'::text,       (SELECT count(*) FROM together_tips t WHERE t.created_at >= m0)
  UNION ALL SELECT 'month_live'::text,         (SELECT count(*) FROM together_tips t WHERE t.created_at >= m0 AND t.status = 'approved')
  UNION ALL SELECT 'month_turned_down'::text,  (SELECT count(*) FROM together_tips t WHERE t.created_at >= m0 AND t.status = 'rejected')
  UNION ALL SELECT 'month_reported'::text,     (SELECT count(*) FROM together_tips t WHERE t.first_reported_at >= m0)
  UNION ALL SELECT 'month_removed'::text,      (SELECT count(*) FROM together_tips t WHERE t.status = 'removed' AND t.reviewed_at >= m0)
  UNION ALL SELECT 'month_helped'::text,       (SELECT count(*) FROM together_tip_votes v WHERE v.created_at >= m0);
END $$;

-- 3c. Review. Same function and return value; now only acts on tips that exist and are in a state it can change,
--     and logs the action without content. Remove-all is logged with no target user, so the log cannot identify the author.
CREATE OR REPLACE FUNCTION public.admin_review_tip(_tip_id uuid, _action text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _author uuid; _n int;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _action = 'approve' THEN
    UPDATE together_tips SET status = 'approved', report_count = 0, needs_review = false, reviewed_at = now()
    WHERE id = _tip_id AND status IN ('pending', 'approved');
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n = 0 THEN RETURN 0; END IF;
    DELETE FROM together_tip_reports WHERE tip_id = _tip_id;
    INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'tip_approved');
    RETURN 1;
  ELSIF _action = 'remove' THEN
    UPDATE together_tips SET status = 'removed', needs_review = false, reviewed_at = now()
    WHERE id = _tip_id AND status <> 'removed';
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n = 0 THEN RETURN 0; END IF;
    INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'tip_removed');
    RETURN 1;
  ELSIF _action = 'remove_author' THEN
    SELECT author_id INTO _author FROM together_tips WHERE id = _tip_id;
    IF _author IS NULL THEN RETURN 0; END IF;
    UPDATE together_tips SET status = 'removed', needs_review = false, reviewed_at = now()
    WHERE author_id = _author AND status <> 'removed';
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n > 0 THEN INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'tip_author_removed'); END IF;
    RETURN _n;
  END IF;
  RAISE EXCEPTION 'bad_action';
END $$;

-- 3d. Reported words. admin_word_queue is unchanged. admin_review_word is unchanged except it now logs (no content).
CREATE OR REPLACE FUNCTION public.admin_review_word(_word text, _action text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _key text := together_norm(_word); _n int := 0;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _action = 'approve' THEN
    DELETE FROM together_word_reports WHERE word_key = _key;
    INSERT INTO together_word_review (word_key, report_count, needs_review, blocked, reviewed_at) VALUES (_key, 0, false, false, now())
    ON CONFLICT (word_key) DO UPDATE SET report_count = 0, needs_review = false, blocked = false, reviewed_at = now();
    INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'word_approved');
    RETURN 1;
  ELSIF _action = 'remove' THEN
    UPDATE together_words SET status = 'rejected', reject_category = 'removed_by_review', updated_at = now()
    WHERE word_key = _key AND status = 'shared';
    GET DIAGNOSTICS _n = ROW_COUNT;
    INSERT INTO together_word_review (word_key, report_count, needs_review, blocked, reviewed_at) VALUES (_key, 0, false, true, now())
    ON CONFLICT (word_key) DO UPDATE SET needs_review = false, blocked = true, reviewed_at = now();
    INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'word_removed');
    RETURN _n;
  END IF;
  RAISE EXCEPTION 'bad_action';
END $$;

-- 3e. Same filter admin_word_queue uses, as a count (for Today).
CREATE OR REPLACE FUNCTION public._admin_words_waiting()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM together_word_review rv
  WHERE rv.needs_review AND NOT rv.blocked
    AND EXISTS (SELECT 1 FROM together_words w WHERE w.word_key = rv.word_key AND w.status = 'shared')
$$;
REVOKE ALL ON FUNCTION public._admin_words_waiting() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. REFERRALS
-- ============================================================================
-- One row per onboarded, non-internal referred woman whose referrer is also non-internal. Returns user IDs, so owner only.
-- "Active after 14 days" is the same rule as Growth: her first 14 days are over (15 days since onboarding) and she was
-- active again on a later day within 14 days of onboarding.
CREATE OR REPLACE FUNCTION public._admin_referred()
RETURNS TABLE(referrer uuid, user_id uuid, onboarded_at timestamptz, in_base boolean, is_active boolean, in_month boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (
    SELECT o.referred_by AS referrer, o.user_id, o.onboarded_at
    FROM public._admin_onboarded_users() o
    JOIN profiles rp ON rp.id = o.referred_by AND COALESCE(rp.is_internal, false) = false
    WHERE o.referred_by IS NOT NULL AND o.referred_by <> o.user_id
  ), ev AS (
    SELECT e.user_id, e.ts FROM public._admin_user_events((SELECT min(u.onboarded_at) FROM u), NULL) e
    WHERE e.user_id IN (SELECT u.user_id FROM u)
  )
  SELECT u.referrer, u.user_id, u.onboarded_at,
         u.onboarded_at + interval '15 days' <= now(),
         (u.onboarded_at + interval '15 days' <= now() AND EXISTS (
            SELECT 1 FROM ev WHERE ev.user_id = u.user_id
              AND (ev.ts AT TIME ZONE 'UTC')::date > (u.onboarded_at AT TIME ZONE 'UTC')::date
              AND (ev.ts AT TIME ZONE 'UTC')::date <= (u.onboarded_at AT TIME ZONE 'UTC')::date + 14)),
         u.onboarded_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
  FROM u
$$;
REVOKE ALL ON FUNCTION public._admin_referred() FROM PUBLIC, anon, authenticated;

-- Tiles. _period: 'month' (UTC calendar month) or 'all'. base = women whose first 14 days are over.
CREATE OR REPLACE FUNCTION public.admin_referrals_summary(_period text)
RETURNS TABLE(signups bigint, active_base bigint, active bigint, referrers bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _period NOT IN ('month','all') THEN RAISE EXCEPTION 'invalid period'; END IF;
  RETURN QUERY
  SELECT count(*), count(*) FILTER (WHERE r.in_base), count(*) FILTER (WHERE r.is_active), count(DISTINCT r.referrer)
  FROM public._admin_referred() r
  WHERE _period = 'all' OR r.in_month;
END $$;

-- Table. Admins get first name only and no user ID. ref_key is her referral code: just a handle so a thank-you can be
-- addressed without anyone being handed her ID.
CREATE OR REPLACE FUNCTION public.admin_referrals_list(_period text)
RETURNS TABLE(ref_key text, first_name text, last_initial text, user_id uuid, signups bigint, all_time bigint,
              active_base bigint, active bigint, last_referral timestamptz, thanked_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE sup boolean := has_role(auth.uid(), 'super_admin');
BEGIN
  IF NOT (sup OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _period NOT IN ('month','all') THEN RAISE EXCEPTION 'invalid period'; END IF;
  RETURN QUERY
  WITH agg AS (
    SELECT r.referrer AS rid,
           count(*) AS n_all,
           count(*) FILTER (WHERE _period = 'all' OR r.in_month) AS n_period,
           count(*) FILTER (WHERE (_period = 'all' OR r.in_month) AND r.in_base) AS n_base,
           count(*) FILTER (WHERE (_period = 'all' OR r.in_month) AND r.is_active) AS n_active,
           max(r.onboarded_at) AS last_at
    FROM public._admin_referred() r GROUP BY r.referrer
  )
  SELECT p.referral_code,
         nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''),
         CASE WHEN sup THEN nullif(left(btrim(regexp_replace(btrim(coalesce(p.full_name, '')), '^\S+\s*', '')), 1), '') END,
         CASE WHEN sup THEN p.id END,
         a.n_period, a.n_all, a.n_base, a.n_active, a.last_at,
         (SELECT max(d.sent_at) FROM admin_drafts d WHERE d.kind = 'thank_you' AND d.status = 'sent' AND d.target_user_id = a.rid)
  FROM agg a JOIN profiles p ON p.id = a.rid
  WHERE a.n_period > 0 AND p.referral_code IS NOT NULL
  ORDER BY a.n_period DESC, a.last_at DESC
  LIMIT 300;
END $$;

-- Thank-you. Super admin: sent straight to her chat. Admin: a waiting draft for a super admin to approve.
-- Both go through the phase 3a functions (admin_send_team_message / admin_draft_create), so delivery, drafts and audit are the same.
CREATE OR REPLACE FUNCTION public.admin_referral_thank_you(_ref_key text, _body text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid; sup boolean := has_role(auth.uid(), 'super_admin');
BEGIN
  IF NOT (sup OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT p.id INTO uid FROM profiles p
  WHERE p.referral_code = _ref_key AND EXISTS (SELECT 1 FROM public._admin_referred() r WHERE r.referrer = p.id);
  IF uid IS NULL THEN RAISE EXCEPTION 'unknown referrer'; END IF;
  IF sup THEN
    PERFORM public.admin_send_team_message(uid, _body, NULL, 'thank_you');
    RETURN 'sent';
  END IF;
  PERFORM public.admin_draft_create('thank_you', _body, NULL, uid);
  RETURN 'waiting';
END $$;

-- ============================================================================
-- 5. TODAY: "Tips to review" now also counts reported words waiting (added into tips_reported). Only that line changes.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_needs_you()
RETURNS TABLE(new_feedback bigint, tips_waiting bigint, tips_reported bigint, message_failures_7d bigint,
              new_referrers_week bigint, link_clicks_total bigint, link_count bigint, click_counting_since timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE sup boolean := has_role(auth.uid(), 'super_admin');
        wk date := date_trunc('week', now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR sup) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT (SELECT count(*) FROM user_feedback f WHERE f.handled_at IS NULL)::bigint,
         (SELECT count(*) FROM together_tips t WHERE t.status = 'pending')::bigint,
         (SELECT count(*) FROM together_tips t WHERE t.status = 'approved' AND t.needs_review)::bigint
           + public._admin_words_waiting(),
         CASE WHEN sup THEN (SELECT count(*) FROM message_failures m WHERE m.created_at >= now() - interval '7 days')::bigint END,
         (SELECT count(DISTINCT o.referred_by) FROM public._admin_onboarded_users() o
           WHERE o.referred_by IS NOT NULL AND (o.onboarded_at AT TIME ZONE 'UTC')::date >= wk)::bigint,
         CASE WHEN sup THEN (SELECT count(*) FROM link_clicks)::bigint END,
         CASE WHEN sup THEN (SELECT count(*) FROM short_links l)::bigint END,
         CASE WHEN sup THEN (SELECT s.link_clicks_since FROM admin_settings s) END;
END $$;

-- ============================================================================
-- 6. Who can call what (roles are checked inside each function)
-- ============================================================================
REVOKE ALL ON FUNCTION public.admin_tip_queue(text), public.admin_tip_totals(), public.admin_review_tip(uuid, text),
                       public.admin_review_word(text, text), public.admin_referrals_summary(text),
                       public.admin_referrals_list(text), public.admin_referral_thank_you(text, text),
                       public.admin_needs_you()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_tip_queue(text), public.admin_tip_totals(), public.admin_review_tip(uuid, text),
                          public.admin_review_word(text, text), public.admin_referrals_summary(text),
                          public.admin_referrals_list(text), public.admin_referral_thank_you(text, text),
                          public.admin_needs_you()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_needs_you() TO service_role;
