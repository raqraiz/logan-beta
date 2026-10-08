-- Security audit checks. Run AFTER applying 20261008120000_security_audit_fixes.sql.
-- Safe to run on any database: everything happens inside one transaction that is
-- rolled back at the end, and it creates only throwaway test users.
-- Each check prints "PASS: ..." or stops with an error naming the failed check.
-- Run as the database owner (the Supabase SQL editor works).

BEGIN;

-- ---------------------------------------------------------------- fixtures --
CREATE TEMP TABLE _ids AS SELECT
  gen_random_uuid() AS a, gen_random_uuid() AS b, gen_random_uuid() AS adm, gen_random_uuid() AS d;
GRANT SELECT ON _ids TO anon, authenticated;

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
SELECT x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'audit_' || x || '@example.invalid',
       CASE WHEN x = (SELECT d FROM _ids) THEN jsonb_build_object('manual_referral_code', 'AUDITAAA') ELSE '{}'::jsonb END
FROM _ids, LATERAL unnest(ARRAY[a, b, adm, d]) x;
-- (profiles may be created by a signup trigger; make sure each exists exactly once)
INSERT INTO public.profiles (id, email, full_name)
SELECT x, 'audit_' || x || '@example.invalid', 'Audit test' FROM _ids, LATERAL unnest(ARRAY[a, b, adm, d]) x
ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET referral_code = 'AUDITAAA' WHERE id = (SELECT a FROM _ids);
INSERT INTO public.user_roles (user_id, role) SELECT adm, 'admin' FROM _ids;

-- 12 women who agreed to Together, 12 who did not
CREATE TEMP TABLE _crowd AS SELECT gen_random_uuid() AS id, (g <= 12) AS consent FROM generate_series(1, 24) g;
INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'crowd_' || id || '@example.invalid' FROM _crowd;
INSERT INTO public.profiles (id, email, full_name)
SELECT id, 'crowd_' || id || '@example.invalid', 'Audit crowd' FROM _crowd ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET together_consent = true  WHERE id IN (SELECT id FROM _crowd WHERE consent);
UPDATE public.profiles SET together_consent = false WHERE id IN (SELECT id FROM _crowd WHERE NOT consent);

-- words (added_by is B for everything custom, so A can only see them via the 10-women rule)
INSERT INTO public.community_symptoms (name, added_by, submitted_by, status) VALUES
  ('zz audit private a',  (SELECT a FROM _ids), (SELECT a FROM _ids), 'approved'),
  ('zz audit private b',  (SELECT b FROM _ids), (SELECT b FROM _ids), 'approved'),
  ('zz audit builtin',    (SELECT adm FROM _ids), (SELECT adm FROM _ids), 'approved'),
  ('zz audit popular',    (SELECT b FROM _ids), (SELECT b FROM _ids), 'approved'),
  ('zz audit nine',       (SELECT b FROM _ids), (SELECT b FROM _ids), 'approved'),
  ('zz audit noconsent',  (SELECT b FROM _ids), (SELECT b FROM _ids), 'approved'),
  ('zz audit gone',       (SELECT adm FROM _ids), (SELECT adm FROM _ids), 'approved');
UPDATE public.community_symptoms SET deleted_at = now() WHERE name = 'zz audit gone';

-- logs: "popular" by 10 consenting women (one writes the plural variant), "nine" by 9,
-- "noconsent" by 12 women who did NOT consent.
INSERT INTO public.symptom_logs (user_id, logged_at, symptoms)
SELECT c.id, now() - interval '2 days',
       jsonb_build_array(CASE WHEN n = 1 THEN 'zz audit populars' ELSE 'zz audit popular' END)
