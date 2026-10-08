-- "Seen" indicators for team messages. Uses team_messages.read_at, which is already set when she opens her inbox.
-- Nothing about the inbox or how read_at is set changes. No new table access: only these admin_* functions read it.
--   Broadcasts: totals only (opened X of Y). Replies and thank-yous: Seen / Not seen yet; only a super admin gets the date.
-- Return shapes change, so each function is dropped and recreated, then the same grants are applied again. Safe to re-run.

-- ============================================================================
-- 1. Send > Sent: how many women opened each broadcast (totals only, never who)
-- ============================================================================
DROP FUNCTION IF EXISTS public.admin_broadcast_history();
CREATE FUNCTION public.admin_broadcast_history()
RETURNS TABLE(id uuid, status text, audience_label text, recipient_count integer, created_at timestamptz,
              sent_at timestamptz, written_by text, sent_by text, body text, opened_count bigint, delivered_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE sup boolean := has_role(auth.uid(), 'super_admin');
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR sup) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT d.id, d.status, public._broadcast_audience_label(d.audience), d.recipient_count, d.created_at, d.sent_at,
         nullif(split_part(btrim(coalesce(w.full_name, '')), ' ', 1), ''),
         nullif(split_part(btrim(coalesce(s.full_name, '')), ' ', 1), ''),
         CASE WHEN sup OR d.created_by = auth.uid() THEN d.body END,
         CASE WHEN d.status = 'sent' THEN (SELECT count(*) FROM team_messages m WHERE m.draft_id = d.id AND m.read_at IS NOT NULL) END,
         CASE WHEN d.status = 'sent' THEN (SELECT count(*) FROM team_messages m WHERE m.draft_id = d.id) END
  FROM admin_drafts d
  LEFT JOIN profiles w ON w.id = d.created_by
  LEFT JOIN profiles s ON s.id = d.approved_by
  WHERE d.kind = 'broadcast' AND d.status IN ('waiting', 'sent')
  ORDER BY coalesce(d.sent_at, d.created_at) DESC
  LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION public.admin_broadcast_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_history() TO authenticated;

-- ============================================================================
-- 2. Feedback: seen state of the latest sent reply to each note
--    reply_state: 'none' (no reply sent), 'not_seen', 'seen'. reply_seen_at is the date for super admins only.
-- ============================================================================
DROP FUNCTION IF EXISTS public.admin_feedback_list(text, text);
CREATE FUNCTION public.admin_feedback_list(_tab text, _theme text DEFAULT NULL)
RETURNS TABLE(id uuid, text_shown text, text_state text, first_name text, last_initial text, user_id uuid,
              channel text, theme text, created_at timestamptz, handled boolean, topic text,
              reply_state text, reply_seen_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE sup boolean := has_role(auth.uid(), 'super_admin');
BEGIN
  IF NOT (sup OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _tab NOT IN ('new','handled','all') THEN RAISE EXCEPTION 'invalid tab'; END IF;
  IF _theme IS NOT NULL AND _theme NOT IN ('bug','feature','praise','content','other') THEN RAISE EXCEPTION 'invalid theme'; END IF;
  RETURN QUERY
  SELECT f.id,
         public._feedback_visible_text(f, sup),
         public._feedback_text_state(f),
         nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''),
         CASE WHEN sup THEN nullif(left(btrim(regexp_replace(btrim(coalesce(p.full_name, '')), '^\S+\s*', '')), 1), '') END,
         CASE WHEN sup THEN f.user_id END,
         f.channel, coalesce(f.theme, 'other'), f.created_at, f.handled_at IS NOT NULL,
         f.topic,
         CASE WHEN r.draft_id IS NULL THEN 'none' WHEN r.read_at IS NULL THEN 'not_seen' ELSE 'seen' END,
         CASE WHEN sup THEN r.read_at END
  FROM user_feedback f
  LEFT JOIN profiles p ON p.id = f.user_id
  LEFT JOIN LATERAL (
    SELECT d.id AS draft_id, m.read_at
    FROM admin_drafts d
    LEFT JOIN team_messages m ON m.draft_id = d.id
    WHERE d.feedback_id = f.id AND d.kind = 'feedback_reply' AND d.status = 'sent'
    ORDER BY d.sent_at DESC NULLS LAST
    LIMIT 1
  ) r ON true
  WHERE (_tab = 'all' OR (_tab = 'new' AND f.handled_at IS NULL) OR (_tab = 'handled' AND f.handled_at IS NOT NULL))
    AND (_theme IS NULL OR coalesce(f.theme, 'other') = _theme)
  ORDER BY f.created_at DESC
  LIMIT 300;
END $$;
REVOKE ALL ON FUNCTION public.admin_feedback_list(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_feedback_list(text, text) TO authenticated;

-- ============================================================================
-- 3. Referrals: seen state of the latest sent thank-you (same rules as above)
-- ============================================================================
DROP FUNCTION IF EXISTS public.admin_referrals_list(text);
CREATE FUNCTION public.admin_referrals_list(_period text)
RETURNS TABLE(ref_key text, first_name text, last_initial text, user_id uuid, signups bigint, all_time bigint,
              active_base bigint, active bigint, last_referral timestamptz, thanked_at timestamptz,
              thanks_state text, thanks_seen_at timestamptz)
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
         (SELECT max(d.sent_at) FROM admin_drafts d WHERE d.kind = 'thank_you' AND d.status = 'sent' AND d.target_user_id = a.rid),
         CASE WHEN t.draft_id IS NULL THEN 'none' WHEN t.read_at IS NULL THEN 'not_seen' ELSE 'seen' END,
         CASE WHEN sup THEN t.read_at END
  FROM agg a
  JOIN profiles p ON p.id = a.rid
  LEFT JOIN LATERAL (
    SELECT d.id AS draft_id, m.read_at
    FROM admin_drafts d
    LEFT JOIN team_messages m ON m.draft_id = d.id
    WHERE d.kind = 'thank_you' AND d.status = 'sent' AND d.target_user_id = a.rid
    ORDER BY d.sent_at DESC NULLS LAST
    LIMIT 1
  ) t ON true
  WHERE a.n_period > 0 AND p.referral_code IS NOT NULL
  ORDER BY a.n_period DESC, a.last_at DESC
  LIMIT 300;
END $$;
REVOKE ALL ON FUNCTION public.admin_referrals_list(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_referrals_list(text) TO authenticated;
