-- Back office phase 4: Send. One message from the Logan team to a group of women, into each woman's team inbox
-- (team_messages, kind 'broadcast'). Never the Logan chat.
-- Audience: everyone, or one or more life stages, same women and same stage source as the rest of the back office
-- (_admin_onboarded_users: onboarded, not internal). A filtered audience under 10 women cannot be drafted or sent.
-- Admins write drafts; super admins approve, edit, reject, or send directly. Each draft can be sent once.
-- The audit log records who, when, the audience and the number of women. Never the message text.
-- Safe to re-run.

-- ============================================================================
-- 1. Columns and constraints
-- ============================================================================
-- Drop whatever the old kind check is called (it only allowed feedback_reply and thank_you), then add the wider one.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.team_messages'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.team_messages DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.team_messages ADD CONSTRAINT team_messages_kind_check
  CHECK (kind IN ('feedback_reply','thank_you','broadcast'));

ALTER TABLE public.admin_drafts
  ADD COLUMN IF NOT EXISTS audience        jsonb,      -- {"type":"all"} or {"type":"stages","stages":[...]}; broadcasts only
  ADD COLUMN IF NOT EXISTS recipient_count integer;    -- count when drafted; replaced by the number actually delivered on send

-- A broadcast must carry an audience (it has no single target woman). Not validated against old rows: there are none.
ALTER TABLE public.admin_drafts DROP CONSTRAINT IF EXISTS admin_drafts_broadcast_needs_audience;
ALTER TABLE public.admin_drafts ADD CONSTRAINT admin_drafts_broadcast_needs_audience
  CHECK (kind <> 'broadcast' OR audience IS NOT NULL) NOT VALID;

ALTER TABLE public.admin_audit_log
  ADD COLUMN IF NOT EXISTS audience        text,       -- e.g. "Everyone" or "Pregnant, Postpartum". Never message text.
  ADD COLUMN IF NOT EXISTS recipient_count integer;
ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN
  ('open_user','export_csv','send_data_export','edit_name','delete_user','toggle_internal',
   'draft_created','draft_edited','draft_approved','draft_rejected','message_sent','feedback_handled',
   'tip_approved','tip_removed','tip_author_removed','word_approved','word_removed',
   'broadcast_sent'));

