REVOKE ALL ON public.together_daily_pairs FROM anon, authenticated;
GRANT ALL ON public.together_daily_pairs TO service_role;