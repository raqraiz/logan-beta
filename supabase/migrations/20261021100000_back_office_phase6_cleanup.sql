-- Back office phase 6: admins have no direct table access.
-- All back office data goes through role-checked SECURITY DEFINER admin_* functions.
-- Women's own-row policies are untouched. Super admin role management on user_roles is kept.

-- 1. Policies that mixed own-row and admin access: replace with own-row only.
DROP POLICY IF EXISTS "Users read own symptoms, admins read all" ON public.community_symptoms;
CREATE POLICY "Users read own symptoms" ON public.community_symptoms
  FOR SELECT TO authenticated
  USING (added_by = auth.uid() OR submitted_by = auth.uid());

DROP POLICY IF EXISTS "Contributors or admins can update" ON public.community_symptoms;
CREATE POLICY "Contributors can update" ON public.community_symptoms
  FOR UPDATE TO authenticated
  USING (auth.uid() = added_by) WITH CHECK (auth.uid() = added_by);

DROP POLICY IF EXISTS "Contributors or admins can delete" ON public.community_symptoms;
CREATE POLICY "Contributors can delete" ON public.community_symptoms
  FOR DELETE TO authenticated
  USING (auth.uid() = added_by);

DROP POLICY IF EXISTS "Reporters and admins can read reports" ON public.symptom_reports;
CREATE POLICY "Reporters can read their own reports" ON public.symptom_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- 2. Admin-only policies: drop.
DROP POLICY IF EXISTS "Admins can clear reports" ON public.symptom_reports;
DROP POLICY IF EXISTS "Admins can view rejected symptom candidates" ON public.symptom_candidate_rejections;
DROP POLICY IF EXISTS "Admins manage aliases" ON public.symptom_aliases;

DROP POLICY IF EXISTS "Admins can view all messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Admins can insert messages for any user" ON public.chat_messages;
DROP POLICY IF EXISTS "Admins can delete messages" ON public.chat_messages;

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;

DROP POLICY IF EXISTS "Admins can view all participants" ON public.participants;
DROP POLICY IF EXISTS "Admins can insert participants" ON public.participants;
DROP POLICY IF EXISTS "Admins can update participants" ON public.participants;
DROP POLICY IF EXISTS "Admins can delete participants" ON public.participants;

DROP POLICY IF EXISTS "Admins can view all activity events" ON public.user_activity_events;
DROP POLICY IF EXISTS "Admins can view all resources" ON public.user_resources;
DROP POLICY IF EXISTS "Admins can view all feature events" ON public.feature_events;
DROP POLICY IF EXISTS "Admins can read attribution events" ON public.attribution_events;

DROP POLICY IF EXISTS "admins read feature requests" ON public.feature_requests;
DROP POLICY IF EXISTS "admins read" ON public.message_failures;
DROP POLICY IF EXISTS "Admins can read email opens" ON public.email_opens;
DROP POLICY IF EXISTS "Admins can read email send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Admins can view policy notifications" ON public.policy_notifications;

DROP POLICY IF EXISTS "Admins can view growth_tracker" ON public.growth_tracker;
DROP POLICY IF EXISTS "Admins can insert growth_tracker" ON public.growth_tracker;
DROP POLICY IF EXISTS "Admins can update growth_tracker" ON public.growth_tracker;
DROP POLICY IF EXISTS "Admins can delete growth_tracker" ON public.growth_tracker;

DROP POLICY IF EXISTS "Admins can manage all short links" ON public.short_links;
DROP POLICY IF EXISTS "Admins can update flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;

-- 3. Retired old dashboard objects. Nothing in the database or app uses them.
DROP TABLE IF EXISTS public.admin_broadcasts;
DROP VIEW IF EXISTS public.onboarded_profiles;
