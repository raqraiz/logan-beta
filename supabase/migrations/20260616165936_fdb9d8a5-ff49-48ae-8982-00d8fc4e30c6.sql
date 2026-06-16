-- Fix missing GRANTs on attribution_events so anon/authenticated INSERTs
-- actually reach the table through PostgREST. Without these, RLS policies
-- never even run and inserts fail with a permission error.
GRANT INSERT ON public.attribution_events TO anon, authenticated;
GRANT SELECT ON public.attribution_events TO authenticated;
GRANT ALL ON public.attribution_events TO service_role;