FROM (SELECT id, row_number() OVER (ORDER BY id) n FROM _crowd WHERE consent) c WHERE n <= 10;
INSERT INTO public.symptom_logs (user_id, logged_at, symptoms)
SELECT c.id, now() - interval '2 days', jsonb_build_array('zz audit nine')
FROM (SELECT id, row_number() OVER (ORDER BY id) n FROM _crowd WHERE consent) c WHERE n <= 9;
INSERT INTO public.symptom_logs (user_id, logged_at, symptoms)
SELECT id, now() - interval '2 days', jsonb_build_array('zz audit noconsent') FROM _crowd WHERE NOT consent;

INSERT INTO public.short_links (slug, target_url, created_by) VALUES
  ('zzaudit1', 'https://example.invalid/one', (SELECT b FROM _ids));

-- ------------------------------------------------- 1. community_symptoms --
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT a::text FROM _ids), true),
       set_config('request.jwt.claims', json_build_object('sub', (SELECT a::text FROM _ids), 'role', 'authenticated')::text, true);
DO $t$
DECLARE names text[]; keys text[]; n int; nm text;
BEGIN
  -- direct table read: only her own rows
  SELECT count(*) INTO n FROM public.community_symptoms WHERE added_by <> auth.uid() AND submitted_by <> auth.uid();
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 1a: user A can read % rows that belong to other women', n; END IF;
  RAISE NOTICE 'PASS 1a: user A cannot read other women''s rows in community_symptoms directly';

  SELECT array_agg(name) INTO names FROM public.get_visible_symptoms();
  IF NOT ('zz audit private a' = ANY(names)) THEN RAISE EXCEPTION 'FAIL 1b: A cannot see her own word'; END IF;
  IF NOT ('zz audit builtin' = ANY(names)) THEN RAISE EXCEPTION 'FAIL 1c: built-in word missing'; END IF;
  IF NOT ('zz audit popular' = ANY(names)) THEN RAISE EXCEPTION 'FAIL 1d: word used by 10 consenting women (incl. a plural variant) should show'; END IF;
  IF 'zz audit private b' = ANY(names) THEN RAISE EXCEPTION 'FAIL 1e: B''s private word leaked to A'; END IF;
  IF 'zz audit nine' = ANY(names) THEN RAISE EXCEPTION 'FAIL 1f: word used by only 9 women leaked'; END IF;
  IF 'zz audit noconsent' = ANY(names) THEN RAISE EXCEPTION 'FAIL 1g: words from women without Together consent were counted'; END IF;
  IF 'zz audit gone' = ANY(names) THEN RAISE EXCEPTION 'FAIL 1h: deleted word returned'; END IF;
  RAISE NOTICE 'PASS 1b-h: get_visible_symptoms follows the own / built-in / 10-women / consent / deleted rules';

  SELECT array_agg(k ORDER BY k) INTO keys FROM (SELECT jsonb_object_keys(to_jsonb(v)) k FROM (SELECT * FROM public.get_visible_symptoms() LIMIT 1) v) s;
  IF keys IS DISTINCT FROM ARRAY['aliases','canonical_id','category','id','name'] THEN
    RAISE EXCEPTION 'FAIL 1i: get_visible_symptoms returns columns %', keys; END IF;
  RAISE NOTICE 'PASS 1i: get_visible_symptoms returns only id, name, category, canonical_id, aliases';

  -- inserting her own word and getting the name back still works
  INSERT INTO public.community_symptoms (name, added_by, submitted_by) VALUES ('zz audit inserted', auth.uid(), auth.uid()) RETURNING name INTO nm;
  RAISE NOTICE 'PASS 1j: insert ... returning still works for her own word';
END $t$;

-- user B must not see A's private word
SELECT set_config('request.jwt.claim.sub', (SELECT b::text FROM _ids), true),
       set_config('request.jwt.claims', json_build_object('sub', (SELECT b::text FROM _ids), 'role', 'authenticated')::text, true);
