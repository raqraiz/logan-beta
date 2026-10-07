CREATE TABLE public.together_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  symptom text NOT NULL,
  text text NOT NULL,
  original_text text,
  label text NOT NULL DEFAULT 'Someone in Together',
  stage_key text,
  status text NOT NULL DEFAULT 'pending',
  reject_reason text,
  report_count integer NOT NULL DEFAULT 0,
  needs_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
GRANT SELECT, DELETE ON public.together_tips TO authenticated;
GRANT ALL ON public.together_tips TO service_role;
ALTER TABLE public.together_tips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authors see own tips" ON public.together_tips FOR SELECT TO authenticated USING (author_id = auth.uid());
CREATE POLICY "Authors delete own tips" ON public.together_tips FOR DELETE TO authenticated USING (author_id = auth.uid());
CREATE INDEX together_tips_symptom_idx ON public.together_tips (symptom, status);

CREATE TABLE public.together_tip_votes (
  tip_id uuid NOT NULL REFERENCES public.together_tips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tip_id, user_id)
);
GRANT SELECT, DELETE ON public.together_tip_votes TO authenticated;
GRANT ALL ON public.together_tip_votes TO service_role;
ALTER TABLE public.together_tip_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own votes read" ON public.together_tip_votes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own votes delete" ON public.together_tip_votes FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.together_tip_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tip_id uuid NOT NULL REFERENCES public.together_tips(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tip_id, reporter_id)
);
GRANT SELECT, DELETE ON public.together_tip_reports TO authenticated;
GRANT ALL ON public.together_tip_reports TO service_role;
ALTER TABLE public.together_tip_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own reports read" ON public.together_tip_reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());
CREATE POLICY "Own reports delete" ON public.together_tip_reports FOR DELETE TO authenticated USING (reporter_id = auth.uid());

