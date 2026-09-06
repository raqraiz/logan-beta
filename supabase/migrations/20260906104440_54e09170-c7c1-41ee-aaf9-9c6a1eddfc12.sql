ALTER TABLE public.community_symptoms
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS canonical_id uuid REFERENCES public.community_symptoms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aliases text[];

UPDATE public.community_symptoms SET submitted_by = added_by WHERE submitted_by IS NULL;
UPDATE public.community_symptoms SET status = 'approved' WHERE status IS NULL;

ALTER TABLE public.community_symptoms
  DROP CONSTRAINT IF EXISTS community_symptoms_status_check;
ALTER TABLE public.community_symptoms
  ADD CONSTRAINT community_symptoms_status_check
  CHECK (status IN ('approved','pending','rejected','merged'));

CREATE INDEX IF NOT EXISTS community_symptoms_status_idx ON public.community_symptoms (status);
CREATE INDEX IF NOT EXISTS community_symptoms_canonical_idx ON public.community_symptoms (canonical_id);

-- Force client submissions to land as pending, credited to the submitter,
-- and rate-limit to 3 pending submissions per rolling 24h.
CREATE OR REPLACE FUNCTION public.guard_community_symptom_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_count int;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  NEW.status := 'pending';
  NEW.canonical_id := NULL;
  NEW.submitted_by := auth.uid();
  NEW.added_by := auth.uid();

  SELECT count(*) INTO pending_count
  FROM public.community_symptoms
  WHERE submitted_by = auth.uid()
    AND status = 'pending'
    AND created_at > now() - interval '24 hours';

  IF pending_count >= 3 THEN
    RAISE EXCEPTION 'rate_limited: max 3 pending symptom submissions per 24 hours';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_symptoms_guard_insert ON public.community_symptoms;
CREATE TRIGGER community_symptoms_guard_insert
  BEFORE INSERT ON public.community_symptoms
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_symptom_insert();

-- Non-admins must not be able to change moderation fields on their own rows.
CREATE OR REPLACE FUNCTION public.guard_community_symptom_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;
  NEW.status := OLD.status;
  NEW.canonical_id := OLD.canonical_id;
  NEW.aliases := OLD.aliases;
  NEW.submitted_by := OLD.submitted_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_symptoms_guard_update ON public.community_symptoms;
CREATE TRIGGER community_symptoms_guard_update
  BEFORE UPDATE ON public.community_symptoms
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_symptom_update();

-- Visibility: approved to everyone, own pending to its submitter, everything to admins.
DROP POLICY IF EXISTS "Anyone can view community symptoms" ON public.community_symptoms;
DROP POLICY IF EXISTS "Authenticated users can view community symptoms" ON public.community_symptoms;
DROP POLICY IF EXISTS "Approved symptoms are viewable" ON public.community_symptoms;
CREATE POLICY "Approved symptoms are viewable"
ON public.community_symptoms FOR SELECT
TO authenticated
USING (
  status = 'approved'
  OR submitted_by = auth.uid()
  OR added_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);