ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS period_still_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.participants.period_still_active IS
  'True while user has confirmed her current period is still ongoing past the assumed 5-day menstruation window. Cleared when last_period_start changes or current_period_end_date is set.';

CREATE OR REPLACE FUNCTION public.clear_period_pending_on_period_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.last_period_start IS DISTINCT FROM OLD.last_period_start THEN
    NEW.period_pending_since := NULL;
    NEW.period_still_active := false;
  END IF;
  IF NEW.current_period_end_date IS DISTINCT FROM OLD.current_period_end_date
     AND NEW.current_period_end_date IS NOT NULL THEN
    NEW.period_still_active := false;
  END IF;
  RETURN NEW;
END;
$function$;