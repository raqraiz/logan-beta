-- Pre-launch security hardening.
-- Written to be safe to run whatever the live state is (IF EXISTS, loops over
-- pg_policies / pg_proc, revoke-then-grant). Existing user_roles rows are not touched.

-- ============================================================================
-- 1. Remove the hard-coded-email admin auto-grant.
-- ============================================================================
DO $mig$
DECLARE
  r record;
  dep text;
BEGIN
  -- Safety: abort if any other function calls the two auto-grant functions
  -- (e.g. a live sign-up helper that is not in the repo).
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO dep
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname NOT IN ('auto_assign_admin_role', 'handle_new_user_admin')
    AND (p.prosrc ILIKE '%auto_assign_admin_role%' OR p.prosrc ILIKE '%handle_new_user_admin%');
  IF dep IS NOT NULL THEN
    RAISE EXCEPTION 'Other functions reference the admin auto-grant functions: %. Aborting.', dep;
  END IF;

  -- Drop any trigger on auth.users that calls them. If the auth schema is
  -- locked, this raises and the whole migration aborts (no workaround).
  FOR r IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'auth.users'::regclass
      AND NOT t.tgisinternal
      AND n.nspname = 'public'
      AND p.proname IN ('auto_assign_admin_role', 'handle_new_user_admin')
  LOOP
    RAISE NOTICE 'Dropping trigger % on auth.users', r.tgname;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', r.tgname);
  END LOOP;
END
$mig$;

DROP FUNCTION IF EXISTS public.auto_assign_admin_role();
DROP FUNCTION IF EXISTS public.handle_new_user_admin();

-- ============================================================================
-- 2. user_roles: only super_admin can insert / update / delete.
--    Admins keep read access. "Users can view their own roles" is kept.
-- ============================================================================
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DO $mig$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    RAISE NOTICE 'Dropping user_roles policy %', r.policyname;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', r.policyname);
  END LOOP;
END
$mig$;

DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
CREATE POLICY "Admins can read all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

REVOKE ALL ON public.user_roles FROM anon;

-- ============================================================================
-- 5. Remove admin access from user-health tables (runs before the function
--    grants so step 3 sees the final set of policies).
--    - Purely admin policies (has_role and no other auth.uid()) are dropped.
--    - Mixed policies (own-row OR admin) are recreated own-row only, with the
--      same command / roles / own-row condition. Before and after are logged.
--    - If a mixed policy cannot be rewritten safely, the migration aborts.
-- ============================================================================
DO $mig$
DECLARE
  r record;
  tbls text[] := ARRAY[
    'lab_panels','lab_markers','home_widget_preferences','custom_trackers',
    'tracker_logs','user_dietary_prefs','resource_feedback','history_imports',
    'notification_preferences','insights','feedback','cycle_updates','cycle_history'];
  -- has_role(auth.uid(), 'x'::app_role), also with (SELECT auth.uid()) wrappers
  hr  text := $re$has_role\s*\(\s*(?:\(\s*SELECT\s+auth\.uid\(\)(?:\s+AS\s+\w+)?\s*\)|auth\.uid\(\))\s*,\s*'[a-z_]+'(?:::[a-z_.]+)?\s*\)$re$;
  or1 text;
  or2 text;
  q_stripped text;
  c_stripped text;
  new_q text;
  new_c text;
  roles_sql text;
  sql text;
BEGIN
  or1 := $re$\s+OR\s+$re$ || hr;
  or2 := hr || $re$\s+OR\s+$re$;

  FOR r IN
    SELECT * FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (tbls)
      AND (coalesce(qual, '') ILIKE '%has_role%' OR coalesce(with_check, '') ILIKE '%has_role%')
  LOOP
    q_stripped := regexp_replace(coalesce(r.qual, ''), hr, '', 'gi');
    c_stripped := regexp_replace(coalesce(r.with_check, ''), hr, '', 'gi');

    IF q_stripped ILIKE '%auth.uid()%' OR c_stripped ILIKE '%auth.uid()%' THEN
      -- Mixed policy: keep the own-row part, remove the admin part.
      new_q := r.qual;
      new_c := r.with_check;
      IF new_q IS NOT NULL THEN
        new_q := regexp_replace(regexp_replace(new_q, or1, '', 'gi'), or2, '', 'gi');
      END IF;
      IF new_c IS NOT NULL THEN
        new_c := regexp_replace(regexp_replace(new_c, or1, '', 'gi'), or2, '', 'gi');
      END IF;
      IF coalesce(new_q, '') ILIKE '%has_role%' OR coalesce(new_c, '') ILIKE '%has_role%' THEN
        RAISE EXCEPTION 'Cannot safely rewrite mixed policy %.% (USING: %, CHECK: %). Aborting.',
          r.tablename, r.policyname, r.qual, r.with_check;
      END IF;

      SELECT string_agg(CASE WHEN x = 'public' THEN 'public' ELSE quote_ident(x) END, ', ')
        INTO roles_sql FROM unnest(r.roles) AS x;

      RAISE NOTICE 'MIXED POLICY %.% (%): BEFORE using=[%] check=[%] | AFTER using=[%] check=[%]',
        r.tablename, r.policyname, r.cmd, r.qual, r.with_check, new_q, new_c;

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
      sql := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
                    r.policyname, r.tablename, r.permissive, r.cmd, roles_sql);
      IF new_q IS NOT NULL THEN sql := sql || ' USING (' || new_q || ')'; END IF;
      IF new_c IS NOT NULL THEN sql := sql || ' WITH CHECK (' || new_c || ')'; END IF;
      EXECUTE sql;
    ELSE
      RAISE NOTICE 'Dropping admin-only policy % on %', r.policyname, r.tablename;
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END IF;
  END LOOP;
