-- Team messages get their own inbox. They never appear in the Logan chat again.
-- 1. New table team_messages (she can read her own rows; nothing else from the API).
-- 2. mark_team_messages_read(): the only way she changes anything (sets read_at = now() on her own unread rows).
-- 3. _admin_deliver_team_message writes here instead of chat_messages. Its callers (admin_send_team_message,
--    admin_draft_approve_send, admin_referral_thank_you) are untouched. Feedback "handled" and Referrals "thanked"
--    come from user_feedback.handled_at and admin_drafts (status 'sent'), so they do not move.
-- 4. Existing team messages move over in ONE statement (so all-or-nothing). They arrive already read.
-- Safe to re-run.

-- ============================================================================
-- 1. Table. RLS on, one SELECT policy, no insert/update/delete policies at all.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.team_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- goes with her if she deletes her account
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  kind       text CHECK (kind IN ('feedback_reply','thank_you')),         -- null = generic "Message from the Logan team"
  draft_id   uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own team messages" ON public.team_messages;
CREATE POLICY "Users read their own team messages" ON public.team_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.team_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.team_messages TO authenticated;
GRANT ALL ON public.team_messages TO service_role;

CREATE INDEX IF NOT EXISTS team_messages_user_created_idx ON public.team_messages (user_id, created_at DESC);

-- ============================================================================
-- 2. Mark read. Only her own unread rows, only to now().
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_team_messages_read()
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  UPDATE team_messages SET read_at = now() WHERE user_id = auth.uid() AND read_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.mark_team_messages_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_team_messages_read() TO authenticated;

-- ============================================================================
-- 3. Delivery now lands in the inbox. Same signature, same callers, same kinds.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._admin_deliver_team_message(_user uuid, _body text, _draft uuid, _kind text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = _user) THEN RAISE EXCEPTION 'unknown recipient'; END IF;
  INSERT INTO team_messages(user_id, body, kind, draft_id) VALUES (_user, _body, _kind, _draft);
END $$;
REVOKE ALL ON FUNCTION public._admin_deliver_team_message(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. Move the existing rows. One statement = one transaction: a row is only removed from the chat if it was
--    copied. Old messages keep their date and arrive already read, so nobody sees them as new.
-- ============================================================================
DO $$
DECLARE before_n bigint; moved_n bigint; after_n bigint;
BEGIN
  SELECT count(*) INTO before_n FROM chat_messages WHERE metadata ->> 'team_message' = 'true';

  WITH moved AS (
    DELETE FROM chat_messages WHERE metadata ->> 'team_message' = 'true'
    RETURNING id, user_id, content, created_at, metadata
  ), copied AS (
    INSERT INTO team_messages(id, user_id, body, kind, draft_id, created_at, read_at)
    SELECT id, user_id, content,
           CASE WHEN metadata ->> 'kind' IN ('feedback_reply','thank_you') THEN metadata ->> 'kind' END,
           nullif(metadata ->> 'draft_id', '')::uuid,
           created_at, created_at
    FROM moved
    ON CONFLICT (id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO moved_n FROM copied;

  SELECT count(*) INTO after_n FROM chat_messages WHERE metadata ->> 'team_message' = 'true';
  RAISE NOTICE 'team messages in chat before: %, copied to team_messages: %, in chat after: %', before_n, moved_n, after_n;
END $$;
