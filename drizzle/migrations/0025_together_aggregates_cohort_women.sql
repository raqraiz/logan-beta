DROP FUNCTION IF EXISTS public.get_together_aggregates();
CREATE FUNCTION public.get_together_aggregates()
 RETURNS TABLE(filter text, cohort_key text, symptom text, women_band text, women_count integer, day_shares jsonb, computed_on date, cohort_women integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _stage text; _day int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT together_stage(p.life_stage, p.due_date, p.pregnancy_lmp, p.postpartum_start_date),
         CASE WHEN p.last_period_start IS NOT NULL THEN (current_date - p.last_period_start) + 1 END
    INTO _stage, _day
  FROM participants p WHERE p.user_id = auth.uid() ORDER BY p.created_at DESC LIMIT 1;
  RETURN QUERY
  SELECT a.cohort_kind, a.cohort_key, a.symptom, a.women_band, a.women_count, a.day_shares, a.computed_on,
         CASE WHEN a.cohort_women >= 10 THEN a.cohort_women END
  FROM together_daily_aggregates a
  WHERE a.cohort_kind = 'everyone'
     OR (a.cohort_kind = 'stage' AND a.cohort_key = _stage)
     OR (a.cohort_kind = 'cycle_day' AND _stage = 'cycle' AND a.cohort_key = _day::text);
END $function$;
REVOKE ALL ON FUNCTION public.get_together_aggregates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_together_aggregates() TO authenticated;