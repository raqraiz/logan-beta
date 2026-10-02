CREATE OR REPLACE FUNCTION public.admin_set_user_internal(_user_id uuid, _internal boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.profiles SET is_internal = _internal WHERE id = _user_id;
END $$;

DROP FUNCTION IF EXISTS public.admin_measurement_weekly(integer);
CREATE FUNCTION public.admin_measurement_weekly(_weeks integer DEFAULT 8)
 RETURNS TABLE(week date, insights_shown bigint, insights_confirmed bigint, insights_not_confirmed bigint, insights_corrected bigint, reactions_positive bigint, reactions_negative bigint, headsups_sent bigint, active_user_days bigint, active_users bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  WITH internal AS (SELECT id FROM profiles WHERE is_internal),
  w AS (SELECT generate_series(date_trunc('week', now()) - make_interval(weeks => _weeks - 1), date_trunc('week', now()), interval '1 week')::date AS wk),
  ins AS (SELECT date_trunc('week', created_at)::date wk, action, count(*) c FROM insight_feedback_events WHERE user_id NOT IN (SELECT id FROM internal) GROUP BY 1,2),
  rx AS (SELECT date_trunc('week', created_at)::date wk, metadata->>'feedback_type' ft, count(*) c FROM chat_messages WHERE message_type='reaction' AND user_id NOT IN (SELECT id FROM internal) GROUP BY 1,2),
  hs AS (SELECT date_trunc('week', sent_at)::date wk, count(*) c FROM partner_headsup_events WHERE sent_at IS NOT NULL AND user_id NOT IN (SELECT id FROM internal) GROUP BY 1),
  ud AS (SELECT DISTINCT user_id, (created_at AT TIME ZONE 'UTC')::date d FROM chat_messages WHERE role='user' AND message_type IN ('text','checkin') AND user_id NOT IN (SELECT id FROM internal)),
  au AS (SELECT date_trunc('week', d)::date wk, count(*) days, count(DISTINCT user_id) users FROM ud GROUP BY 1)
  SELECT w.wk,
    coalesce((SELECT c FROM ins WHERE ins.wk=w.wk AND action='shown'),0),
    coalesce((SELECT c FROM ins WHERE ins.wk=w.wk AND action='confirmed'),0),
    coalesce((SELECT c FROM ins WHERE ins.wk=w.wk AND action='not_confirmed'),0),
    coalesce((SELECT c FROM ins WHERE ins.wk=w.wk AND action='corrected'),0),
    coalesce((SELECT c FROM rx WHERE rx.wk=w.wk AND ft='positive'),0),
    coalesce((SELECT c FROM rx WHERE rx.wk=w.wk AND ft='negative'),0),
    coalesce((SELECT c FROM hs WHERE hs.wk=w.wk),0),
    coalesce((SELECT days FROM au WHERE au.wk=w.wk),0),
    coalesce((SELECT users FROM au WHERE au.wk=w.wk),0)
  FROM w ORDER BY w.wk DESC;
END $function$;