DO $t$
DECLARE names text[];
BEGIN
  SELECT array_agg(name) INTO names FROM public.get_visible_symptoms();
  IF 'zz audit private a' = ANY(names) THEN RAISE EXCEPTION 'FAIL 1k: A''s private word leaked to B'; END IF;
  IF NOT ('zz audit private b' = ANY(names)) THEN RAISE EXCEPTION 'FAIL 1l: B cannot see his own word'; END IF;
  RAISE NOTICE 'PASS 1k-l: user B cannot see user A''s private word';
END $t$;

-- ------------------------------------------------------------ 2. admin --
SELECT set_config('request.jwt.claim.sub', (SELECT a::text FROM _ids), true),
       set_config('request.jwt.claims', json_build_object('sub', (SELECT a::text FROM _ids), 'role', 'authenticated')::text, true);
DO $t$
BEGIN
  BEGIN
    PERFORM * FROM public.admin_symptom_log_activity();
    RAISE EXCEPTION 'FAIL 2a: a normal user could call admin_symptom_log_activity';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%not authorized%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS 2a: normal user is refused by admin_symptom_log_activity';
END $t$;

SELECT set_config('request.jwt.claim.sub', (SELECT adm::text FROM _ids), true),
       set_config('request.jwt.claims', json_build_object('sub', (SELECT adm::text FROM _ids), 'role', 'authenticated')::text, true);
DO $t$
DECLARE cols text[]; tot_logs bigint; tot_women bigint;
BEGIN
  SELECT array_agg(k ORDER BY k) INTO cols
  FROM (SELECT jsonb_object_keys(to_jsonb(v)) k FROM (SELECT * FROM public.admin_symptom_log_activity() LIMIT 1) v) s;
  IF cols IS DISTINCT FROM ARRAY['day','logs','women'] THEN
    RAISE EXCEPTION 'FAIL 2b: admin_symptom_log_activity returns columns % (expected day, logs, women)', cols; END IF;
  SELECT sum(logs), sum(women) INTO tot_logs, tot_women FROM public.admin_symptom_log_activity(now() - interval '3 days', now());
  IF tot_logs IS NULL OR tot_logs < 31 THEN RAISE EXCEPTION 'FAIL 2c: totals look wrong (%)', tot_logs; END IF;
  RAISE NOTICE 'PASS 2b-c: admin_symptom_log_activity returns daily totals only (day, logs, women), no user IDs';

  -- referral count: admin may look at someone else
  PERFORM public.get_referral_count((SELECT a FROM _ids));
  RAISE NOTICE 'PASS 3b: admin can use the view-as-user referral count';
END $t$;

-- ------------------------------------------------------- 3. referrals --
SELECT set_config('request.jwt.claim.sub', (SELECT b::text FROM _ids), true),
       set_config('request.jwt.claims', json_build_object('sub', (SELECT b::text FROM _ids), 'role', 'authenticated')::text, true);
DO $t$
BEGIN
  BEGIN
    PERFORM public.get_referral_count((SELECT a FROM _ids));
    RAISE EXCEPTION 'FAIL 3a: B read A''s referral count';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%not authorized%' THEN RAISE; END IF;
  END;
  PERFORM public.get_referral_count((SELECT b FROM _ids));
  RAISE NOTICE 'PASS 3a: a user cannot read another user''s referral count, can read her own';
END $t$;

SELECT set_config('request.jwt.claim.sub', (SELECT d::text FROM _ids), true),
       set_config('request.jwt.claims', json_build_object('sub', (SELECT d::text FROM _ids), 'role', 'authenticated')::text, true);