-- Hidden authors: author ids are never readable by the client; only counts through functions.
CREATE TABLE public.together_tip_hidden_authors (
  user_id uuid NOT NULL,
  author_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, author_id)
);
GRANT DELETE ON public.together_tip_hidden_authors TO authenticated;
GRANT ALL ON public.together_tip_hidden_authors TO service_role;
ALTER TABLE public.together_tip_hidden_authors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own hidden delete" ON public.together_tip_hidden_authors FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_together_tips(_symptom text)
RETURNS TABLE(id uuid, text text, label text, same_stage boolean, helped integer, helped_by_me boolean, mine boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _stage text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT together_stage(p.life_stage, p.due_date, p.pregnancy_lmp, p.postpartum_start_date) INTO _stage
  FROM participants p WHERE p.user_id = auth.uid() ORDER BY p.created_at DESC LIMIT 1;
  RETURN QUERY
  SELECT t.id, t.text, t.label, (t.stage_key IS NOT NULL AND t.stage_key = _stage),
    (SELECT count(*)::int FROM together_tip_votes v WHERE v.tip_id = t.id),
    EXISTS (SELECT 1 FROM together_tip_votes v WHERE v.tip_id = t.id AND v.user_id = auth.uid()),
    t.author_id = auth.uid(), t.created_at
  FROM together_tips t
  WHERE together_canonical(t.symptom) = together_canonical(_symptom)
    AND t.status = 'approved' AND t.report_count < 3
    AND NOT EXISTS (SELECT 1 FROM together_tip_reports r WHERE r.tip_id = t.id AND r.reporter_id = auth.uid())
    AND NOT EXISTS (SELECT 1 FROM together_tip_hidden_authors h WHERE h.user_id = auth.uid() AND h.author_id = t.author_id);
END $$;

CREATE OR REPLACE FUNCTION public.toggle_tip_vote(_tip_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND together_consent) THEN RAISE EXCEPTION 'not_joined'; END IF;
  IF NOT EXISTS (SELECT 1 FROM together_tips WHERE id = _tip_id AND status = 'approved') THEN RAISE EXCEPTION 'not_found'; END IF;
  IF EXISTS (SELECT 1 FROM together_tip_votes WHERE tip_id = _tip_id AND user_id = auth.uid()) THEN
    DELETE FROM together_tip_votes WHERE tip_id = _tip_id AND user_id = auth.uid();
    RETURN false;
  END IF;
  INSERT INTO together_tip_votes (tip_id, user_id) VALUES (_tip_id, auth.uid());
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.report_tip(_tip_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _reason NOT IN ('unsafe','off_topic','advertising','other') THEN RAISE EXCEPTION 'bad_reason'; END IF;
  INSERT INTO together_tip_reports (tip_id, reporter_id, reason) VALUES (_tip_id, auth.uid(), _reason)
  ON CONFLICT (tip_id, reporter_id) DO NOTHING;
  IF FOUND THEN
    UPDATE together_tips SET report_count = report_count + 1, needs_review = true WHERE id = _tip_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.hide_tip_author(_tip_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO together_tip_hidden_authors (user_id, author_id)
  SELECT auth.uid(), t.author_id FROM together_tips t WHERE t.id = _tip_id AND t.author_id <> auth.uid()
  ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.count_hidden_tip_authors()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT count(*)::int FROM together_tip_hidden_authors WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_tip_summary(_symptom text)
RETURNS TABLE(tip_count integer, top_helped integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT count(*)::int, coalesce(max(helped), 0)::int FROM public.get_together_tips(_symptom);
$$;

CREATE OR REPLACE FUNCTION public.delete_my_tips()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  DELETE FROM together_tip_votes WHERE user_id = auth.uid();
  DELETE FROM together_tip_reports WHERE reporter_id = auth.uid();
  DELETE FROM together_tip_hidden_authors WHERE user_id = auth.uid();
  DELETE FROM together_tips WHERE author_id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.admin_tip_queue()
RETURNS TABLE(id uuid, symptom text, text text, label text, status text, report_count integer, reasons text[], created_at timestamptz, author_tip_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT t.id, t.symptom, t.text, t.label, t.status, t.report_count,
    ARRAY(SELECT r.reason FROM together_tip_reports r WHERE r.tip_id = t.id),
    t.created_at, (SELECT count(*)::int FROM together_tips t2 WHERE t2.author_id = t.author_id AND t2.status <> 'removed')
  FROM together_tips t WHERE t.status = 'pending' OR (t.needs_review AND t.status = 'approved')
  ORDER BY t.report_count DESC, t.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.admin_tip_totals()
RETURNS TABLE(status text, total bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT t.status, count(*) FROM together_tips t GROUP BY t.status;
END $$;

CREATE OR REPLACE FUNCTION public.admin_review_tip(_tip_id uuid, _action text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _author uuid; _n int;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _action = 'approve' THEN
    UPDATE together_tips SET status = 'approved', report_count = 0, needs_review = false, reviewed_at = now() WHERE id = _tip_id;
    DELETE FROM together_tip_reports WHERE tip_id = _tip_id;
    RETURN 1;
  ELSIF _action = 'remove' THEN
    UPDATE together_tips SET status = 'removed', needs_review = false, reviewed_at = now() WHERE id = _tip_id;
    RETURN 1;
  ELSIF _action = 'remove_author' THEN
    SELECT author_id INTO _author FROM together_tips WHERE id = _tip_id;
    UPDATE together_tips SET status = 'removed', needs_review = false, reviewed_at = now() WHERE author_id = _author AND status <> 'removed';
    GET DIAGNOSTICS _n = ROW_COUNT;
    RETURN _n;
  END IF;
  RAISE EXCEPTION 'bad_action';
END $$;

REVOKE EXECUTE ON FUNCTION public.get_together_tips(text), public.toggle_tip_vote(uuid), public.report_tip(uuid, text), public.hide_tip_author(uuid), public.count_hidden_tip_authors(), public.get_tip_summary(text), public.delete_my_tips(), public.admin_tip_queue(), public.admin_tip_totals(), public.admin_review_tip(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_together_tips(text), public.toggle_tip_vote(uuid), public.report_tip(uuid, text), public.hide_tip_author(uuid), public.count_hidden_tip_authors(), public.get_tip_summary(text), public.delete_my_tips(), public.admin_tip_queue(), public.admin_tip_totals(), public.admin_review_tip(uuid, text) TO authenticated;