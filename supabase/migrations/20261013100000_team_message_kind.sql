-- Team messages remember what they are (feedback_reply / thank_you), so her chat can label feedback replies.
-- Messages sent before this have no kind and keep the generic "Message from the Logan team" label.
-- Only the delivery helper and its two callers change. Safe to re-run.

CREATE OR REPLACE FUNCTION public._admin_deliver_team_message(_user uuid, _body text, _draft uuid, _kind text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = _user) THEN RAISE EXCEPTION 'unknown recipient'; END IF;
  INSERT INTO chat_messages(user_id, role, content, message_type, metadata)
  VALUES (_user, 'system', _body, 'text',
          jsonb_build_object('team_message', true, 'from', 'logan_team', 'draft_id', _draft, 'kind', _kind));
END $$;
REVOKE ALL ON FUNCTION public._admin_deliver_team_message(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;

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
  PERFORM public._admin_deliver_team_message(d.target_user_id, d.body, d.id, d.kind);
  UPDATE admin_drafts SET status = 'sent', approved_by = auth.uid(), approved_at = now(), sent_at = now(), updated_at = now()
  WHERE id = d.id;
  IF d.feedback_id IS NOT NULL THEN
    UPDATE user_feedback SET handled_at = coalesce(handled_at, now()), handled_by = coalesce(handled_by, auth.uid())
    WHERE id = d.feedback_id;
  END IF;
  INSERT INTO admin_audit_log(admin_id, action, target_user_id) VALUES (auth.uid(), 'draft_approved', d.target_user_id);
  INSERT INTO admin_audit_log(admin_id, action, target_user_id) VALUES (auth.uid(), 'message_sent', d.target_user_id);
END $$;

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
  PERFORM public._admin_deliver_team_message(_user, btrim(_body), new_id, _kind);
  IF _feedback IS NOT NULL THEN
    UPDATE user_feedback SET handled_at = coalesce(handled_at, now()), handled_by = coalesce(handled_by, auth.uid())
    WHERE id = _feedback;
  END IF;
  INSERT INTO admin_audit_log(admin_id, action, target_user_id) VALUES (auth.uid(), 'message_sent', _user);
  RETURN new_id;
END $$;

-- The old three-argument helper is no longer called by anything.
DROP FUNCTION IF EXISTS public._admin_deliver_team_message(uuid, text, uuid);