DO $t$
DECLARE i int; limited boolean := false; ref uuid;
BEGIN
  IF pg_typeof(public.resolve_referral_code('AUDITAAA'))::text <> 'boolean' THEN
    RAISE EXCEPTION 'FAIL 3c: resolve_referral_code must return boolean'; END IF;
  IF NOT public.resolve_referral_code('auditaaa') THEN RAISE EXCEPTION 'FAIL 3d: valid code reported invalid'; END IF;
  IF public.resolve_referral_code('NOSUCHCODE') THEN RAISE EXCEPTION 'FAIL 3e: bad code reported valid'; END IF;
  RAISE NOTICE 'PASS 3c-e: resolve_referral_code returns only valid / invalid';

  -- server-side attach from the account's own sign-up metadata
  IF NOT public.apply_manual_referral_code() THEN RAISE EXCEPTION 'FAIL 3f: referrer was not attached'; END IF;
  SELECT referred_by INTO ref FROM public.profiles WHERE id = auth.uid();
  IF ref IS DISTINCT FROM (SELECT a FROM _ids) THEN RAISE EXCEPTION 'FAIL 3g: wrong referrer attached'; END IF;
  RAISE NOTICE 'PASS 3f-g: referrer attached on the server from sign-up metadata';

  FOR i IN 1..12 LOOP
    BEGIN
      PERFORM public.resolve_referral_code('GUESS' || i);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'rate_limited%' THEN limited := true; EXIT; ELSE RAISE; END IF;
    END;
  END LOOP;
  IF NOT limited THEN RAISE EXCEPTION 'FAIL 3h: no rate limit on referral code checks'; END IF;
  RAISE NOTICE 'PASS 3h: referral code checks are rate limited';
END $t$;

-- ------------------------------------------------------- 4. short_links --
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
DO $t$
DECLARE n int; keys text[];
BEGIN
  BEGIN
    PERFORM created_by FROM public.short_links;
    RAISE EXCEPTION 'FAIL 4a: anon can read short_links.created_by';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM slug FROM public.short_links;
    RAISE EXCEPTION 'FAIL 4b: anon can read the short_links table directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS 4a-b: anon cannot read created_by (or anything) on short_links';

  SELECT array_agg(k ORDER BY k) INTO keys
  FROM (SELECT jsonb_object_keys(to_jsonb(v)) k FROM (SELECT * FROM public.short_links_public LIMIT 1) v) s;
  IF keys IS DISTINCT FROM ARRAY['slug','target_url'] THEN RAISE EXCEPTION 'FAIL 4c: public view exposes %', keys; END IF;
  SELECT count(*) INTO n FROM public.short_links_public WHERE slug = 'zzaudit1' AND target_url = 'https://example.invalid/one';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 4d: redirect lookup by slug does not work for anon'; END IF;
  RAISE NOTICE 'PASS 4c-d: anon sees only slug + target_url, and redirect lookups work';

  BEGIN
    PERFORM public.get_visible_symptoms();
    RAISE EXCEPTION 'FAIL 4e: anon can run get_visible_symptoms';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM * FROM public.community_symptoms;
    RAISE EXCEPTION 'FAIL 4f: anon can read community_symptoms';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS 4e-f: anon cannot read community_symptoms or run the symptom functions';
END $t$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT a::text FROM _ids), true),
       set_config('request.jwt.claims', json_build_object('sub', (SELECT a::text FROM _ids), 'role', 'authenticated')::text, true);
DO $t$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.short_links WHERE created_by IS DISTINCT FROM auth.uid();
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 4g: a signed-in non-admin can read other people''s short_links rows'; END IF;
  SELECT count(*) INTO n FROM public.short_links_public WHERE slug = 'zzaudit1';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 4h: signed-in redirect lookup broken'; END IF;
  RAISE NOTICE 'PASS 4g-h: signed-in users cannot read created_by of others, redirects still work';
END $t$;

-- --------------------------------------------- 5. TRUNCATE / TRIGGER gone --
RESET ROLE;
DO $t$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.relname || ' (' || r || ')', ', ') INTO bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, unnest(ARRAY['anon', 'authenticated']) r
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND (has_table_privilege(r, c.oid, 'TRUNCATE') OR has_table_privilege(r, c.oid, 'TRIGGER'));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL 5: TRUNCATE/TRIGGER still granted on %', bad; END IF;
  RAISE NOTICE 'PASS 5: no TRUNCATE or TRIGGER for anon/authenticated on any public table';
END $t$;

ROLLBACK;
