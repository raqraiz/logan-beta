
UPDATE public.community_symptoms SET status = 'approved' WHERE status = 'pending';
UPDATE public.community_symptoms SET status = 'deprecated' WHERE status = 'rejected';

ALTER TABLE public.community_symptoms DROP CONSTRAINT IF EXISTS community_symptoms_status_check;
ALTER TABLE public.community_symptoms
  ADD CONSTRAINT community_symptoms_status_check
  CHECK (status = ANY (ARRAY['approved'::text, 'merged'::text, 'deprecated'::text]));

ALTER TABLE public.community_symptoms ALTER COLUMN status SET DEFAULT 'approved';

CREATE OR REPLACE FUNCTION public.guard_community_symptom_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
  recent_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / edge functions
  END IF;

  is_admin := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin');

  IF NOT is_admin THEN
    NEW.status := 'approved';         -- no review queue: passes checks => live
    NEW.canonical_id := NULL;
    NEW.submitted_by := auth.uid();
    NEW.added_by := auth.uid();

    SELECT count(*) INTO recent_count
    FROM public.community_symptoms
    WHERE submitted_by = auth.uid()
      AND created_at > now() - interval '24 hours';

    IF recent_count >= 3 THEN
      RAISE EXCEPTION 'rate_limited: max 3 symptom submissions per 24 hours';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_community_symptom_insert() FROM PUBLIC, anon, authenticated;
