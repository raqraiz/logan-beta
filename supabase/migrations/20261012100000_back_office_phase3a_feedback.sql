-- Back office phase 3a: Feedback, the health-detail consent rule, and replies from the Logan team.
-- Health rule: admins always see feedback with health details replaced by [health detail].
-- Super admins see the original only when she said "Yes, they can" (health_consent = true),
-- when no health detail was found, or when it was sent before the question existed (consent_copy_version is null).
-- Every function checks the role inside. Nothing here logs or stores feedback text anywhere but user_feedback.
-- Safe to re-run.

-- ============================================================================
-- 1. Feedback columns
-- ============================================================================
ALTER TABLE public.user_feedback
  ADD COLUMN IF NOT EXISTS message_clean       text,         -- health details replaced by [health detail]
  ADD COLUMN IF NOT EXISTS health_detected     boolean,
  ADD COLUMN IF NOT EXISTS health_consent      boolean,      -- true / false / null (null = no question was needed, or sent before it)
  ADD COLUMN IF NOT EXISTS consent_copy_version text,        -- null = sent before the consent question existed
  ADD COLUMN IF NOT EXISTS consent_at          timestamptz,  -- when she tapped an answer
  ADD COLUMN IF NOT EXISTS theme               text,
  ADD COLUMN IF NOT EXISTS channel             text NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS handled_by          uuid;         -- null with handled_at set = bulk-closed by the migration

-- First run only: add handled_at and close everything older than 30 days in bulk (handled_by stays null, so it is
-- clear nobody answered it). The last 30 days stay New. A re-run does not close anything more.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'user_feedback' AND column_name = 'handled_at') THEN
    ALTER TABLE public.user_feedback ADD COLUMN handled_at timestamptz;
    UPDATE public.user_feedback SET handled_at = now() WHERE created_at < now() - interval '30 days';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_feedback_theme_check') THEN
    ALTER TABLE public.user_feedback ADD CONSTRAINT user_feedback_theme_check
      CHECK (theme IS NULL OR theme IN ('bug','feature','praise','content','other'));
  END IF;
END $$;

-- Older rows get a starting theme from the category she picked herself (no AI). Editable afterwards.
UPDATE public.user_feedback SET theme = CASE category
    WHEN 'bug' THEN 'bug' WHEN 'feature' THEN 'feature' WHEN 'content' THEN 'content' ELSE 'other' END
WHERE theme IS NULL;

CREATE INDEX IF NOT EXISTS user_feedback_handled_idx ON public.user_feedback (handled_at, created_at DESC);

-- Close the two direct doors. Admins read feedback only through the functions below; she writes it only through
-- the submit-feedback function. She can still read her own rows.
DROP POLICY IF EXISTS "Admins can view all feedback" ON public.user_feedback;
DROP POLICY IF EXISTS "Users can insert their own feedback" ON public.user_feedback;

-- ============================================================================
-- 2. Drafts. No direct access: functions only.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_drafts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text NOT NULL CHECK (kind IN ('feedback_reply','thank_you','broadcast','investor_report')),
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,   -- one woman; null for group kinds. Goes with her if she deletes her account.
  feedback_id    uuid,                                               -- the feedback being answered
  target_filters jsonb,                                              -- for group sends later
  body           text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  status         text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','approved','sent','rejected')),
  created_by     uuid NOT NULL,
  approved_by    uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  approved_at    timestamptz,
  sent_at        timestamptz
);
ALTER TABLE public.admin_drafts ENABLE ROW LEVEL SECURITY;          -- no policies = no API access
REVOKE ALL ON public.admin_drafts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_drafts TO service_role;
CREATE INDEX IF NOT EXISTS admin_drafts_status_idx ON public.admin_drafts (status, created_at DESC);

-- ============================================================================
-- 3. Audit log: new action names (the log never holds message text)
-- ============================================================================
ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN
  ('open_user','export_csv','send_data_export','edit_name','delete_user','toggle_internal',
   'draft_created','draft_edited','draft_approved','draft_rejected','message_sent','feedback_handled'));

-- ============================================================================
-- 4. Owner-only helpers
-- ============================================================================
-- The health rule lives here, once. Admins: always the cleaned text, and never the original even if the clean copy is missing.
CREATE OR REPLACE FUNCTION public._feedback_visible_text(_f public.user_feedback, _super boolean)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _super AND (_f.consent_copy_version IS NULL OR _f.health_detected IS NOT TRUE OR _f.health_consent IS TRUE)
      THEN _f.message
    ELSE coalesce(_f.message_clean, '[health detail]')
  END
$$;