END
$mig$;

-- ============================================================================
-- 3. Function EXECUTE grants.
--    Revoke from PUBLIC / anon / authenticated on every SECURITY DEFINER
--    function in public (plus the three Together helpers), then re-grant:
--      - service_role: always
--      - authenticated: the app's signed-in rpc() calls, plus every function
--        found in a policy, column default, check constraint, index or view.
--    refresh_postpartum_state is never granted to authenticated.
-- ============================================================================
DO $mig$
DECLARE
  r record;
  base_authed text[] := ARRAY[
    -- used inside RLS policies
    'has_role','get_auth_email',
    -- admin screens (each checks the role inside)
    'admin_measurement_weekly','admin_review_tip','admin_set_user_internal',
    'admin_symptom_log_activity','admin_tip_queue','admin_tip_totals','count_onboarded_users',
    -- signed-in app calls
    'count_hidden_tip_authors','delete_my_tips','get_referral_count','get_tip_summary',
    'get_together_aggregates','get_together_pairs','get_together_tips','hide_tip_author',
    'report_tip','resolve_referral_code','toggle_tip_vote'];
  never_authed text[] := ARRAY['refresh_postpartum_state'];
  authed text[];
  found text[];
  added text[];
BEGIN
  -- Functions referenced by policies, defaults, check constraints, indexes, views.
  SELECT coalesce(array_agg(DISTINCT p.proname), '{}') INTO found
  FROM pg_depend d
  JOIN pg_proc p ON p.oid = d.refobjid
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE d.refclassid = 'pg_proc'::regclass
    AND d.classid IN ('pg_policy'::regclass, 'pg_attrdef'::regclass,
                      'pg_constraint'::regclass, 'pg_class'::regclass)
    AND n.nspname = 'public';

  -- Text fallback: any public function name called in a policy expression.
  SELECT coalesce(array_agg(DISTINCT p.proname), '{}') || found INTO found
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND EXISTS (
      SELECT 1 FROM pg_policies pp
      WHERE coalesce(pp.qual, '') || ' ' || coalesce(pp.with_check, '')
            ~* ('\m' || p.proname || '\s*\(')
    );

  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO authed
  FROM unnest(base_authed || found) AS x
  WHERE x <> ALL (never_authed);

  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO added
  FROM unnest(authed) AS x WHERE x <> ALL (base_authed);
  RAISE NOTICE 'Functions auto-added to the authenticated list (found in policies/defaults/constraints): %',
    CASE WHEN array_length(added, 1) IS NULL THEN '(none)' ELSE array_to_string(added, ', ') END;

  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (p.prosecdef OR p.proname IN ('together_norm', 'together_stage', 'together_canonical'))
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
      IF r.proname = ANY (authed) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'Could not change grants on % (not owned by the migration role)', r.sig;
    END;
  END LOOP;
END
$mig$;

-- ============================================================================
-- 4a. insights: users can only read the safe columns.
-- ============================================================================
REVOKE ALL ON public.insights FROM anon;
REVOKE SELECT ON public.insights FROM authenticated;
REVOKE SELECT (admin_notes, ai_prompt_used, approved_by, approved_at) ON public.insights FROM authenticated;
GRANT SELECT (id, created_at, updated_at, participant_id, content, insight_type,
              scheduled_for, status, sent_at)
  ON public.insights TO authenticated;

-- ============================================================================
-- 4b. user_integrations: no token access, no client writes.
--     SELECT on safe columns and DELETE (disconnect) stay.
-- ============================================================================
REVOKE ALL ON public.user_integrations FROM anon;
REVOKE SELECT, INSERT, UPDATE ON public.user_integrations FROM authenticated;
REVOKE ALL (access_token, refresh_token) ON public.user_integrations FROM authenticated;
GRANT SELECT (id, user_id, provider, provider_user_id, status, scopes,
              connected_at, last_synced_at, expires_at, created_at, updated_at)
  ON public.user_integrations TO authenticated;

-- ============================================================================
-- 6. meal-photos bucket private. The app only uses signed URLs (createSignedUrl);
--    no getPublicUrl anywhere. Owner-only storage policies are unchanged.
-- ============================================================================
UPDATE storage.buckets SET public = false WHERE id = 'meal-photos';
