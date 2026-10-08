-- Back office phase 2: Users list and one woman's page. Super admin only.
-- Everything returned is identity and counts. No message text, no health fields.
-- Every public function checks super_admin inside. Admins have no access to any of them.
-- Functions that write to the audit log are VOLATILE (never STABLE).
-- Participants are always matched by user_id, never by email.

-- ============================================================================
-- 1. Audit log: who, what, which user, when. No content.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id       uuid NOT NULL,
  action         text NOT NULL CHECK (action IN
    ('open_user','export_csv','send_data_export','edit_name','delete_user','toggle_internal')),
  target_user_id uuid,                      -- no FK, so rows survive her deletion
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;   -- no policies = no API access
REVOKE ALL ON public.admin_audit_log FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION public._admin_is_super() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT public.has_role(auth.uid(), 'super_admin') $$;

CREATE OR REPLACE FUNCTION public.admin_log_action(_action text, _target uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._admin_is_super() THEN RAISE EXCEPTION 'not authorized'; END IF;
  INSERT INTO admin_audit_log(admin_id, action, target_user_id) VALUES (auth.uid(), _action, _target);
END $$;

-- ============================================================================
-- 2. Helpers (owner-only). Same "active" definition as _admin_user_events, but
--    without the internal-account filter, and optionally for one woman only.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._admin_user_events_any(_from timestamptz, _user uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, ts timestamptz, from_chat boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, m.created_at, true FROM chat_messages m
   WHERE m.role = 'user' AND (_from IS NULL OR m.created_at >= _from)
     AND (_user IS NULL OR m.user_id = _user)
  UNION ALL
  SELECT s.user_id, s.logged_at, false FROM symptom_logs s
   WHERE (_from IS NULL OR s.logged_at >= _from)
     AND (_user IS NULL OR s.user_id = _user)
  UNION ALL
  SELECT a.user_id, a.created_at, false FROM user_activity_events a
   WHERE (a.event_type IN ('click','page_view','tab_switch','widget_interact')
          OR position('.' IN a.event_type) > 0)
     AND (_from IS NULL OR a.created_at >= _from)
     AND (_user IS NULL OR a.user_id = _user)
$$;

CREATE OR REPLACE FUNCTION public._admin_is_onboarded(_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.user_id = _user
                 AND (cm.metadata ->> 'onboarding_complete') = 'true')
$$;

-- "Maya Levi" -> "Maya L."; one word stays as is.
CREATE OR REPLACE FUNCTION public._admin_short_name(_full text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN btrim(coalesce(_full, '')) = '' THEN 'Unnamed'
              WHEN position(' ' IN btrim(_full)) = 0 THEN btrim(_full)
              ELSE split_part(btrim(_full), ' ', 1) || ' ' ||
                   upper(left(regexp_replace(btrim(_full), '^.*\s', ''), 1)) || '.' END
$$;

CREATE OR REPLACE FUNCTION public._admin_came_from(_referred_by uuid, _campaign text, _source text, _referrer text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN _referred_by IS NOT NULL
              THEN 'Referral: ' || COALESCE((SELECT public._admin_short_name(rp.full_name)
                                             FROM profiles rp WHERE rp.id = _referred_by), 'a member')
              ELSE COALESCE(NULLIF(_campaign, ''), NULLIF(_source, ''), NULLIF(_referrer, ''), 'Direct') END
$$;

-- All onboarded women with identity and counts, for the list and the CSV.
CREATE OR REPLACE FUNCTION public._admin_user_rows()
RETURNS TABLE(user_id uuid, display_name text, email text, joined_at timestamptz,
              last_active_at timestamptz, msgs_30d bigint, referrals bigint,
              came_from text, is_internal boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH onb AS (
    SELECT p.* FROM profiles p WHERE public._admin_is_onboarded(p.id)
  ), ev AS MATERIALIZED (
    SELECT e.user_id, max(e.ts) AS last_ts,
           count(*) FILTER (WHERE e.from_chat AND e.ts >= now() - interval '30 days') AS msgs
    FROM public._admin_user_events_any(NULL) e GROUP BY e.user_id
  ), refs AS (
    SELECT r.referred_by AS uid, count(*) AS n FROM onb r WHERE r.referred_by IS NOT NULL GROUP BY 1
  )
  SELECT o.id, public._admin_short_name(o.full_name), o.email, o.created_at,
         ev.last_ts, COALESCE(ev.msgs, 0), COALESCE(refs.n, 0),
         public._admin_came_from(o.referred_by, o.utm_campaign, o.utm_source, o.referrer),
         COALESCE(o.is_internal, false)
  FROM onb o LEFT JOIN ev ON ev.user_id = o.id LEFT JOIN refs ON refs.uid = o.id
$$;

REVOKE ALL ON FUNCTION public._admin_user_events_any(timestamptz, uuid),
  public._admin_is_onboarded(uuid), public._admin_short_name(text),
  public._admin_came_from(uuid, text, text, text), public._admin_user_rows()
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. The list: server-side search, sort, filter and paging. total_count rides on each row.
--    No audit write here, so STABLE is correct.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_users_list(
  _search text DEFAULT NULL, _sort text DEFAULT 'last_active',
  _filter text DEFAULT NULL,            -- 'active7' | 'quiet14' | 'new7' | NULL
  _hide_internal boolean DEFAULT true, _limit int DEFAULT 50, _offset int DEFAULT 0)
RETURNS TABLE(user_id uuid, display_name text, joined_at timestamptz, last_active_at timestamptz,
              msgs_30d bigint, referrals bigint, came_from text, is_internal boolean, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public._admin_is_super() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT r.user_id, r.display_name, r.joined_at, r.last_active_at, r.msgs_30d, r.referrals,
         r.came_from, r.is_internal, count(*) OVER ()
  FROM public._admin_user_rows() r
  WHERE (NOT _hide_internal OR NOT r.is_internal)
    AND (_search IS NULL OR _search = '' OR
         r.display_name ILIKE '%' || replace(replace(_search, '%', '\%'), '_', '\_') || '%' OR
         r.email        ILIKE '%' || replace(replace(_search, '%', '\%'), '_', '\_') || '%')
    AND (_filter IS NULL
         OR (_filter = 'active7' AND r.last_active_at >= now() - interval '7 days')
         OR (_filter = 'quiet14' AND (r.last_active_at IS NULL OR r.last_active_at < now() - interval '14 days'))
         OR (_filter = 'new7'    AND r.joined_at >= now() - interval '7 days'))
  ORDER BY
    CASE WHEN _sort = 'messages'  THEN r.msgs_30d  END DESC NULLS LAST,
    CASE WHEN _sort = 'referrals' THEN r.referrals END DESC NULLS LAST,
    CASE WHEN _sort NOT IN ('messages', 'referrals') THEN r.last_active_at END DESC NULLS LAST,
    r.user_id
  LIMIT LEAST(GREATEST(_limit, 1), 200) OFFSET GREATEST(_offset, 0);
END $$;

-- ============================================================================
-- 4. CSV: same filters, adds email, capped at 5000. Writes the audit log, so VOLATILE.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_users_export(
  _search text DEFAULT NULL, _sort text DEFAULT 'last_active',
  _filter text DEFAULT NULL, _hide_internal boolean DEFAULT true)
RETURNS TABLE(display_name text, email text, joined_at timestamptz, last_active_at timestamptz,
              msgs_30d bigint, referrals bigint, came_from text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public._admin_is_super() THEN RAISE EXCEPTION 'not authorized'; END IF;
  INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'export_csv');
  RETURN QUERY
  SELECT r.display_name, r.email, r.joined_at, r.last_active_at, r.msgs_30d, r.referrals, r.came_from
  FROM public._admin_user_rows() r
  WHERE (NOT _hide_internal OR NOT r.is_internal)
    AND (_search IS NULL OR _search = '' OR
         r.display_name ILIKE '%' || replace(replace(_search, '%', '\%'), '_', '\_') || '%' OR
         r.email        ILIKE '%' || replace(replace(_search, '%', '\%'), '_', '\_') || '%')
    AND (_filter IS NULL
         OR (_filter = 'active7' AND r.last_active_at >= now() - interval '7 days')
         OR (_filter = 'quiet14' AND (r.last_active_at IS NULL OR r.last_active_at < now() - interval '14 days'))
         OR (_filter = 'new7'    AND r.joined_at >= now() - interval '7 days'))
  ORDER BY
    CASE WHEN _sort = 'messages'  THEN r.msgs_30d  END DESC NULLS LAST,
    CASE WHEN _sort = 'referrals' THEN r.referrals END DESC NULLS LAST,
    CASE WHEN _sort NOT IN ('messages', 'referrals') THEN r.last_active_at END DESC NULLS LAST,
    r.user_id
  LIMIT 5000;
END $$;

-- ============================================================================
-- 5. Her page. Computed for her alone (never builds rows for everyone). Writes the
--    audit log, so VOLATILE. Returns no row if she does not exist (and logs nothing).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_user_detail(_user_id uuid)
RETURNS TABLE(user_id uuid, full_name text, email text, joined_at timestamptz, came_from text,
  is_internal boolean, last_active_at timestamptz, sessions_30d bigint, msgs_30d bigint,
  headsups_sent bigint, feedback_count bigint, referrals_invited bigint, referrals_active bigint,
  tips_live bigint, tips_reported bigint,
  health_consent boolean, health_consent_at timestamptz,
  together_consent boolean, together_consent_at timestamptz, together_consent_version text,
  marketing_on boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public._admin_is_super() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _user_id) THEN RETURN; END IF;
  INSERT INTO admin_audit_log(admin_id, action, target_user_id) VALUES (auth.uid(), 'open_user', _user_id);
  RETURN QUERY
  WITH ev AS MATERIALIZED (
    SELECT e.ts, e.from_chat, (e.ts AT TIME ZONE 'UTC')::date AS day
    FROM public._admin_user_events_any(now() - interval '30 days', _user_id) e
  ),
  g AS (
    SELECT CASE WHEN lag(ev.ts) OVER w IS NULL OR ev.ts - lag(ev.ts) OVER w >= interval '30 minutes'
                THEN 1 ELSE 0 END AS ns
    FROM ev WINDOW w AS (PARTITION BY ev.day ORDER BY ev.ts)
  ),
  inv AS (
    SELECT c.id FROM profiles c WHERE c.referred_by = _user_id AND public._admin_is_onboarded(c.id)
  )
  SELECT p.id, p.full_name, p.email, p.created_at,
    public._admin_came_from(p.referred_by, p.utm_campaign, p.utm_source, p.referrer),
    COALESCE(p.is_internal, false),
    (SELECT max(e.ts) FROM public._admin_user_events_any(NULL, _user_id) e),
    (SELECT COALESCE(sum(g.ns), 0) FROM g)::bigint,
    (SELECT count(*) FROM ev WHERE ev.from_chat)::bigint,
    (SELECT count(*) FROM partner_headsup_events h WHERE h.user_id = _user_id AND h.sent_at IS NOT NULL)::bigint,
    (SELECT count(*) FROM user_feedback f WHERE f.user_id = _user_id)::bigint,
    (SELECT count(*) FROM inv)::bigint,
    (SELECT count(*) FROM inv WHERE EXISTS (
       SELECT 1 FROM public._admin_user_events_any(now() - interval '14 days', inv.id)))::bigint,
    (SELECT count(*) FROM together_tips t WHERE t.author_id = _user_id AND t.status = 'approved')::bigint,
    (SELECT count(*) FROM together_tips t WHERE t.author_id = _user_id AND t.report_count > 0)::bigint,
    pa.consent_given, pa.consent_given_at,
    p.together_consent, p.together_consent_at, p.together_consent_version,
    NOT p.marketing_opt_out
  FROM profiles p
  LEFT JOIN LATERAL (
    SELECT x.consent_given, x.consent_given_at FROM participants x
    WHERE x.user_id = p.id ORDER BY x.created_at DESC LIMIT 1
  ) pa ON true
  WHERE p.id = _user_id;
END $$;

-- ============================================================================
-- 6. Edit display name only. Both places it is stored; participants matched by user_id.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_user_set_name(_user_id uuid, _name text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE n text := btrim(_name);
BEGIN
  IF NOT public._admin_is_super() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF n IS NULL OR length(n) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'invalid name'; END IF;
  UPDATE profiles SET full_name = n WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  UPDATE participants SET full_name = n WHERE user_id = _user_id;
  INSERT INTO admin_audit_log(admin_id, action, target_user_id) VALUES (auth.uid(), 'edit_name', _user_id);
END $$;

-- ============================================================================
-- 7. Internal toggle: wraps the existing function and logs in the same step.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_user_set_internal(_user_id uuid, _internal boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._admin_is_super() THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM public.admin_set_user_internal(_user_id, _internal);
  INSERT INTO admin_audit_log(admin_id, action, target_user_id) VALUES (auth.uid(), 'toggle_internal', _user_id);
END $$;

-- ============================================================================
-- 8. After-delete check, for the delete-user and delete-account edge functions only
--    (service role). Counts rows still carrying her id in EVERY public table that has a
--    user_id column, found from the catalog so a newly added table is checked automatically.
--    Returns only tables with rows left. The audit log has no user_id column and is kept on purpose.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_leftover_rows(_user_id uuid)
RETURNS TABLE(table_name text, row_count bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE t record; c bigint;
BEGIN
  FOR t IN
    SELECT col.table_name::text AS tn
    FROM information_schema.columns col
    JOIN information_schema.tables tb
      ON tb.table_schema = col.table_schema AND tb.table_name = col.table_name AND tb.table_type = 'BASE TABLE'
    WHERE col.table_schema = 'public' AND col.column_name = 'user_id' AND col.data_type = 'uuid'
    ORDER BY 1
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', t.tn) INTO c USING _user_id;
    IF c > 0 THEN table_name := t.tn; row_count := c; RETURN NEXT; END IF;
  END LOOP;
END $$;

-- ============================================================================
-- Grants. Browser-callable functions re-check super_admin inside. The leftover check is service role only.
-- ============================================================================
REVOKE ALL ON FUNCTION public._admin_is_super(), public.admin_log_action(text, uuid),
  public.admin_users_list(text, text, text, boolean, int, int),
  public.admin_users_export(text, text, text, boolean), public.admin_user_detail(uuid),
  public.admin_user_set_name(uuid, text), public.admin_user_set_internal(uuid, boolean),
  public.admin_leftover_rows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_action(text, uuid),
  public.admin_users_list(text, text, text, boolean, int, int),
  public.admin_users_export(text, text, text, boolean), public.admin_user_detail(uuid),
  public.admin_user_set_name(uuid, text), public.admin_user_set_internal(uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_leftover_rows(uuid) TO service_role;
