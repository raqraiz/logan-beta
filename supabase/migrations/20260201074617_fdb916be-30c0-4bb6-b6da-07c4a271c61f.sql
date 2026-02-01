-- =============================================
-- SECURITY FIX: Remove anonymous INSERT policies
-- Webhooks use service role key which bypasses RLS
-- So these public policies only create attack surface
-- =============================================

-- 1. Remove anonymous INSERT policies that allow anyone to submit data
DROP POLICY IF EXISTS "Anyone can submit cycle updates" ON public.cycle_updates;
DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.feedback;
DROP POLICY IF EXISTS "Anyone can register as participant" ON public.participants;

-- 2. Add admin management policies for full CRUD
-- cycle_updates: Replace SELECT-only with full management
DROP POLICY IF EXISTS "Admins can view cycle updates" ON public.cycle_updates;
CREATE POLICY "Admins can manage cycle updates"
ON public.cycle_updates FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- feedback: Replace SELECT-only with full management  
DROP POLICY IF EXISTS "Admins can view feedback" ON public.feedback;
CREATE POLICY "Admins can manage feedback"
ON public.feedback FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- participants: Add INSERT for admins (UPDATE and SELECT already exist)
CREATE POLICY "Admins can insert participants"
ON public.participants FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- insights: Already has "Admins can manage insights" FOR ALL - no changes needed