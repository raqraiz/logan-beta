-- Link click counting. Each click on a short link is logged with its date and slug only.
-- Nothing about the visitor is stored: no IP, no user agent, no user ID.
-- Safe to re-run.

-- ============================================================================
-- 1. Click log. Not readable or writable directly; only through record_link_click (write)
--    and the admin totals functions below (read).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.link_clicks (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL,
  clicked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS link_clicks_slug_time_idx ON public.link_clicks (slug, clicked_at);
ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;      -- no policies = no direct access
REVOKE ALL ON public.link_clicks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.link_clicks TO service_role;

-- ============================================================================
-- 2. When counting started. The existing settings row gets "now" (the day this is applied).
-- ============================================================================
ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS link_clicks_since timestamptz NOT NULL DEFAULT now();

-- ============================================================================
-- 3. The only way in. Callable by anyone, returns nothing.
--    Counts one click only if the slug is a real short link.
--    Rate limit is per link, not per visitor (so nothing about visitors is stored):
--    at most 60 counted clicks per link per minute; extra clicks are quietly ignored.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_link_click(_slug text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _slug IS NULL OR length(_slug) > 100 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM short_links l WHERE l.slug = _slug) THEN RETURN; END IF;
  IF (SELECT count(*) FROM link_clicks c
       WHERE c.slug = _slug AND c.clicked_at > now() - interval '1 minute') >= 60 THEN RETURN; END IF;
  INSERT INTO link_clicks (slug) VALUES (_slug);
END $$;
REVOKE ALL ON FUNCTION public.record_link_click(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_link_click(text) TO anon, authenticated, service_role;

-- ============================================================================
-- 4. TODAY: "Needs you" counts. Same as before, but link clicks now come from link_clicks (all time since counting
--    started) and the start date is returned. Message failures, clicks and start date are NULL for plain admins.
-- ============================================================================
DROP FUNCTION IF EXISTS public.admin_needs_you();
CREATE FUNCTION public.admin_needs_you()
RETURNS TABLE(new_feedback bigint, tips_waiting bigint, tips_reported bigint, message_failures_7d bigint,
              new_referrers_week bigint, link_clicks_total bigint, link_count bigint, click_counting_since timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE sup boolean := has_role(auth.uid(), 'super_admin');
        wk date := date_trunc('week', now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR sup) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT (SELECT count(*) FROM user_feedback f WHERE f.created_at >= now() - interval '7 days')::bigint,
         (SELECT count(*) FROM together_tips t WHERE t.status = 'pending')::bigint,
         (SELECT count(*) FROM together_tips t WHERE t.status = 'approved' AND t.needs_review)::bigint,
         CASE WHEN sup THEN (SELECT count(*) FROM message_failures m WHERE m.created_at >= now() - interval '7 days')::bigint END,
         (SELECT count(DISTINCT o.referred_by) FROM public._admin_onboarded_users() o
           WHERE o.referred_by IS NOT NULL AND (o.onboarded_at AT TIME ZONE 'UTC')::date >= wk)::bigint,
         CASE WHEN sup THEN (SELECT count(*) FROM link_clicks)::bigint END,
         CASE WHEN sup THEN (SELECT count(*) FROM short_links l)::bigint END,
         CASE WHEN sup THEN (SELECT s.link_clicks_since FROM admin_settings s) END;
END $$;
REVOKE ALL ON FUNCTION public.admin_needs_you() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_needs_you() TO authenticated, service_role;

-- ============================================================================
-- 5. GROWTH (super admin only): where signups came from. Clicks now count link_clicks inside the selected dates
--    (UTC days). Still NULL when a life stage is chosen. Everything else is unchanged.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_signup_sources(_from date, _to date, _by text, _stage text DEFAULT NULL)
RETURNS TABLE(source text, clicks bigint, signups bigint, active_14d_base bigint, active_14d bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _by NOT IN ('campaign', 'channel') THEN RAISE EXCEPTION 'invalid grouping'; END IF;
  IF _stage IS NOT NULL AND _stage NOT IN ('pregnant','postpartum','bc_hormonal','irregular','menopausal','regular','not_set') THEN RAISE EXCEPTION 'invalid stage'; END IF;
  IF _to IS NULL OR (_from IS NOT NULL AND (_to < _from OR _to - _from > 3660)) THEN RAISE EXCEPTION 'invalid range'; END IF;
  RETURN QUERY
  WITH u AS (
    SELECT o.user_id, o.onboarded_at,
           CASE WHEN _by = 'channel' THEN COALESCE(o.utm_source, '(direct / none)') ELSE COALESCE(o.utm_campaign, '(direct / none)') END AS k
    FROM public._admin_onboarded_users() o
    WHERE (_stage IS NULL OR o.stage = _stage)
      AND (_from IS NULL OR (o.onboarded_at AT TIME ZONE 'UTC')::date >= _from)
      AND (o.onboarded_at AT TIME ZONE 'UTC')::date <= _to
  ), ev AS (
    SELECT e.user_id, e.ts FROM public._admin_user_events((SELECT min(u.onboarded_at) FROM u), NULL) e
    WHERE e.user_id IN (SELECT u.user_id FROM u)
  ), s AS (
    SELECT u.k, count(*) AS signups,
           count(*) FILTER (WHERE u.onboarded_at + interval '15 days' <= now()) AS base,
           count(*) FILTER (WHERE u.onboarded_at + interval '15 days' <= now() AND EXISTS (
             SELECT 1 FROM ev WHERE ev.user_id = u.user_id
               AND (ev.ts AT TIME ZONE 'UTC')::date > (u.onboarded_at AT TIME ZONE 'UTC')::date
               AND (ev.ts AT TIME ZONE 'UTC')::date <= (u.onboarded_at AT TIME ZONE 'UTC')::date + 14)) AS act
    FROM u GROUP BY u.k
  ), c AS (
    SELECT CASE WHEN _by = 'channel' THEN COALESCE(lower(nullif(btrim(l.utm_source), '')), '(direct / none)')
                ELSE COALESCE(lower(nullif(btrim(l.utm_campaign), '')), '(direct / none)') END AS k,
           count(*)::bigint AS clicks
    FROM link_clicks lc
    JOIN short_links l ON l.slug = lc.slug
    WHERE (_from IS NULL OR (lc.clicked_at AT TIME ZONE 'UTC')::date >= _from)
      AND (lc.clicked_at AT TIME ZONE 'UTC')::date <= _to
    GROUP BY 1
  )
  SELECT COALESCE(s.k, c.k),
         CASE WHEN _stage IS NULL THEN COALESCE(c.clicks, 0) END,
         public._admin_small(COALESCE(s.signups, 0), _stage IS NOT NULL),
         public._admin_small(COALESCE(s.base, 0), _stage IS NOT NULL),
         public._admin_small(COALESCE(s.act, 0), _stage IS NOT NULL)
  FROM s FULL JOIN c ON c.k = s.k
  ORDER BY COALESCE(s.signups, 0) DESC, 1;
END $$;

-- ============================================================================
-- 6. GROWTH (super admin only): campaign links list. Now takes the date range; clicks are counted inside it.
--    Signups logic is unchanged. The old no-argument version is removed.
-- ============================================================================
DROP FUNCTION IF EXISTS public.admin_campaign_links();
CREATE FUNCTION public.admin_campaign_links(_from date, _to date)
RETURNS TABLE(slug text, target_url text, utm_campaign text, utm_source text, utm_medium text,
              clicks bigint, signups bigint, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _to IS NULL OR (_from IS NOT NULL AND (_to < _from OR _to - _from > 3660)) THEN RAISE EXCEPTION 'invalid range'; END IF;
  RETURN QUERY
  WITH o AS (SELECT x.utm_campaign, x.utm_source, x.utm_medium FROM public._admin_onboarded_users() x
             WHERE x.utm_campaign IS NOT NULL)
  SELECT l.slug, l.target_url, l.utm_campaign, l.utm_source, l.utm_medium,
         (SELECT count(*) FROM link_clicks lc
           WHERE lc.slug = l.slug
             AND (_from IS NULL OR (lc.clicked_at AT TIME ZONE 'UTC')::date >= _from)
             AND (lc.clicked_at AT TIME ZONE 'UTC')::date <= _to)::bigint,
         (SELECT count(*) FROM o
           WHERE o.utm_campaign = COALESCE(lower(btrim(l.utm_campaign)), '')
             AND COALESCE(o.utm_source, '') = COALESCE(lower(btrim(l.utm_source)), '')
             AND COALESCE(o.utm_medium, '') = COALESCE(lower(btrim(l.utm_medium)), ''))::bigint,
         l.created_at
  FROM short_links l ORDER BY l.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_campaign_links(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_campaign_links(date, date) TO authenticated, service_role;
