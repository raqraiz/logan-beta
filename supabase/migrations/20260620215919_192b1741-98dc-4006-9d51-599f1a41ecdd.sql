CREATE OR REPLACE FUNCTION public.clear_period_pending_on_period_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.last_period_start IS DISTINCT FROM OLD.last_period_start THEN
    NEW.period_pending_since := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_period_pending_on_period_update ON public.participants;
CREATE TRIGGER clear_period_pending_on_period_update
BEFORE UPDATE ON public.participants
FOR EACH ROW
EXECUTE FUNCTION public.clear_period_pending_on_period_update();