CREATE OR REPLACE FUNCTION public._feedback_text_state(_f public.user_feedback)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _f.consent_copy_version IS NULL THEN 'before_question'
    WHEN _f.health_detected IS NOT TRUE THEN 'none'
    WHEN _f.health_consent IS TRUE THEN 'shared'
    ELSE 'hidden'
  END
$$;

-- Puts a message from the Logan team in one woman's chat. role 'system' + team_message, so Logan's AI never reads it as hers.
CREATE OR REPLACE FUNCTION public._admin_deliver_team_message(_user uuid, _body text, _draft uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = _user) THEN RAISE EXCEPTION 'unknown recipient'; END IF;
  INSERT INTO chat_messages(user_id, role, content, message_type, metadata)
  VALUES (_user, 'system', _body, 'text',
          jsonb_build_object('team_message', true, 'from', 'logan_team', 'draft_id', _draft));
END $$;

-- ============================================================================
-- 5. Her consent tap: her own row, once.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_feedback_consent(_id uuid, _allow boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR _allow IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE user_feedback SET health_consent = _allow, consent_at = now()
  WHERE id = _id AND user_id = auth.uid() AND health_detected IS TRUE AND consent_at IS NULL;
END $$;

-- ============================================================================
-- 6. Feedback screen (both roles)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_feedback_list(_tab text, _theme text DEFAULT NULL)
RETURNS TABLE(id uuid, text_shown text, text_state text, first_name text, last_initial text, user_id uuid,
              channel text, theme text, created_at timestamptz, handled boolean)
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
         f.channel, coalesce(f.theme, 'other'), f.created_at, f.handled_at IS NOT NULL
  FROM user_feedback f LEFT JOIN profiles p ON p.id = f.user_id
  WHERE (_tab = 'all' OR (_tab = 'new' AND f.handled_at IS NULL) OR (_tab = 'handled' AND f.handled_at IS NOT NULL))
    AND (_theme IS NULL OR coalesce(f.theme, 'other') = _theme)
  ORDER BY f.created_at DESC
  LIMIT 300;
END $$;

-- Counts for the tabs, the theme chips (within the chosen tab) and the "This month" card (UTC calendar month).
CREATE OR REPLACE FUNCTION public.admin_feedback_counts(_tab text)
RETURNS TABLE(scope text, key text, n bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _tab NOT IN ('new','handled','all') THEN RAISE EXCEPTION 'invalid tab'; END IF;
  RETURN QUERY
  SELECT 'tab'::text, 'new'::text,     (SELECT count(*) FROM user_feedback f WHERE f.handled_at IS NULL)::bigint
  UNION ALL SELECT 'tab', 'handled',   (SELECT count(*) FROM user_feedback f WHERE f.handled_at IS NOT NULL)::bigint
  UNION ALL SELECT 'tab', 'all',       (SELECT count(*) FROM user_feedback f)::bigint
  UNION ALL
  SELECT 'theme', t.k, (SELECT count(*) FROM user_feedback f
                         WHERE coalesce(f.theme, 'other') = t.k
                           AND (_tab = 'all' OR (_tab = 'new' AND f.handled_at IS NULL) OR (_tab = 'handled' AND f.handled_at IS NOT NULL)))::bigint
  FROM (VALUES ('bug'),('feature'),('praise'),('content'),('other')) AS t(k)
  UNION ALL
  SELECT 'month', t.k, (SELECT count(*) FROM user_feedback f
                         WHERE coalesce(f.theme, 'other') = t.k
                           AND (f.created_at AT TIME ZONE 'UTC') >= date_trunc('month', now() AT TIME ZONE 'UTC'))::bigint
  FROM (VALUES ('bug'),('feature'),('praise'),('content'),('other')) AS t(k);
END $$;

CREATE OR REPLACE FUNCTION public.admin_feedback_set_theme(_id uuid, _theme text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _theme IS NULL OR _theme NOT IN ('bug','feature','praise','content','other') THEN RAISE EXCEPTION 'invalid theme'; END IF;
  UPDATE user_feedback SET theme = _theme WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_feedback_mark_handled(_id uuid, _handled boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE user_feedback SET handled_at = CASE WHEN _handled THEN coalesce(handled_at, now()) END,
                           handled_by = CASE WHEN _handled THEN auth.uid() END
  WHERE id = _id RETURNING user_id INTO uid;
  IF FOUND THEN
    INSERT INTO admin_audit_log(admin_id, action, target_user_id) VALUES (auth.uid(), 'feedback_handled', uid);
  END IF;
END $$;

-- ============================================================================
-- 7. Replies through Logan, with approval
-- ============================================================================
-- Anyone on the team can write a draft. It always starts as 'waiting'. For a feedback reply the recipient is read from the
-- feedback row on the server, so admins never need her ID.
CREATE OR REPLACE FUNCTION public.admin_draft_create(_kind text, _body text, _feedback uuid DEFAULT NULL, _user uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid; target uuid := _user;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _kind NOT IN ('feedback_reply','thank_you','broadcast','investor_report') THEN RAISE EXCEPTION 'invalid kind'; END IF;
  IF _body IS NULL OR char_length(btrim(_body)) = 0 OR char_length(_body) > 4000 THEN RAISE EXCEPTION 'invalid message'; END IF;
  IF _feedback IS NOT NULL THEN
    SELECT f.user_id INTO target FROM user_feedback f WHERE f.id = _feedback;
    IF NOT FOUND THEN RAISE EXCEPTION 'unknown feedback'; END IF;
  END IF;
  INSERT INTO admin_drafts(kind, target_user_id, feedback_id, body, status, created_by)
  VALUES (_kind, target, _feedback, btrim(_body), 'waiting', auth.uid()) RETURNING id INTO new_id;
  INSERT INTO admin_audit_log(admin_id, action, target_user_id) VALUES (auth.uid(), 'draft_created', target);
  RETURN new_id;
END $$;

-- Super admin: what is waiting, with the feedback it answers (shown under the same health rule).
CREATE OR REPLACE FUNCTION public.admin_draft_list_waiting()
RETURNS TABLE(id uuid, kind text, body text, created_at timestamptz, feedback_id uuid, feedback_text text,
              first_name text, last_initial text, user_id uuid, written_by text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT d.id, d.kind, d.body, d.created_at, d.feedback_id,
         (SELECT public._feedback_visible_text(f, true) FROM user_feedback f WHERE f.id = d.feedback_id),
         nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''),
         nullif(left(btrim(regexp_replace(btrim(coalesce(p.full_name, '')), '^\S+\s*', '')), 1), ''),
         d.target_user_id,
         nullif(split_part(btrim(coalesce(a.full_name, '')), ' ', 1), '')
  FROM admin_drafts d
  LEFT JOIN profiles p ON p.id = d.target_user_id
  LEFT JOIN profiles a ON a.id = d.created_by
  WHERE d.status = 'waiting'
  ORDER BY d.created_at ASC
  LIMIT 100;
END $$;

CREATE OR REPLACE FUNCTION public.admin_draft_edit(_draft uuid, _body text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _body IS NULL OR char_length(btrim(_body)) = 0 OR char_length(_body) > 4000 THEN RAISE EXCEPTION 'invalid message'; END IF;
  UPDATE admin_drafts SET body = btrim(_body), updated_at = now()
  WHERE id = _draft AND status = 'waiting' RETURNING target_user_id INTO uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft not waiting'; END IF;
  INSERT INTO admin_audit_log(admin_id, action, target_user_id) VALUES (auth.uid(), 'draft_edited', uid);
END $$;

CREATE OR REPLACE FUNCTION public.admin_draft_reject(_draft uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE admin_drafts SET status = 'rejected', updated_at = now()
  WHERE id = _draft AND status = 'waiting' RETURNING target_user_id INTO uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft not waiting'; END IF;
  INSERT INTO admin_audit_log(admin_id, action, target_user_id) VALUES (auth.uid(), 'draft_rejected', uid);
END $$;

-- Approve and send. Delivers to her chat, marks the feedback handled, logs the approval and the send.
CREATE OR REPLACE FUNCTION public.admin_draft_approve_send(_draft uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.admin_drafts%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO d FROM admin_drafts WHERE id = _draft AND status = 'waiting' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft not waiting'; END IF;
  IF d.target_user_id IS NULL OR d.kind NOT IN ('feedback_reply','thank_you') THEN
    RAISE EXCEPTION 'this kind of draft cannot be sent yet';
  END IF;
  PERFORM public._admin_deliver_team_message(d.target_user_id, d.body, d.id);
  UPDATE admin_drafts SET status = 'sent', approved_by = auth.uid(), approved_at = now(), sent_at = now(), updated_at = now()
  WHERE id = d.id;
  IF d.feedback_id IS NOT NULL THEN
    UPDATE user_feedback SET handled_at = coalesce(handled_at, now()), handled_by = coalesce(handled_by, auth.uid())
    WHERE id = d.feedback_id;
  END IF;
  INSERT INTO admin_audit_log(admin_id, action, target_user_id) VALUES (auth.uid(), 'draft_approved', d.target_user_id);
  INSERT INTO admin_audit_log(admin_id, action, target_user_id) VALUES (auth.uid(), 'message_sent', d.target_user_id);
END $$;

-- Super admin sends directly (no approval needed). A 'sent' draft row is kept as the record.
CREATE OR REPLACE FUNCTION public.admin_send_team_message(_user uuid, _body text, _feedback uuid DEFAULT NULL, _kind text DEFAULT 'feedback_reply')
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _kind NOT IN ('feedback_reply','thank_you') THEN RAISE EXCEPTION 'invalid kind'; END IF;
  IF _body IS NULL OR char_length(btrim(_body)) = 0 OR char_length(_body) > 4000 THEN RAISE EXCEPTION 'invalid message'; END IF;
  IF _feedback IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user_feedback f WHERE f.id = _feedback AND f.user_id = _user) THEN
    RAISE EXCEPTION 'feedback does not match recipient';
  END IF;
  INSERT INTO admin_drafts(kind, target_user_id, feedback_id, body, status, created_by, approved_by, approved_at, sent_at)
  VALUES (_kind, _user, _feedback, btrim(_body), 'sent', auth.uid(), auth.uid(), now(), now()) RETURNING id INTO new_id;
  PERFORM public._admin_deliver_team_message(_user, btrim(_body), new_id);
  IF _feedback IS NOT NULL THEN
    UPDATE user_feedback SET handled_at = coalesce(handled_at, now()), handled_by = coalesce(handled_by, auth.uid())
    WHERE id = _feedback;
  END IF;
  INSERT INTO admin_audit_log(admin_id, action, target_user_id) VALUES (auth.uid(), 'message_sent', _user);
  RETURN new_id;
END $$;

-- ============================================================================
-- 8. One-off cleanup of older feedback (called by the backfill-feedback-clean function, service role only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._feedback_needing_clean(_limit integer)
RETURNS TABLE(id uuid, message text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, f.message FROM user_feedback f WHERE f.message_clean IS NULL ORDER BY f.created_at LIMIT _limit
$$;

-- ============================================================================
-- 9. TODAY: "New feedback" = not handled yet (no longer the last 7 days). Only that line changes.
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
         (SELECT count(*) FROM together_tips t WHERE t.status = 'approved' AND t.needs_review)::bigint,
         CASE WHEN sup THEN (SELECT count(*) FROM message_failures m WHERE m.created_at >= now() - interval '7 days')::bigint END,
         (SELECT count(DISTINCT o.referred_by) FROM public._admin_onboarded_users() o
           WHERE o.referred_by IS NOT NULL AND (o.onboarded_at AT TIME ZONE 'UTC')::date >= wk)::bigint,
         CASE WHEN sup THEN (SELECT count(*) FROM link_clicks)::bigint END,
         CASE WHEN sup THEN (SELECT count(*) FROM short_links l)::bigint END,
         CASE WHEN sup THEN (SELECT s.link_clicks_since FROM admin_settings s) END;
END $$;

-- ============================================================================
-- 10. Who can call what. Helpers: nobody from the API. Screen functions: signed-in users only (roles are checked inside).
-- ============================================================================
REVOKE ALL ON FUNCTION public._feedback_visible_text(public.user_feedback, boolean),
                       public._feedback_text_state(public.user_feedback),
                       public._admin_deliver_team_message(uuid, text, uuid),
                       public._feedback_needing_clean(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._feedback_needing_clean(integer) TO service_role;

REVOKE ALL ON FUNCTION public.set_feedback_consent(uuid, boolean),
                       public.admin_feedback_list(text, text),
                       public.admin_feedback_counts(text),
                       public.admin_feedback_set_theme(uuid, text),
                       public.admin_feedback_mark_handled(uuid, boolean),
                       public.admin_draft_create(text, text, uuid, uuid),
                       public.admin_draft_list_waiting(),
                       public.admin_draft_edit(uuid, text),
                       public.admin_draft_reject(uuid),
                       public.admin_draft_approve_send(uuid),
                       public.admin_send_team_message(uuid, text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_feedback_consent(uuid, boolean),
                          public.admin_feedback_list(text, text),
                          public.admin_feedback_counts(text),
                          public.admin_feedback_set_theme(uuid, text),
                          public.admin_feedback_mark_handled(uuid, boolean),
                          public.admin_draft_create(text, text, uuid, uuid),
                          public.admin_draft_list_waiting(),
                          public.admin_draft_edit(uuid, text),
                          public.admin_draft_reject(uuid),
                          public.admin_draft_approve_send(uuid),
                          public.admin_send_team_message(uuid, text, uuid, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.admin_needs_you() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_needs_you() TO authenticated, service_role;
