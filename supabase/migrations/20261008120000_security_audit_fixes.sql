-- Security audit fixes (launch week).
-- 1. community_symptoms: no more open read. Shared list comes from SECURITY DEFINER functions.
-- 2. admin_symptom_log_activity: totals only, never user IDs.
-- 3. get_referral_count / resolve_referral_code: no leaking of other users' data.
-- 4. short_links: anon and signed-in users see only slug and target_url, through a view.
-- 5. Trigger helper functions no longer executable by anon.
-- 6. TRUNCATE and TRIGGER removed from anon and authenticated on every public table.
-- Safe to re-run (IF EXISTS / OR REPLACE / DROP-then-CREATE).

-- ============================================================================
-- 1. community_symptoms
-- ============================================================================

-- Which rows may this woman see? Her own, plus:
--   - built-in words (made by an admin, or the main name of a symptom alias).
-- Internal helper. Not callable from the app.
CREATE OR REPLACE FUNCTION public._visible_symptom_ids(_uid uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH builtin AS (
    SELECT together_norm(a.main_name) AS n FROM symptom_aliases a
  )
  SELECT cs.id
  FROM community_symptoms cs
  WHERE cs.added_by = _uid
     OR cs.submitted_by = _uid
     OR EXISTS (SELECT 1 FROM user_roles r
                WHERE r.user_id = cs.added_by AND r.role IN ('admin', 'super_admin'))
     OR together_canonical(cs.name) IN (SELECT n FROM builtin WHERE n IS NOT NULL)
$$;

-- The shared symptom list: approved, not deleted, no author columns.
CREATE OR REPLACE FUNCTION public.get_visible_symptoms()
RETURNS TABLE(id uuid, name text, category text, canonical_id uuid, aliases text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN QUERY
  SELECT cs.id, cs.name, cs.category, cs.canonical_id, cs.aliases
  FROM community_symptoms cs
  WHERE cs.status = 'approved'
    AND cs.deleted_at IS NULL
    AND cs.id IN (SELECT public._visible_symptom_ids(auth.uid()))
  ORDER BY cs.name;
END;
$$;

-- Name lookup used to resolve merged or retired words in old logs. Same visibility
-- rule, but includes merged and deprecated rows. Still no author columns.
CREATE OR REPLACE FUNCTION public.get_symptom_name_map()
RETURNS TABLE(id uuid, name text, status text, canonical_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN QUERY
  SELECT cs.id, cs.name, cs.status, cs.canonical_id
  FROM community_symptoms cs
  WHERE cs.status IN ('approved', 'merged', 'deprecated')
    AND cs.id IN (SELECT public._visible_symptom_ids(auth.uid()));
END;
$$;

REVOKE ALL ON FUNCTION public._visible_symptom_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._visible_symptom_ids(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_visible_symptoms() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_symptoms() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_symptom_name_map() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_symptom_name_map() TO authenticated, service_role;

-- Direct reads of the table: only her own rows (so insert ... returning still works),
-- admins see everything for moderation.
DROP POLICY IF EXISTS "Anyone authenticated can view community symptoms" ON public.community_symptoms;
DROP POLICY IF EXISTS "Approved symptoms are viewable" ON public.community_symptoms;
DROP POLICY IF EXISTS "Authenticated users can view community symptoms" ON public.community_symptoms;
DROP POLICY IF EXISTS "Users read own symptoms, admins read all" ON public.community_symptoms;
CREATE POLICY "Users read own symptoms, admins read all"
ON public.community_symptoms FOR SELECT
TO authenticated
USING (
  added_by = auth.uid()
  OR submitted_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

REVOKE ALL ON public.community_symptoms FROM anon;

-- ============================================================================
-- 2. admin_symptom_log_activity: daily totals only
-- ============================================================================
DROP FUNCTION IF EXISTS public.admin_symptom_log_activity(timestamptz, timestamptz);

CREATE FUNCTION public.admin_symptom_log_activity(
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS TABLE(day date, logs bigint, women bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT (s.logged_at AT TIME ZONE 'UTC')::date AS day,
         count(*)::bigint AS logs,
         count(DISTINCT s.user_id)::bigint AS women
  FROM symptom_logs s
  WHERE (_from IS NULL OR s.logged_at >= _from)
    AND (_to IS NULL OR s.logged_at <= _to)
  GROUP BY 1
  ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_symptom_log_activity(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_symptom_log_activity(timestamptz, timestamptz) TO authenticated, service_role;

-- ============================================================================
-- 3. Referrals
-- ============================================================================

-- get_referral_count(_user_id): only for yourself, or for an admin using the
-- "view as user" preview. Returns a count, nothing else.
CREATE OR REPLACE FUNCTION public.get_referral_count(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _user_id IS DISTINCT FROM auth.uid()
     AND NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN (SELECT count(*)::int FROM public.profiles WHERE referred_by = _user_id);
END;
$$;

-- Failed or successful code checks, kept only to rate-limit guessing.
CREATE TABLE IF NOT EXISTS public.referral_code_attempts (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_code_attempts_user_idx
  ON public.referral_code_attempts (user_id, attempted_at DESC);
ALTER TABLE public.referral_code_attempts ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: only the SECURITY DEFINER function below touches it.
REVOKE ALL ON public.referral_code_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.referral_code_attempts TO service_role;

-- resolve_referral_code: valid or invalid, never the owner's ID. 10 checks per hour.
-- The app only calls it after sign-in, so it stays signed-in only.
DROP FUNCTION IF EXISTS public.resolve_referral_code(text);

CREATE FUNCTION public.resolve_referral_code(_code text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _recent int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  DELETE FROM public.referral_code_attempts
  WHERE user_id = _uid AND attempted_at < now() - interval '1 day';

  SELECT count(*) INTO _recent
  FROM public.referral_code_attempts
  WHERE user_id = _uid AND attempted_at > now() - interval '1 hour';
  IF _recent >= 10 THEN
    RAISE EXCEPTION 'rate_limited: too many referral code checks, try again later';
  END IF;

  INSERT INTO public.referral_code_attempts (user_id) VALUES (_uid);

  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.referral_code = upper(btrim(_code)) AND p.id <> _uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_referral_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_referral_code(text) TO authenticated, service_role;

-- Attach the referrer on the server. The code comes from the account's own sign-up
-- metadata, never from the caller, so it cannot be used to guess other people's codes.
CREATE OR REPLACE FUNCTION public.apply_manual_referral_code()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _code text;
  _ref uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT upper(btrim(u.raw_user_meta_data ->> 'manual_referral_code')) INTO _code
  FROM auth.users u WHERE u.id = _uid;
  IF _code IS NULL OR _code = '' THEN RETURN false; END IF;

  SELECT p.id INTO _ref FROM public.profiles p WHERE p.referral_code = _code AND p.id <> _uid;
  IF _ref IS NULL THEN RETURN false; END IF;

  UPDATE public.profiles SET referred_by = _ref WHERE id = _uid AND referred_by IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_manual_referral_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_manual_referral_code() TO authenticated, service_role;

-- Also attach it the moment the profile is created, when the sign-up metadata is
-- already visible. If it is not, the function above covers it on first load.
CREATE OR REPLACE FUNCTION public.set_referred_by_from_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
  _ref uuid;
BEGIN
  IF NEW.referred_by IS NULL THEN
    SELECT upper(btrim(u.raw_user_meta_data ->> 'manual_referral_code')) INTO _code
    FROM auth.users u WHERE u.id = NEW.id;
    IF _code IS NOT NULL AND _code <> '' THEN
      SELECT p.id INTO _ref FROM public.profiles p WHERE p.referral_code = _code AND p.id <> NEW.id;
      IF _ref IS NOT NULL THEN NEW.referred_by := _ref; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_referred_by_from_signup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_referred_by_from_signup() TO service_role;

DROP TRIGGER IF EXISTS profiles_set_referred_by_from_signup ON public.profiles;
CREATE TRIGGER profiles_set_referred_by_from_signup
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_referred_by_from_signup();

-- get_tip_summary: checked, no change. It reads get_together_tips, which returns
-- text, label, vote counts and a "mine" flag, never an author ID.

-- ============================================================================
-- 4. short_links: anon and signed-in users see only slug and target_url
-- ============================================================================
DROP POLICY IF EXISTS "Anyone can read short links" ON public.short_links;
DROP POLICY IF EXISTS "Authenticated users can read short links" ON public.short_links;
REVOKE ALL ON public.short_links FROM anon;

DROP VIEW IF EXISTS public.short_links_public;
CREATE VIEW public.short_links_public
WITH (security_invoker = false) AS
  SELECT slug, target_url FROM public.short_links;

REVOKE ALL ON public.short_links_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.short_links_public TO anon, authenticated;
GRANT ALL ON public.short_links_public TO service_role;

-- ============================================================================
-- 5. Trigger helpers: no need for anon to be able to execute them directly
-- ============================================================================
DO $mig$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('assign_referral_code', 'clear_period_pending_on_period_update', 'set_participant_user_id')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$mig$;

-- ============================================================================
-- 6. Remove TRUNCATE and TRIGGER from anon and authenticated on every table
-- ============================================================================
DO $mig$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    BEGIN
      EXECUTE format('REVOKE TRUNCATE, TRIGGER ON %s FROM anon, authenticated', r.rel);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'Could not change grants on % (not owned by the migration role)', r.rel;
    END;
  END LOOP;

  -- Future tables too.
  BEGIN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER ON TABLES FROM anon, authenticated;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Could not change default privileges';
  END;
END
$mig$;
