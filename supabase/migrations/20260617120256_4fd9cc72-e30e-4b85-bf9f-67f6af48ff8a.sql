GRANT INSERT ON public.attribution_events TO anon, authenticated;
GRANT SELECT, UPDATE ON public.attribution_events TO authenticated;
GRANT ALL ON public.attribution_events TO service_role;