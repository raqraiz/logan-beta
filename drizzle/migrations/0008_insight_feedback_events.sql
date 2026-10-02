CREATE TABLE public.insight_feedback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message_id uuid NOT NULL,
  insight_type text,
  action text NOT NULL CHECK (action IN ('shown','confirmed','not_confirmed','corrected','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX insight_feedback_events_shown_once ON public.insight_feedback_events (message_id, action) WHERE action = 'shown';
CREATE INDEX insight_feedback_events_user_time ON public.insight_feedback_events (user_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.insight_feedback_events TO authenticated;
GRANT ALL ON public.insight_feedback_events TO service_role;
ALTER TABLE public.insight_feedback_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own read" ON public.insight_feedback_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own insert" ON public.insight_feedback_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own delete" ON public.insight_feedback_events FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.partner_headsup_events ADD COLUMN sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.admin_measurement_weekly(_weeks int DEFAULT 8)
RETURNS TABLE(week date, insights_shown bigint, insights_confirmed bigint, insights_not_confirmed bigint, insights_corrected bigint, headsups_sent bigint, active_user_days bigint, active_users bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  WITH w AS (SELECT generate_series(date_trunc('week', now()) - make_interval(weeks => _weeks - 1), date_trunc('week', now()), interval '1 week')::date AS wk),
  ins AS (SELECT date_trunc('week', created_at)::date wk, action, count(*) c FROM insight_feedback_events GROUP BY 1,2),
  rx AS (SELECT date_trunc('week', created_at)::date wk, metadata->>'feedback_type' ft, count(*) c FROM chat_messages WHERE message_type='reaction' GROUP BY 1,2),
  hs AS (SELECT date_trunc('week', sent_at)::date wk, count(*) c FROM partner_headsup_events WHERE sent_at IS NOT NULL GROUP BY 1),
  ud AS (SELECT DISTINCT user_id, (created_at AT TIME ZONE 'UTC')::date d FROM chat_messages WHERE role='user' AND message_type IN ('text','checkin')),
  au AS (SELECT date_trunc('week', d)::date wk, count(*) days, count(DISTINCT user_id) users FROM ud GROUP BY 1)
  SELECT w.wk,
    coalesce((SELECT c FROM ins WHERE ins.wk=w.wk AND action='shown'),0),
    coalesce((SELECT c FROM ins WHERE ins.wk=w.wk AND action='confirmed'),0) + coalesce((SELECT c FROM rx WHERE rx.wk=w.wk AND ft='positive'),0),
    coalesce((SELECT c FROM ins WHERE ins.wk=w.wk AND action='not_confirmed'),0) + coalesce((SELECT c FROM rx WHERE rx.wk=w.wk AND ft='negative'),0),
    coalesce((SELECT c FROM ins WHERE ins.wk=w.wk AND action='corrected'),0),
    coalesce((SELECT c FROM hs WHERE hs.wk=w.wk),0),
    coalesce((SELECT days FROM au WHERE au.wk=w.wk),0),
    coalesce((SELECT users FROM au WHERE au.wk=w.wk),0)
  FROM w ORDER BY w.wk DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_measurement_weekly(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_measurement_weekly(int) TO authenticated;