-- ============================================================================
-- 2. Owner-only helpers (nobody can call these from the API)
-- ============================================================================
-- Checks and normalizes an audience. IUD is not a stage: the database records no device, so it can never be told apart
-- from other hormonal birth control (see _admin_onboarded_users).
CREATE OR REPLACE FUNCTION public._broadcast_audience_clean(_aud jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE ok text[] := ARRAY['pregnant','postpartum','bc_hormonal','irregular','menopausal','regular','not_set'];
        st text[];
BEGIN
  IF _aud IS NULL OR jsonb_typeof(_aud) <> 'object' THEN RAISE EXCEPTION 'invalid audience'; END IF;
  IF _aud ->> 'type' = 'all' THEN RETURN jsonb_build_object('type', 'all'); END IF;
  IF _aud ->> 'type' IS DISTINCT FROM 'stages' OR jsonb_typeof(_aud -> 'stages') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid audience';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(_aud -> 'stages') x WHERE x <> ALL (ok)) THEN
    RAISE EXCEPTION 'invalid audience';
  END IF;
  SELECT array_agg(u.o ORDER BY u.ord) INTO st
  FROM unnest(ok) WITH ORDINALITY u(o, ord)
  WHERE u.o IN (SELECT jsonb_array_elements_text(_aud -> 'stages'));
  IF st IS NULL THEN RAISE EXCEPTION 'invalid audience'; END IF;
  RETURN jsonb_build_object('type', 'stages', 'stages', to_jsonb(st));
END $$;

-- The women in a (cleaned) audience.
CREATE OR REPLACE FUNCTION public._broadcast_audience_users(_aud jsonb)
RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.user_id FROM public._admin_onboarded_users() o
  WHERE _aud ->> 'type' = 'all'
     OR o.stage IN (SELECT jsonb_array_elements_text(_aud -> 'stages'))
$$;

CREATE OR REPLACE FUNCTION public._broadcast_audience_count(_aud jsonb)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM public._broadcast_audience_users(_aud)
$$;

-- Plain-words description of an audience, for the audit log and the lists.
CREATE OR REPLACE FUNCTION public._broadcast_audience_label(_aud jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _aud IS NULL THEN NULL
    WHEN _aud ->> 'type' = 'all' THEN 'Everyone'
    ELSE coalesce((
      SELECT string_agg(CASE t.s
               WHEN 'pregnant'    THEN 'Pregnant'
               WHEN 'postpartum'  THEN 'Postpartum'
               WHEN 'bc_hormonal' THEN 'Birth control: pill / other hormonal'
               WHEN 'irregular'   THEN 'Irregular / PCOS'
               WHEN 'menopausal'  THEN 'Perimenopause / menopause'
               WHEN 'regular'     THEN 'Regular cycle'
               WHEN 'not_set'     THEN 'Not set'
               ELSE t.s END, ', ' ORDER BY t.ord)
      FROM jsonb_array_elements_text(_aud -> 'stages') WITH ORDINALITY t(s, ord)), 'Everyone')
  END
$$;

-- Recounts the audience and inserts every inbox row in ONE statement. Returns the number actually delivered.
-- Blocks (and undoes everything) when nobody is in the audience, or a filtered audience is under 10.
-- Women whose account is deleted while this runs are skipped (their account row is locked while we insert).
CREATE OR REPLACE FUNCTION public._broadcast_deliver(_draft uuid, _aud jsonb, _body text)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint; sent integer; filtered boolean := (_aud ->> 'type') <> 'all';
BEGIN
  n := public._broadcast_audience_count(_aud);
  IF n = 0 THEN RAISE EXCEPTION 'nobody to send to'; END IF;
  IF filtered AND n < 10 THEN RAISE EXCEPTION 'audience too small'; END IF;

  INSERT INTO team_messages(user_id, body, kind, draft_id)
  SELECT u.user_id, _body, 'broadcast', _draft
  FROM public._broadcast_audience_users(_aud) u
  JOIN auth.users a ON a.id = u.user_id
  FOR KEY SHARE OF a;
  GET DIAGNOSTICS sent = ROW_COUNT;

  IF sent = 0 THEN RAISE EXCEPTION 'nobody to send to'; END IF;
  IF filtered AND sent < 10 THEN RAISE EXCEPTION 'audience too small'; END IF;
  RETURN sent;
END $$;

-- ============================================================================
-- 3. Screen functions (roles are checked inside)
-- ============================================================================
-- Live recipient count. -1 means "Fewer than 10" (filtered audiences only). Counts only, no names.
CREATE OR REPLACE FUNCTION public.admin_broadcast_count(_audience jsonb)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a jsonb; n bigint;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  a := public._broadcast_audience_clean(_audience);
  n := public._broadcast_audience_count(a);
  RETURN CASE WHEN a ->> 'type' = 'all' THEN n ELSE public._admin_small(n, true) END;
END $$;

-- Admin (or super admin) saves a draft. It always starts as 'waiting'.
CREATE OR REPLACE FUNCTION public.admin_broadcast_draft_create(_audience jsonb, _body text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE a jsonb; n bigint; new_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _body IS NULL OR char_length(btrim(_body)) = 0 OR char_length(btrim(_body)) > 4000 THEN RAISE EXCEPTION 'invalid message'; END IF;
  a := public._broadcast_audience_clean(_audience);
  n := public._broadcast_audience_count(a);
  IF n = 0 THEN RAISE EXCEPTION 'nobody to send to'; END IF;
  IF a ->> 'type' <> 'all' AND n < 10 THEN RAISE EXCEPTION 'audience too small'; END IF;
  INSERT INTO admin_drafts(kind, body, status, created_by, audience, recipient_count)
  VALUES ('broadcast', btrim(_body), 'waiting', auth.uid(), a, n) RETURNING id INTO new_id;
  INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'draft_created');
  RETURN new_id;
END $$;

-- Super admin approves a waiting draft and sends it. The draft row is locked, so a second super admin approving at the
-- same moment waits, then finds it no longer 'waiting' and nothing is sent twice.
CREATE OR REPLACE FUNCTION public.admin_broadcast_approve_send(_draft uuid)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.admin_drafts%ROWTYPE; sent integer;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO d FROM admin_drafts WHERE id = _draft AND kind = 'broadcast' AND status = 'waiting' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft not waiting'; END IF;
  sent := public._broadcast_deliver(d.id, d.audience, d.body);
  UPDATE admin_drafts
  SET status = 'sent', approved_by = auth.uid(), approved_at = now(), sent_at = now(), updated_at = now(), recipient_count = sent
  WHERE id = d.id;
  INSERT INTO admin_audit_log(admin_id, action) VALUES (auth.uid(), 'draft_approved');
  INSERT INTO admin_audit_log(admin_id, action, audience, recipient_count)
  VALUES (auth.uid(), 'broadcast_sent', public._broadcast_audience_label(d.audience), sent);
  RETURN sent;
END $$;

-- Super admin sends directly. The page makes up _id before the first click, so a double click or a retry with the same
-- _id is refused ("already sent"). If the send is blocked, everything is undone and the same _id can be used again.
CREATE OR REPLACE FUNCTION public.admin_broadcast_send_direct(_id uuid, _audience jsonb, _body text)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE a jsonb; sent integer;
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _id IS NULL THEN RAISE EXCEPTION 'invalid request'; END IF;
  IF _body IS NULL OR char_length(btrim(_body)) = 0 OR char_length(btrim(_body)) > 4000 THEN RAISE EXCEPTION 'invalid message'; END IF;
  a := public._broadcast_audience_clean(_audience);
  INSERT INTO admin_drafts(id, kind, body, status, created_by, approved_by, approved_at, sent_at, audience, recipient_count)
  VALUES (_id, 'broadcast', btrim(_body), 'sent', auth.uid(), auth.uid(), now(), now(), a, 0)
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'already sent'; END IF;
  sent := public._broadcast_deliver(_id, a, btrim(_body));
  UPDATE admin_drafts SET recipient_count = sent WHERE id = _id;
  INSERT INTO admin_audit_log(admin_id, action, audience, recipient_count)
  VALUES (auth.uid(), 'broadcast_sent', public._broadcast_audience_label(a), sent);
  RETURN sent;
END $$;

-- "Send a test to me": super admin only, to her own inbox only. No draft, no audit entry, no history.
CREATE OR REPLACE FUNCTION public.admin_broadcast_send_test(_body text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _body IS NULL OR char_length(btrim(_body)) = 0 OR char_length(btrim(_body)) > 4000 THEN RAISE EXCEPTION 'invalid message'; END IF;
  INSERT INTO team_messages(user_id, body, kind) VALUES (auth.uid(), btrim(_body), 'broadcast');
END $$;

-- Sent broadcasts and drafts still waiting. Super admin sees every text; an admin only sees the text of drafts they wrote.
CREATE OR REPLACE FUNCTION public.admin_broadcast_history()
RETURNS TABLE(id uuid, status text, audience_label text, recipient_count integer, created_at timestamptz,
              sent_at timestamptz, written_by text, sent_by text, body text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE sup boolean := has_role(auth.uid(), 'super_admin');
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR sup) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT d.id, d.status, public._broadcast_audience_label(d.audience), d.recipient_count, d.created_at, d.sent_at,
         nullif(split_part(btrim(coalesce(w.full_name, '')), ' ', 1), ''),
         nullif(split_part(btrim(coalesce(s.full_name, '')), ' ', 1), ''),
         CASE WHEN sup OR d.created_by = auth.uid() THEN d.body END
  FROM admin_drafts d
  LEFT JOIN profiles w ON w.id = d.created_by
  LEFT JOIN profiles s ON s.id = d.approved_by
  WHERE d.kind = 'broadcast' AND d.status IN ('waiting', 'sent')
  ORDER BY coalesce(d.sent_at, d.created_at) DESC
  LIMIT 100;
END $$;

-- ============================================================================
-- 4. The waiting list gains the audience, so broadcasts (no single woman) can show "To Everyone". Same rows as before.
--    Return shape changes, so it is dropped and recreated, then the same grants are applied again.
-- ============================================================================
DROP FUNCTION IF EXISTS public.admin_draft_list_waiting();
CREATE FUNCTION public.admin_draft_list_waiting()
RETURNS TABLE(id uuid, kind text, body text, created_at timestamptz, feedback_id uuid, feedback_text text,
              first_name text, last_initial text, user_id uuid, written_by text,
              audience_label text, recipient_count integer, audience jsonb)
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
         nullif(split_part(btrim(coalesce(a.full_name, '')), ' ', 1), ''),
         public._broadcast_audience_label(d.audience),
         d.recipient_count,
         d.audience
  FROM admin_drafts d
  LEFT JOIN profiles p ON p.id = d.target_user_id
  LEFT JOIN profiles a ON a.id = d.created_by
  WHERE d.status = 'waiting'
  ORDER BY d.created_at ASC
  LIMIT 100;
END $$;

-- ============================================================================
-- 5. Who can call what. Helpers: nobody from the API. Screen functions: signed-in users only (roles are checked inside).
-- ============================================================================
REVOKE ALL ON FUNCTION public._broadcast_audience_clean(jsonb),
                       public._broadcast_audience_users(jsonb),
                       public._broadcast_audience_count(jsonb),
                       public._broadcast_audience_label(jsonb),
                       public._broadcast_deliver(uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_broadcast_count(jsonb),
                       public.admin_broadcast_draft_create(jsonb, text),
                       public.admin_broadcast_approve_send(uuid),
                       public.admin_broadcast_send_direct(uuid, jsonb, text),
                       public.admin_broadcast_send_test(text),
                       public.admin_broadcast_history(),
                       public.admin_draft_list_waiting()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_count(jsonb),
                          public.admin_broadcast_draft_create(jsonb, text),
                          public.admin_broadcast_approve_send(uuid),
                          public.admin_broadcast_send_direct(uuid, jsonb, text),
                          public.admin_broadcast_send_test(text),
                          public.admin_broadcast_history(),
                          public.admin_draft_list_waiting()
  TO authenticated;
