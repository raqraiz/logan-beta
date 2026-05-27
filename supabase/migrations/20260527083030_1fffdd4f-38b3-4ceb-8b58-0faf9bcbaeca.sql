
ALTER TABLE public.custom_trackers
  ADD COLUMN IF NOT EXISTS tracker_type text NOT NULL DEFAULT 'scale_0_5',
  ADD COLUMN IF NOT EXISTS options jsonb,
  ADD COLUMN IF NOT EXISTS is_fam boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_builtin boolean NOT NULL DEFAULT false;

ALTER TABLE public.custom_trackers
  DROP CONSTRAINT IF EXISTS custom_trackers_tracker_type_check;
ALTER TABLE public.custom_trackers
  ADD CONSTRAINT custom_trackers_tracker_type_check
  CHECK (tracker_type IN ('scale_0_5','single_choice'));

ALTER TABLE public.tracker_logs
  ADD COLUMN IF NOT EXISTS option_value text;
ALTER TABLE public.tracker_logs ALTER COLUMN intensity DROP NOT NULL;
ALTER TABLE public.tracker_logs DROP CONSTRAINT IF EXISTS tracker_logs_intensity_check;
ALTER TABLE public.tracker_logs
  ADD CONSTRAINT tracker_logs_intensity_check
  CHECK (intensity IS NULL OR (intensity >= 0 AND intensity <= 5));

DO $$
DECLARE
  rec RECORD;
  new_tracker_id uuid;
BEGIN
  FOR rec IN
    SELECT DISTINCT sl.user_id, s->>'name' AS symptom_name
    FROM public.symptom_logs sl, jsonb_array_elements(sl.symptoms) s
    WHERE s ? 'name' AND length(coalesce(s->>'name','')) > 0
  LOOP
    SELECT id INTO new_tracker_id
    FROM public.custom_trackers
    WHERE user_id = rec.user_id AND lower(name) = lower(rec.symptom_name)
    LIMIT 1;

    IF new_tracker_id IS NULL THEN
      INSERT INTO public.custom_trackers
        (user_id, name, emoji, description, source, is_builtin, tracker_type, is_active)
      VALUES
        (rec.user_id, rec.symptom_name, '🩺', NULL, 'symptom', true, 'scale_0_5', true)
      RETURNING id INTO new_tracker_id;
    END IF;

    INSERT INTO public.tracker_logs
      (user_id, tracker_id, intensity, cycle_phase, cycle_day, logged_at, notes)
    SELECT
      sl.user_id,
      new_tracker_id,
      LEAST(5, GREATEST(0, (s->>'severity')::int)),
      sl.cycle_phase,
      sl.cycle_day,
      sl.logged_at,
      sl.notes
    FROM public.symptom_logs sl, jsonb_array_elements(sl.symptoms) s
    WHERE sl.user_id = rec.user_id
      AND lower(s->>'name') = lower(rec.symptom_name)
      AND s ? 'severity'
      AND NOT EXISTS (
        SELECT 1 FROM public.tracker_logs tl
        WHERE tl.tracker_id = new_tracker_id
          AND tl.user_id = sl.user_id
          AND tl.logged_at = sl.logged_at
      );
  END LOOP;
END$$;
