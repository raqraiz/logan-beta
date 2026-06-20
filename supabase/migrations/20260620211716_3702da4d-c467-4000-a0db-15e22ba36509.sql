
-- 1. Add user_id link on participants
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill from auth.users by email (one-time)
UPDATE public.participants p
SET user_id = u.id
FROM auth.users u
WHERE p.user_id IS NULL
  AND p.email IS NOT NULL
  AND lower(u.email) = lower(p.email);

CREATE INDEX IF NOT EXISTS participants_user_id_idx ON public.participants(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS participants_user_id_unique ON public.participants(user_id) WHERE user_id IS NOT NULL;

-- Default user_id to auth.uid() on insert when not provided
CREATE OR REPLACE FUNCTION public.set_participant_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS participants_set_user_id ON public.participants;
CREATE TRIGGER participants_set_user_id
BEFORE INSERT ON public.participants
FOR EACH ROW EXECUTE FUNCTION public.set_participant_user_id();

-- 2. Rewrite participants user-facing policies to use auth.uid()
DROP POLICY IF EXISTS "Users can view own participant record" ON public.participants;
CREATE POLICY "Users can view own participant record"
ON public.participants FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can update own participant record"
ON public.participants FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert own participant record"
ON public.participants FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 3. Rewrite dependent policies on cycle_history, cycle_updates, feedback, insights
DROP POLICY IF EXISTS "Users can view own cycle history" ON public.cycle_history;
DROP POLICY IF EXISTS "Users can insert own cycle history" ON public.cycle_history;
DROP POLICY IF EXISTS "Users can update own cycle history" ON public.cycle_history;
DROP POLICY IF EXISTS "Users can delete own cycle history" ON public.cycle_history;

CREATE POLICY "Users can view own cycle history"
ON public.cycle_history FOR SELECT TO authenticated
USING (participant_id IN (SELECT id FROM public.participants WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own cycle history"
ON public.cycle_history FOR INSERT TO authenticated
WITH CHECK (participant_id IN (SELECT id FROM public.participants WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own cycle history"
ON public.cycle_history FOR UPDATE TO authenticated
USING (participant_id IN (SELECT id FROM public.participants WHERE user_id = auth.uid()))
WITH CHECK (participant_id IN (SELECT id FROM public.participants WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own cycle history"
ON public.cycle_history FOR DELETE TO authenticated
USING (participant_id IN (SELECT id FROM public.participants WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view their own cycle updates" ON public.cycle_updates;
CREATE POLICY "Users can view their own cycle updates"
ON public.cycle_updates FOR SELECT TO authenticated
USING (participant_id IN (SELECT id FROM public.participants WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view their own feedback" ON public.feedback;
CREATE POLICY "Users can view their own feedback"
ON public.feedback FOR SELECT TO authenticated
USING (participant_id IN (SELECT id FROM public.participants WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view their own insights" ON public.insights;
CREATE POLICY "Users can view their own insights"
ON public.insights FOR SELECT TO authenticated
USING (participant_id IN (SELECT id FROM public.participants WHERE user_id = auth.uid()));

-- 4. Lock down OAuth token columns on user_integrations
-- Token columns should only be accessible to service_role (edge functions).
REVOKE SELECT (access_token, refresh_token) ON public.user_integrations FROM authenticated;
REVOKE SELECT (access_token, refresh_token) ON public.user_integrations FROM anon;
REVOKE INSERT (access_token, refresh_token) ON public.user_integrations FROM authenticated;
REVOKE INSERT (access_token, refresh_token) ON public.user_integrations FROM anon;
REVOKE UPDATE (access_token, refresh_token) ON public.user_integrations FROM authenticated;
REVOKE UPDATE (access_token, refresh_token) ON public.user_integrations FROM anon;
