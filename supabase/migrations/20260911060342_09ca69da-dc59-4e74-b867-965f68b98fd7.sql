ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS is_breastfeeding boolean,
  ADD COLUMN IF NOT EXISTS postpartum_regular_periods_confirmed boolean NOT NULL DEFAULT false;

-- Backfill breastfeeding from the existing onboarding feeding answer.
UPDATE public.participants
SET is_breastfeeding = CASE
  WHEN feeding_status IN ('breastfeeding','combination') THEN true
  WHEN feeding_status IN ('formula','weaned') THEN false
  ELSE is_breastfeeding
END
WHERE is_breastfeeding IS NULL AND feeding_status IS NOT NULL;

-- Derived regularity: 3 consecutive ACTUAL logged cycles, each 21-35 days,
-- with <= 7 days variance between consecutive cycles.
CREATE OR REPLACE FUNCTION public.evaluate_postpartum_regularity(_participant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lens int[];
BEGIN
  SELECT array_agg(cycle_length_days ORDER BY cycle_start_date DESC)
  INTO lens
  FROM (
    SELECT cycle_length_days, cycle_start_date
    FROM public.cycle_history
    WHERE participant_id = _participant_id
    ORDER BY cycle_start_date DESC
    LIMIT 3
  ) recent;

  IF lens IS NULL OR array_length(lens, 1) < 3 THEN
    RETURN false;
  END IF;

  IF lens[1] NOT BETWEEN 21 AND 35
     OR lens[2] NOT BETWEEN 21 AND 35
     OR lens[3] NOT BETWEEN 21 AND 35 THEN
    RETURN false;
  END IF;

  IF abs(lens[1] - lens[2]) > 7 OR abs(lens[2] - lens[3]) > 7 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- Applies the derived flag and the postpartum exit rule for one participant.
CREATE OR REPLACE FUNCTION public.refresh_postpartum_state(_participant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.participants%ROWTYPE;
  is_regular boolean;
BEGIN
  SELECT * INTO p FROM public.participants WHERE id = _participant_id;
  IF NOT FOUND THEN RETURN; END IF;

  is_regular := public.evaluate_postpartum_regularity(_participant_id);

  UPDATE public.participants
  SET postpartum_regular_periods_confirmed = is_regular
  WHERE id = _participant_id
    AND postpartum_regular_periods_confirmed IS DISTINCT FROM is_regular;

  -- Exit postpartum only when NOT breastfeeding AND regularity confirmed.
  -- Birth date is the entry gate: no birth date => nothing to exit from.
  IF p.life_stage = 'postpartum'
     AND p.postpartum_start_date IS NOT NULL
     AND COALESCE(p.is_breastfeeding, false) = false
     AND is_regular THEN
    UPDATE public.participants
    SET life_stage = 'cycling',
        postpartum_active = false
    WHERE id = _participant_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_cycle_history_refresh_postpartum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_postpartum_state(COALESCE(NEW.participant_id, OLD.participant_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS cycle_history_refresh_postpartum ON public.cycle_history;
CREATE TRIGGER cycle_history_refresh_postpartum
AFTER INSERT OR UPDATE OR DELETE ON public.cycle_history
FOR EACH ROW EXECUTE FUNCTION public.trg_cycle_history_refresh_postpartum();

-- Re-evaluate when the breastfeeding toggle changes.
CREATE OR REPLACE FUNCTION public.trg_participants_breastfeeding_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_breastfeeding IS DISTINCT FROM OLD.is_breastfeeding THEN
    PERFORM public.refresh_postpartum_state(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS participants_breastfeeding_change ON public.participants;
CREATE TRIGGER participants_breastfeeding_change
AFTER UPDATE OF is_breastfeeding ON public.participants
FOR EACH ROW EXECUTE FUNCTION public.trg_participants_breastfeeding_change();

-- Initial backfill of the derived flag.
UPDATE public.participants p
SET postpartum_regular_periods_confirmed = public.evaluate_postpartum_regularity(p.id)
WHERE EXISTS (SELECT 1 FROM public.cycle_history ch WHERE ch.participant_id = p.id);